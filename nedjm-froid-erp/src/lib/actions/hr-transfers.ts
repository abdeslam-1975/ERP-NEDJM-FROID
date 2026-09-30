"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireHrSalaryValues } from "@/lib/auth/require-roles";
import { createClient } from "@/lib/supabase/server";
import { listPayrollSlips } from "@/lib/actions/hr-ops";
import { getHrBulletinSettings } from "@/lib/actions/hr-bulletin";
import {
  buildReconciliationCsv,
  buildTransferFile,
  selectTransferLines,
  type TransferIssue,
  type TransferLine,
  type TransferMode,
} from "@/lib/hr/payroll-transfers";
import { periodNatureOf, transferReasonLabel } from "@/lib/hr/external-operations";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export type TransferBatchStatus = "GENERATED" | "DEPOSITED" | "EXECUTED" | "CANCELLED";

export type TransferBatchRow = {
  id: string;
  batch_no: string;
  period_year: number;
  period_month: number;
  site_id: string | null;
  site_name: string | null;
  mode: TransferMode;
  file_format: string;
  file_name: string;
  sha256: string;
  line_count: number;
  total_amount: number;
  debit_account: string | null;
  value_date: string | null;
  status_code: TransferBatchStatus;
  deposit_ref: string | null;
  deposit_date: string | null;
  executed_at: string | null;
  cancelled_reason: string | null;
  notes: string | null;
  created_at: string;
  creator_name: string | null;
  depositor_name: string | null;
  decision_id: string | null;
  double_payment_risk: boolean;
};

export type BlockedTransferLine = TransferLine & { reasons: string[] };

export type TransferPreview = {
  lines: TransferLine[];
  issues: TransferIssue[];
  total: number;
  skippedDraft: number;
  skippedBatched: number;
  period_nature: "EXTERNAL" | "OPERATIONAL";
  /** Slips the database refuses without a D9 decision (reprise, already paid, external payment). */
  blocked: BlockedTransferLine[];
  blockedIssues: TransferIssue[];
  blockedTotal: number;
};

export type TransferDecisionRow = {
  id: string;
  status: string;
  chosen_option: string | null;
  mode: string;
  site_id: string | null;
  slip_ids: string[];
  slip_count: number;
  net_total: number;
  requested_at: string;
  closed_reason: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidateTransfers() {
  revalidatePath("/rh/paie/virements");
  revalidatePath("/decisions");
}

function validPeriod(year: number, month: number) {
  return Number.isInteger(year) && year >= 2000 && year <= 2100 && Number.isInteger(month) && month >= 1 && month <= 12;
}

export async function listTransferBatches(input: { year: number; month: number }): Promise<ActionResult<TransferBatchRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_payroll_transfer_batches")
    .select(
      `id, batch_no, period_year, period_month, site_id, mode, file_format, file_name, sha256, line_count,
       total_amount, debit_account, value_date, status_code, deposit_ref, deposit_date, executed_at,
       cancelled_reason, notes, created_at, decision_id, double_payment_risk,
       site:ref_sites ( name_fr ),
       creator:sys_users!created_by ( full_name ),
       depositor:sys_users!deposited_by ( full_name )`,
    )
    .eq("period_year", input.year)
    .eq("period_month", input.month)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v) ?? null;
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: r.id,
      batch_no: r.batch_no,
      period_year: r.period_year,
      period_month: r.period_month,
      site_id: r.site_id,
      site_name: one(r.site)?.name_fr ?? null,
      mode: r.mode as TransferMode,
      file_format: r.file_format,
      file_name: r.file_name,
      sha256: r.sha256,
      line_count: r.line_count,
      total_amount: Number(r.total_amount),
      debit_account: r.debit_account,
      value_date: r.value_date,
      status_code: r.status_code as TransferBatchStatus,
      deposit_ref: r.deposit_ref,
      deposit_date: r.deposit_date,
      executed_at: r.executed_at,
      cancelled_reason: r.cancelled_reason,
      notes: r.notes,
      created_at: r.created_at,
      creator_name: one(r.creator)?.full_name ?? null,
      depositor_name: one(r.depositor)?.full_name ?? null,
      decision_id: r.decision_id ?? null,
      double_payment_risk: r.double_payment_risk === true,
    })),
  };
}

