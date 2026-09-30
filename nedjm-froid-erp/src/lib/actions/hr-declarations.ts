"use server";

import { revalidatePath } from "next/cache";
import { requireHrSalaryValues } from "@/lib/auth/require-roles";
import { createClient } from "@/lib/supabase/server";
import {
  isDeclarationKind,
  parseDeclarationExports,
  parseDeclarationPlan,
  type DeclarationExport,
  type DeclarationKind,
  type DeclarationPlan,
} from "@/lib/hr/external-operations";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ScopeInput = { kind: DeclarationKind; year: number; month: number | null; site_id?: string | null };

function checkScope(input: ScopeInput): string | null {
  if (!isDeclarationKind(input.kind)) return "Type de déclaration invalide.";
  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) return "Période invalide.";
  const annual = input.kind === "das" || input.kind === "das_file";
  if (!annual && (!Number.isInteger(input.month) || (input.month ?? 0) < 1 || (input.month ?? 0) > 12)) {
    return "Période invalide.";
  }
  if (input.site_id && !UUID_RE.test(input.site_id)) return "Chantier invalide.";
  return null;
}

export async function getDeclarationExportPlan(
  input: ScopeInput & { decision_id?: string | null },
): Promise<ActionResult<DeclarationPlan>> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  const bad = checkScope(input);
  if (bad) return { ok: false, error: bad };
  if (input.decision_id && !UUID_RE.test(input.decision_id)) return { ok: false, error: "Décision invalide." };
  const annual = input.kind === "das" || input.kind === "das_file";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_declaration_export_plan", {
    p_kind: input.kind,
    p_year: input.year,
    p_month: annual ? null : input.month,
    p_site: input.site_id || null,
    p_decision: input.decision_id || null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: parseDeclarationPlan(data) };
}

export async function requestDeclarationDecision(input: ScopeInput & { reason: string }): Promise<ActionResult<{ id: string }>> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  const bad = checkScope(input);
  if (bad) return { ok: false, error: bad };
  const reason = (input.reason ?? "").trim();
  if (reason.length < 10 || reason.length > 500) return { ok: false, error: "Motif de la demande obligatoire (10 à 500 caractères)." };
  const annual = input.kind === "das" || input.kind === "das_file";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_declaration_request_d10", {
    p_kind: input.kind,
    p_year: input.year,
    p_month: annual ? null : input.month,
    p_site: input.site_id || null,
    p_reason: reason,
  });
  revalidatePath("/decisions");
  revalidatePath("/rh/paie/declarations");
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: String(data) } };
}

export async function listDeclarationExports(input: { year: number }): Promise<ActionResult<DeclarationExport[]>> {
  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) return { ok: false, error: "Année invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_declaration_exports")
    .select(
      `id, kind, nature, period_year, period_month, months, excluded_months, file_name, sha256, payroll_status,
       double_declaration_risk, decision_id, created_at,
       site:ref_sites ( name_fr ),
       creator:sys_users!created_by ( full_name )`,
    )
    .eq("period_year", input.year)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return { ok: false, error: error.message };
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v) ?? null;
  return {
    ok: true,
    data: parseDeclarationExports(
      (data ?? []).map((e) => ({
        ...e,
        site_name: one(e.site)?.name_fr ?? "Tous les chantiers",
        created_by: one(e.creator)?.full_name ?? null,
      })),
    ),
  };
}

export type DeclarationDecisionScope = {
  id: string;
  status: string;
  chosen_option: string | null;
  kind: DeclarationKind;
  year: number;
  month: number | null;
  site_id: string | null;
};

export async function getDeclarationDecisionScope(id: string): Promise<ActionResult<DeclarationDecisionScope>> {
  if (!UUID_RE.test(id)) return { ok: false, error: "Décision invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sys_decisions")
    .select("id, status, chosen_option, scope")
    .eq("id", id)
    .eq("type_code", "D10")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Décision D10 introuvable ou non visible avec vos droits." };
  const s = (data.scope ?? {}) as { kind?: string; year?: number; month?: number | null; site_id?: string | null };
  if (!isDeclarationKind(s.kind) || typeof s.year !== "number") return { ok: false, error: "Décision D10 invalide." };
  return {
    ok: true,
    data: {
      id: data.id,
      status: data.status,
      chosen_option: data.chosen_option,
      kind: s.kind,
      year: s.year,
      month: typeof s.month === "number" ? s.month : null,
      site_id: s.site_id ?? null,
    },
  };
}
