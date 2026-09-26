"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireHrSalaryValues } from "@/lib/auth/require-roles";
import { createClient } from "@/lib/supabase/server";
import { listPayrollSlips } from "@/lib/actions/hr-ops";
import { getHrBulletinSettings } from "@/lib/actions/hr-bulletin";
import {
  buildTransferFile,
  selectTransferLines,
  type TransferIssue,
  type TransferLine,
  type TransferMode,
} from "@/lib/hr/payroll-transfers";

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
};

export type TransferPreview = {
  lines: TransferLine[];
  issues: TransferIssue[];
  total: number;
  skippedDraft: number;
  skippedBatched: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidateTransfers() {
  revalidatePath("/rh/paie/virements");
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
       cancelled_reason, notes, created_at,
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
  const batched = new Set<string>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await supabase
      .from("hr_payroll_transfer_lines")
      .select("slip_id")
      .eq("is_live", true)
      .in("slip_id", ids.slice(i, i + 300));
    if (error) return { ok: false, error: error.message };
    for (const r of data ?? []) batched.add(r.slip_id);
  }
  return { ok: true, data: selectTransferLines(scoped, input.mode, batched) };
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

export async function createTransferBatch(input: {
  year: number;
  month: number;
  mode: TransferMode;
  site_id?: string | null;
  debit_account?: string;
  value_date?: string;
  notes?: string;
}): Promise<ActionResult<{ id: string; batch_no: string; count: number; total: number }>> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  if (!validPeriod(input.year, input.month)) return { ok: false, error: "Période invalide." };
  if (input.mode !== "CCP" && input.mode !== "BANK") return { ok: false, error: "Mode invalide." };
  if (input.site_id && !UUID_RE.test(input.site_id)) return { ok: false, error: "Chantier invalide." };
  const valueDate = /^\d{4}-\d{2}-\d{2}$/.test(input.value_date ?? "")
    ? (input.value_date as string)
    : new Date().toISOString().slice(0, 10);

  const preview = await computePreview(input);
  if (!preview.ok) return preview;
  if (!preview.data.lines.length) {
    return { ok: false, error: "Aucun bulletin validé à virer pour ce mode (déjà en lot, brouillon ou compte manquant)." };
  }

  const supabase = await createClient();
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
    lines: preview.data.lines,
  });
  const sha256 = createHash("sha256").update(file.content, "utf8").digest("hex");

  const { data: batch, error } = await supabase
    .from("hr_payroll_transfer_batches")
    .insert({
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
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const { error: lineErr } = await supabase.from("hr_payroll_transfer_lines").insert(
    preview.data.lines.map((l) => ({ ...l, batch_id: batch.id })),
  );
  if (lineErr) {
    await supabase
      .from("hr_payroll_transfer_batches")
      .update({ status_code: "CANCELLED", cancelled_reason: `Échec lignes : ${lineErr.message}`.slice(0, 300) })
      .eq("id", batch.id);
    return {
      ok: false,
      error: lineErr.code === "23505" ? "Un bulletin vient d'être inclus dans un autre lot : régénérez." : lineErr.message,
    };
  }
  revalidateTransfers();
  return { ok: true, data: { id: batch.id, batch_no: batchNo, count: file.count, total: file.total } };
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