async function computePreview(input: {
  year: number;
  month: number;
  mode: TransferMode;
  site_id?: string | null;
}): Promise<ActionResult<TransferPreview>> {
  const slips = await listPayrollSlips({ year: input.year, month: input.month });
  if (!slips.ok) return slips;
  const scoped = slips.data.filter((s) => !input.site_id || s.site_id === input.site_id);
  const supabase = await createClient();
  const ids = scoped.map((s) => s.id);
  const pending = new Set<string>();
  const executed = new Set<string>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await supabase
      .from("hr_payroll_transfer_lines")
      .select("slip_id, batch:hr_payroll_transfer_batches ( status_code )")
      .eq("is_live", true)
      .in("slip_id", ids.slice(i, i + 300));
    if (error) return { ok: false, error: error.message };
    for (const r of data ?? []) {
      const b = Array.isArray(r.batch) ? r.batch[0] : r.batch;
      if (b?.status_code === "EXECUTED") executed.add(r.slip_id);
      else pending.add(r.slip_id);
    }
  }
  const reasons = new Map<string, string[]>();
  const payable = scoped.filter((s) => s.status_code !== "DRAFT").map((s) => s.id);
  for (let i = 0; i < payable.length; i += 1000) {
    const { data, error } = await supabase.rpc("hr_transfer_block_reasons", { p_slips: payable.slice(i, i + 1000) });
    if (error) return { ok: false, error: error.message };
    for (const r of (data ?? []) as { slip_id: string; reasons: string[] | null }[]) {
      if (r.reasons?.length) reasons.set(r.slip_id, r.reasons);
    }
  }
  const ordinary = selectTransferLines(
    scoped.filter((s) => !reasons.has(s.id)),
    input.mode,
    new Set([...pending, ...executed]),
  );
  const blocked = selectTransferLines(
    scoped.filter((s) => reasons.has(s.id)),
    input.mode,
    pending,
  );
  return {
    ok: true,
    data: {
      ...ordinary,
      period_nature: periodNatureOf(input.year, input.month),
      blocked: blocked.lines.map((l) => ({ ...l, reasons: reasons.get(l.slip_id) ?? [] })),
      blockedIssues: blocked.issues,
      blockedTotal: blocked.total,
    },
  };
}

export async function previewTransferBatch(input: {
  year: number;
  month: number;
  mode: TransferMode;
  site_id?: string | null;
}): Promise<ActionResult<TransferPreview>> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  if (!validPeriod(input.year, input.month)) return { ok: false, error: "Période invalide." };
  if (input.mode !== "CCP" && input.mode !== "BANK") return { ok: false, error: "Mode invalide." };
  if (input.site_id && !UUID_RE.test(input.site_id)) return { ok: false, error: "Chantier invalide." };
  return computePreview(input);
}

