"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { signalPayrollInputChange } from "@/lib/hr/payroll-input-signal";
import { payrollSignalNotice } from "@/lib/decisions/catalog";
import { isFirstOfMonth } from "@/lib/hr/assignments";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type AssignmentHistoryRow = {
  id: string;
  contract_id: string;
  site_id: string;
  site_name: string;
  effective_from: string;
  kind: "INITIAL" | "OFFICIAL";
  reason: string;
  document_ref: string | null;
  corrected: boolean;
  author_name: string | null;
  created_at: string;
};

export type AssignmentPanel = {
  rows: AssignmentHistoryRow[];
  /** First month a dated change may affect (after validated / closed months and before 09/2026). */
  first_changeable: string;
  /** Open D8 requests of this contract visible to the user (assignment id → decision id). */
  open_corrections: Record<string, string>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = z.string().regex(UUID_RE, "Identifiant invalide.");

const changeSchema = z.object({
  contract_id: uuid,
  site_id: uuid,
  effective_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date d'effet invalide")
    .refine(isFirstOfMonth, "Un changement d'affectation prend effet le 1er d'un mois."),
  reason: z.string().trim().min(3, "Motif requis (3 caractères min.) · السبب مطلوب").max(300),
  document_ref: z.string().trim().max(200).optional().default(""),
});

const correctionSchema = z.object({
  assignment_id: uuid,
  site_id: uuid,
  reason: z.string().trim().min(10, "Motif de la correction obligatoire (10 caractères minimum).").max(300),
});

type Join<T> = T | T[] | null;
const one = <T,>(v: Join<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function revalidate() {
  revalidatePath("/rh/contrats");
  revalidatePath("/rh/presence");
  revalidatePath("/rh/paie");
  revalidatePath("/decisions");
}

export async function listContractAssignments(contractId: string): Promise<ActionResult<AssignmentPanel>> {
  if (!UUID_RE.test(contractId)) return { ok: false, error: "Contrat invalide." };
  const supabase = await createClient();
  const [rows, open, pending] = await Promise.all([
    supabase
      .from("hr_contract_assignments")
      .select(
        "id, contract_id, site_id, effective_from, kind, reason, document_ref, corrected_by_decision, created_at, site:ref_sites ( name_fr ), author:sys_users!created_by ( full_name )",
      )
      .eq("contract_id", contractId)
      .order("effective_from", { ascending: false }),
    supabase.rpc("hr_first_changeable_month"),
    supabase
      .from("sys_decisions")
      .select("id, scope")
      .eq("type_code", "D8")
      .in("status", ["PENDING", "DECIDED"])
      .eq("scope->>contract_id", contractId),
  ]);
  if (rows.error) return { ok: false, error: rows.error.message };
  if (open.error) return { ok: false, error: open.error.message };
  const openCorrections: Record<string, string> = {};
  for (const d of pending.data ?? []) {
    const scope = (d.scope ?? {}) as Record<string, unknown>;
    if (typeof scope.assignment_id === "string") openCorrections[scope.assignment_id] = String(d.id);
  }
  return {
    ok: true,
    data: {
      rows: (rows.data ?? []).map((r) => ({
        id: String(r.id),
        contract_id: String(r.contract_id),
        site_id: String(r.site_id),
        site_name: one(r.site as Join<{ name_fr: string }>)?.name_fr ?? "",
        effective_from: String(r.effective_from).slice(0, 10),
        kind: r.kind === "OFFICIAL" ? "OFFICIAL" : "INITIAL",
        reason: String(r.reason ?? ""),
        document_ref: r.document_ref ?? null,
        corrected: Boolean(r.corrected_by_decision),
        author_name: one(r.author as Join<{ full_name: string | null }>)?.full_name ?? null,
        created_at: String(r.created_at),
      })),
      first_changeable: String(open.data ?? "").slice(0, 10),
      open_corrections: openCorrections,
    },
  };
}

export async function saveAssignmentChange(
  input: unknown,
): Promise<ActionResult<{ id: string; payroll_notice: string | null; warning: string | null }>> {
  const parsed = changeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const p = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_contract_assignment_change", {
    p_contract: p.contract_id,
    p_site: p.site_id,
    p_from: p.effective_from,
    p_reason: p.reason,
    p_document: p.document_ref || null,
  });
  if (error) return { ok: false, error: error.message };
  const signal = await signalPayrollInputChange(supabase, {
    source: "ASSIGNMENT",
    contractIds: [p.contract_id],
    siteId: p.site_id,
    detail: `Changement d'affectation au ${p.effective_from.split("-").reverse().join("/")}`,
  });
  revalidate();
  return {
    ok: true,
    data: {
      id: String(data),
      payroll_notice: signal.ok ? payrollSignalNotice(signal.data) : null,
      warning: signal.ok ? null : `Paie brouillon non signalée : ${signal.error}`,
    },
  };
}

export async function deleteAssignmentChange(input: unknown): Promise<ActionResult<{ warning: string | null }>> {
  const parsed = z.object({ id: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Affectation invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_contract_assignment_delete", { p_id: parsed.data.id });
  if (error) return { ok: false, error: error.message };
  const signal = await signalPayrollInputChange(supabase, {
    source: "ASSIGNMENT",
    contractIds: [String(data)],
    detail: "Changement d'affectation supprimé",
  });
  revalidate();
  return { ok: true, data: { warning: signal.ok ? null : `Paie brouillon non signalée : ${signal.error}` } };
}

/** D8: an assignment entered by mistake. Nothing changes until the decision is taken. */
export async function requestAssignmentCorrection(input: unknown): Promise<ActionResult<{ decision_id: string }>> {
  const parsed = correctionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const p = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_assignment_request_correction", {
    p_assignment: p.assignment_id,
    p_site: p.site_id,
    p_reason: p.reason,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/decisions");
  return { ok: true, data: { decision_id: String(data) } };
}