/** Creates the batch and its lines in one database transaction; a D9 batch consumes its decision. */
export async function createTransferBatch(input: {
  year: number;
  month: number;
  mode: TransferMode;
  site_id?: string | null;
  debit_account?: string;
  value_date?: string;
  notes?: string;
  decision_id?: string | null;
}): Promise<ActionResult<{ id: string; batch_no: string; count: number; total: number }>> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  if (!validPeriod(input.year, input.month)) return { ok: false, error: "Période invalide." };
  if (input.mode !== "CCP" && input.mode !== "BANK") return { ok: false, error: "Mode invalide." };
  if (input.site_id && !UUID_RE.test(input.site_id)) return { ok: false, error: "Chantier invalide." };
  if (input.decision_id && !UUID_RE.test(input.decision_id)) return { ok: false, error: "Décision invalide." };
  const valueDate = /^\d{4}-\d{2}-\d{2}$/.test(input.value_date ?? "")
    ? (input.value_date as string)
    : new Date().toISOString().slice(0, 10);

  const supabase = await createClient();
  let scopeIds: Set<string> | null = null;
  if (input.decision_id) {
    const { data: d, error: dErr } = await supabase
      .from("sys_decisions")
      .select("type_code, status, chosen_option, scope")
      .eq("id", input.decision_id)
      .maybeSingle();
    if (dErr) return { ok: false, error: dErr.message };
    const scope = (d?.scope ?? {}) as { year?: number; month?: number; site_id?: string | null; mode?: string; slip_ids?: string[] };
    if (!d || d.type_code !== "D9" || d.status !== "DECIDED" || d.chosen_option !== "REAL_BATCH") {
      return { ok: false, error: "Décision D9 « lot de virement réel » requise (décidée, non encore utilisée)." };
    }
    if (
      scope.year !== input.year ||
      scope.month !== input.month ||
      scope.mode !== input.mode ||
      (scope.site_id ?? null) !== (input.site_id || null)
    ) {
      return { ok: false, error: "Lot différent du périmètre de la décision D9 (mois, chantier ou mode)." };
    }
    scopeIds = new Set(scope.slip_ids ?? []);
  }

  const preview = await computePreview(input);
  if (!preview.ok) return preview;
  let lines: TransferLine[];
  if (scopeIds) {
    lines = preview.data.blocked
      .filter((l) => scopeIds.has(l.slip_id))
      .map((l) => ({
        slip_id: l.slip_id,
        employee_id: l.employee_id,
        matricule: l.matricule,
        employee_name: l.employee_name,
        account: l.account,
        amount: l.amount,
      }));
    if (lines.length !== scopeIds.size) {
      return {
        ok: false,
        error:
          "Certains bulletins de la décision D9 ne peuvent plus être virés (compte manquant, déjà en lot ou débloqués) : la décision n'a pas été utilisée.",
      };
    }
  } else {
    lines = preview.data.lines;
    if (!lines.length) {
      return {
        ok: false,
        error: "Aucun bulletin virable par un lot ordinaire pour ce mode (déjà en lot, brouillon, compte manquant ou bloqué D9).",
      };
    }
  }

  const { data: batchNo, error: numErr } = await supabase.rpc("hr_next_doc_number", { p_prefix: "VIR" });
  if (numErr || typeof batchNo !== "string") return { ok: false, error: numErr?.message ?? "Numérotation impossible." };

  const settings = await getHrBulletinSettings();
  const employerName = (settings.ok ? settings.data.employer_name : "") || "NEDJM FROID";
  const mm = String(input.month).padStart(2, "0");
  const file = buildTransferFile({
    mode: input.mode,
    batchNo,
    employerName,
    debitAccount: input.debit_account ?? "",
    valueDate,
    label: `SALAIRE ${mm}/${input.year}`,
    lines,
  });
  const sha256 = createHash("sha256").update(file.content, "utf8").digest("hex");

  const { data, error } = await supabase.rpc("hr_transfer_batch_create", {
    p_batch: {
      batch_no: batchNo,
      period_year: input.year,
      period_month: input.month,
      site_id: input.site_id || null,
      mode: input.mode,
      file_format: file.format,
      file_name: file.fileName,
      content: file.content,
      sha256,
      line_count: file.count,
      total_amount: file.total,
      debit_account: input.debit_account?.trim() || null,
      value_date: valueDate,
      notes: input.notes?.trim() || null,
    },
    p_lines: lines,
    p_decision: input.decision_id || null,
  });
  revalidateTransfers();
  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? "Un bulletin vient d'être inclus dans un autre lot : régénérez." : error.message,
    };
  }
  const r = (data ?? {}) as { ok?: boolean; id?: string; reason?: string };
  if (r.ok !== true || !r.id) {
    return {
      ok: false,
      error:
        r.reason === "INVALIDATED"
          ? "Les données ont changé depuis la décision D9 (bulletins, virements ou opérations externes) : elle est invalidée, aucun lot n'a été créé. Une nouvelle demande est nécessaire."
          : "Création du lot refusée.",
    };
  }
  return { ok: true, data: { id: r.id, batch_no: batchNo, count: file.count, total: file.total } };
}

export async function setTransferBatchStatus(input: {
  id: string;
  status: TransferBatchStatus;
  deposit_ref?: string;
  deposit_date?: string;
  reason?: string;
}): Promise<ActionResult> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  if (!UUID_RE.test(input.id)) return { ok: false, error: "Lot invalide." };
  const patch: Record<string, unknown> = { status_code: input.status };
  if (input.status === "DEPOSITED") {
    patch.deposit_ref = input.deposit_ref?.trim() || null;
    patch.deposit_date = /^\d{4}-\d{2}-\d{2}$/.test(input.deposit_date ?? "") ? input.deposit_date : null;
  }
  if (input.status === "CANCELLED") patch.cancelled_reason = input.reason?.trim() || null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_payroll_transfer_batches")
    .update(patch)
    .eq("id", input.id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Mise à jour refusée." };
  revalidateTransfers();
  return { ok: true, data: undefined };
}

export async function listTransferLines(batchId: string): Promise<ActionResult<TransferLine[]>> {
  if (!UUID_RE.test(batchId)) return { ok: false, error: "Lot invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_payroll_transfer_lines")
    .select("slip_id, employee_id, matricule, employee_name, account, amount")
    .eq("batch_id", batchId)
    .order("matricule");
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map((l) => ({ ...l, amount: Number(l.amount) })) };
}

export async function requestTransferDecision(input: {
  year: number;
  month: number;
  mode: TransferMode;
  site_id?: string | null;
  slip_ids: string[];
  reason: string;
}): Promise<ActionResult<{ id: string }>> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  if (!validPeriod(input.year, input.month)) return { ok: false, error: "Période invalide." };
  if (input.mode !== "CCP" && input.mode !== "BANK") return { ok: false, error: "Mode invalide." };
  if (input.site_id && !UUID_RE.test(input.site_id)) return { ok: false, error: "Chantier invalide." };
  if (!Array.isArray(input.slip_ids) || !input.slip_ids.length || input.slip_ids.length > 2000 || !input.slip_ids.every((s) => UUID_RE.test(s))) {
    return { ok: false, error: "Liste de bulletins invalide." };
  }
  const reason = (input.reason ?? "").trim();
  if (reason.length < 10 || reason.length > 500) return { ok: false, error: "Motif de la demande obligatoire (10 à 500 caractères)." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_transfer_request_d9", {
    p_year: input.year,
    p_month: input.month,
    p_site: input.site_id || null,
    p_mode: input.mode,
    p_slips: input.slip_ids,
    p_reason: reason,
  });
  revalidateTransfers();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: String(data) } };
}

export async function listTransferDecisions(input: { year: number; month: number }): Promise<ActionResult<TransferDecisionRow[]>> {
  if (!validPeriod(input.year, input.month)) return { ok: false, error: "Période invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sys_decisions")
    .select("id, status, chosen_option, scope, context, requested_at, closed_reason")
    .eq("type_code", "D9")
    .eq("period_year", input.year)
    .eq("period_month", input.month)
    .order("requested_at", { ascending: false })
    .limit(50);
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((d) => {
      const scope = (d.scope ?? {}) as { mode?: string; site_id?: string | null; slip_ids?: string[] };
      const ctx = (d.context ?? {}) as { slip_count?: number; net_total?: number };
      return {
        id: d.id,
        status: d.status,
        chosen_option: d.chosen_option,
        mode: scope.mode ?? "",
        site_id: scope.site_id ?? null,
        slip_ids: scope.slip_ids ?? [],
        slip_count: Number(ctx.slip_count ?? scope.slip_ids?.length ?? 0),
        net_total: Number(ctx.net_total ?? 0),
        requested_at: d.requested_at,
        closed_reason: d.closed_reason,
      };
    }),
  };
}

/** D9 « état de rapprochement »: consumes the decision and returns a control statement (not a payment order). */
export async function produceTransferReconciliation(
  decisionId: string,
): Promise<ActionResult<{ fileName: string; content: string }>> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  if (!UUID_RE.test(decisionId)) return { ok: false, error: "Décision invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_transfer_d9_reconciliation", { p_decision: decisionId });
  revalidateTransfers();
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as {
    ok?: boolean;
    reason?: string;
    period?: string;
    site_name?: string;
    mode?: string;
    generated_at?: string;
    rows?: { matricule?: string; employee?: string; net_payable?: number; transferred?: number; reasons?: string[] }[];
    external_operations?: unknown[];
  };
  if (r.ok !== true) {
    return {
      ok: false,
      error:
        r.reason === "INVALIDATED"
          ? "Les données ont changé depuis la décision D9 : elle est invalidée, aucun état n'a été produit."
          : "État de rapprochement refusé.",
    };
  }
  const content = buildReconciliationCsv({
    period: r.period ?? "",
    siteName: r.site_name ?? "",
    mode: r.mode ?? "",
    decisionId,
    generatedAt: r.generated_at ?? new Date().toISOString(),
    externalCount: Array.isArray(r.external_operations) ? r.external_operations.length : 0,
    reasonLabel: transferReasonLabel,
    rows: (r.rows ?? []).map((x) => ({
      matricule: String(x.matricule ?? ""),
      employee: String(x.employee ?? ""),
      net_payable: Number(x.net_payable ?? 0),
      transferred: Number(x.transferred ?? 0),
      reasons: Array.isArray(x.reasons) ? x.reasons.map(String) : [],
    })),
  });
  const period = (r.period ?? "").replace(/[^0-9A-Za-z]+/g, "-");
  return { ok: true, data: { fileName: `ETAT_RAPPROCHEMENT_NON_BANCAIRE_${period}_${decisionId.slice(0, 8)}.csv`, content } };
}
