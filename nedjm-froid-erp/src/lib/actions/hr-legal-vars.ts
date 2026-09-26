"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireComplianceWrite } from "@/lib/auth/compliance-access";
import { createClient } from "@/lib/supabase/server";
import {
  complianceGroupOf,
  contributionKey,
  isComplianceKey,
  type ComplianceGroup,
} from "@/lib/hr/compliance-keys";
import type { ContributionBase, ContributionPart, ContributionScope } from "@/lib/hr/contributions";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type LegalVarVersion = {
  id: string;
  value: number | null;
  effective_from: string;
  effective_to: string | null;
};

export type LegalVarRow = {
  id: string;
  key: string;
  label_fr: string;
  label_ar: string | null;
  unit: string | null;
  value_type: string;
  is_system: boolean;
  current_numeric: number | null;
  current_text: string | null;
  effective_from: string | null;
  /** Versions starting after today, earliest first. */
  planned: LegalVarVersion[];
  /** All versions, latest first. */
  history: LegalVarVersion[];
  group: ComplianceGroup;
  contribution: {
    part: ContributionPart;
    base: ContributionBase;
    reduces_irg: boolean;
    scope: ContributionScope;
    code: string;
  } | null;
  sort_order: number;
};

export type CnasRegimeRow = {
  id: string;
  code: string;
  label_fr: string;
  label_ar: string;
  employee_pct: number | null;
  employer_pct: number | null;
  fos_pct: number | null;
  is_active: boolean;
};

function revalidateLegal() {
  revalidatePath("/rh");
  revalidatePath("/rh/legal");
  revalidatePath("/rh/contrats");
  revalidatePath("/rh/parametres");
  revalidatePath("/rh/paie");
  revalidatePath("/rh/paie/irg");
  revalidatePath("/rh/paie/social");
  revalidatePath("/referentiels/variables");
  revalidatePath("/referentiels/irg");
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const n = (v: unknown) => (v == null ? null : Number(v));

export async function listLegalVars(): Promise<ActionResult<LegalVarRow[]>> {
  const supabase = await createClient();
  const { data: allVars, error } = await supabase
    .from("ref_global_vars")
    .select(
      "id, key, label_fr, label_ar, unit, value_type, is_system, contrib_part, contrib_base, contrib_reduces_irg, contrib_scope, contrib_code, sort_order",
    )
    .order("sort_order")
    .order("key");
  if (error) return { ok: false, error: error.message };
  const vars = (allVars ?? []).filter((v) => isComplianceKey(v.key));
  if (!vars.length) return { ok: true, data: [] };

  const { data: versions, error: vErr } = await supabase
    .from("ref_global_var_versions")
    .select("id, var_id, value_numeric, value_text, effective_from, effective_to")
    .in(
      "var_id",
      vars.map((v) => v.id),
    )
    .order("effective_from", { ascending: false });
  if (vErr) return { ok: false, error: vErr.message };

  const today = todayIso();
  const byVar = new Map<string, NonNullable<typeof versions>>();
  for (const row of versions ?? []) {
    const list = byVar.get(row.var_id) ?? [];
    list.push(row);
    byVar.set(row.var_id, list);
  }

  return {
    ok: true,
    data: vars.map((v) => {
      const list = byVar.get(v.id) ?? [];
      const current = list.find(
        (x) => x.effective_from <= today && (!x.effective_to || x.effective_to >= today),
      );
      const toVersion = (x: (typeof list)[number]): LegalVarVersion => ({
        id: x.id,
        value: n(x.value_numeric),
        effective_from: x.effective_from,
        effective_to: x.effective_to,
      });
      const part = v.contrib_part === "EMPLOYEE" || v.contrib_part === "EMPLOYER" ? v.contrib_part : null;
      return {
        id: v.id,
        key: v.key,
        label_fr: v.label_fr,
        label_ar: v.label_ar,
        unit: v.unit,
        value_type: v.value_type,
        is_system: v.is_system !== false,
        current_numeric: current ? n(current.value_numeric) : null,
        current_text: current?.value_text ?? null,
        effective_from: current?.effective_from ?? null,
        planned: list
          .filter((x) => x.effective_from > today)
          .map(toVersion)
          .reverse(),
        history: list.map(toVersion),
        group: complianceGroupOf(v.key),
        contribution: part
          ? {
              part,
              base: v.contrib_base === "TAXABLE" ? "TAXABLE" : "COTISABLE",
              reduces_irg: v.contrib_reduces_irg === true,
              scope:
                v.contrib_scope === "CACOBATPH_CONGES" || v.contrib_scope === "CACOBATPH_INTEMPERIES"
                  ? v.contrib_scope
                  : "ALL",
              code: v.contrib_code ?? "",
            }
          : null,
        sort_order: Number(v.sort_order ?? 0) || 0,
      } satisfies LegalVarRow;
    }),
  };
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date d'effet invalide.");

const addVersionSchema = z.object({
  var_id: z.string().uuid(),
  effective_from: dateSchema,
  value_pct: z.coerce.number().min(0, "Taux ≥ 0.").max(100, "Taux ≤ 100 %.").optional(),
  value_numeric: z.coerce.number().min(0).max(99_999_999).optional(),
  as_percent: z.boolean().default(false),
});

function toFraction(pct: number) {
  return Math.round((pct / 100) * 1_000_000) / 1_000_000;
}

async function loadComplianceVar(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data } = await supabase
    .from("ref_global_vars")
    .select("id, key, is_system")
    .eq("id", id)
    .maybeSingle();
  if (!data || !isComplianceKey(data.key)) return null;
  return data;
}

/** New value from a date: same date replaces, earlier/later dates are slotted between existing versions. */
export async function addLegalVarVersion(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireComplianceWrite();
  if (!gate.ok) return gate;
  const parsed = addVersionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const p = parsed.data;
  let value: number;
  if (p.as_percent) {
    if (p.value_pct == null || !Number.isFinite(p.value_pct)) return { ok: false, error: "Pourcentage requis." };
    value = toFraction(p.value_pct);
  } else {
    if (p.value_numeric == null || !Number.isFinite(p.value_numeric)) return { ok: false, error: "Valeur requise." };
    value = p.value_numeric;
  }
  const supabase = await createClient();
  if (!(await loadComplianceVar(supabase, p.var_id))) {
    return { ok: false, error: "Variable hors unité 05." };
  }
  const { data, error } = await supabase.rpc("hr_set_legal_var_version", {
    p_var_id: p.var_id,
    p_from: p.effective_from,
    p_value: value,
  });
  if (error) return { ok: false, error: error.message };
  revalidateLegal();
  return { ok: true, data: { id: String(data) } };
}

/** Withdraw a value programmed for a future date; the previous value stays in force. */
export async function cancelLegalVarVersion(input: unknown): Promise<ActionResult> {
  const gate = await requireComplianceWrite();
  if (!gate.ok) return gate;
  const parsed = z.object({ version_id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Version invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("hr_cancel_legal_var_version", {
    p_version_id: parsed.data.version_id,
  });
  if (error) return { ok: false, error: error.message };
  revalidateLegal();
  return { ok: true, data: undefined };
}

const contributionSchema = z
  .object({
    label_fr: z.string().trim().min(2, "Libellé requis.").max(80),
    label_ar: z.string().trim().max(80).optional().nullable(),
    code: z.string().trim().max(12).optional().nullable(),
    part: z.enum(["EMPLOYEE", "EMPLOYER"]),
    base: z.enum(["COTISABLE", "TAXABLE"]),
    reduces_irg: z.boolean().default(false),
    scope: z.enum(["ALL", "CACOBATPH_CONGES", "CACOBATPH_INTEMPERIES"]).default("ALL"),
    sort_order: z.coerce.number().int().min(0).max(9999).default(0),
  })
  .transform((v) => ({ ...v, reduces_irg: v.part === "EMPLOYEE" && v.reduces_irg }));

const createContributionSchema = z.object({
  group: z.enum(["cnas", "cacobatph", "irg"]),
  details: contributionSchema,
  value_pct: z.coerce.number().min(0, "Taux ≥ 0.").max(100, "Taux ≤ 100 %."),
  effective_from: dateSchema,
});

function contributionColumns(d: z.infer<typeof contributionSchema>, group: "cnas" | "cacobatph" | "irg") {
  return {
    label_fr: d.label_fr,
    label_ar: d.label_ar || null,
    contrib_code: d.code || null,
    contrib_part: d.part,
    contrib_base: d.base,
    contrib_reduces_irg: d.reduces_irg,
    contrib_scope: group === "cacobatph" ? (d.scope === "ALL" ? "CACOBATPH_CONGES" : d.scope) : "ALL",
    sort_order: d.sort_order,
  };
}

/** New contribution computed by the payroll (unit 05 tab CNAS, CACOBATPH or taxes). */
export async function createContribution(input: unknown): Promise<ActionResult<{ id: string; key: string }>> {
  const gate = await requireComplianceWrite();
  if (!gate.ok) return gate;
  const parsed = createContributionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const p = parsed.data;
  const supabase = await createClient();
  const { data: existing, error: kErr } = await supabase.from("ref_global_vars").select("key");
  if (kErr) return { ok: false, error: kErr.message };
  const key = contributionKey(
    p.group,
    p.details.label_fr,
    (existing ?? []).map((r) => r.key),
  );
  const { data: created, error } = await supabase
    .from("ref_global_vars")
    .insert({
      key,
      value_type: "numeric",
      unit: "%",
      is_system: false,
      description: "Cotisation ajoutée depuis l'unité 05",
      ...contributionColumns(p.details, p.group),
    })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!created) return { ok: false, error: "Création refusée (droits)." };

  const { error: vErr } = await supabase.rpc("hr_set_legal_var_version", {
    p_var_id: created.id,
    p_from: p.effective_from,
    p_value: toFraction(p.value_pct),
  });
  if (vErr) {
    await supabase.from("ref_global_vars").delete().eq("id", created.id);
    return { ok: false, error: vErr.message };
  }
  revalidateLegal();
  return { ok: true, data: { id: created.id, key } };
}

export async function updateContribution(input: unknown): Promise<ActionResult> {
  const gate = await requireComplianceWrite();
  if (!gate.ok) return gate;
  const parsed = z.object({ var_id: z.string().uuid(), details: contributionSchema }).safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const supabase = await createClient();
  const row = await loadComplianceVar(supabase, parsed.data.var_id);
  if (!row || row.is_system) return { ok: false, error: "Seules les cotisations ajoutées sont modifiables." };
  const group = complianceGroupOf(row.key);
  if (group === "other") return { ok: false, error: "Variable hors unité 05." };
  const { data, error } = await supabase
    .from("ref_global_vars")
    .update(contributionColumns(parsed.data.details, group))
    .eq("id", row.id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Mise à jour refusée (droits)." };
  revalidateLegal();
  return { ok: true, data: undefined };
}

/** Removes a user-defined contribution; payslips already generated keep their frozen amounts. */
export async function deleteContribution(input: unknown): Promise<ActionResult> {
  const gate = await requireComplianceWrite();
  if (!gate.ok) return gate;
  const parsed = z.object({ var_id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Cotisation invalide." };
  const supabase = await createClient();
  const row = await loadComplianceVar(supabase, parsed.data.var_id);
  if (!row || row.is_system) return { ok: false, error: "Les taux légaux ne peuvent pas être supprimés." };
  const { data, error } = await supabase.from("ref_global_vars").delete().eq("id", row.id).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Suppression refusée (droits)." };
  revalidateLegal();
  return { ok: true, data: undefined };
}

function optPct(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : null;
}

export async function listCnasRegimes(): Promise<ActionResult<CnasRegimeRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_catalogs")
    .select("id, code, label_fr, label_ar, extra, is_active, sort_order")
    .eq("kind", "social_profile")
    .order("sort_order")
    .order("code");
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((r) => {
      const extra = (r.extra ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        code: r.code,
        label_fr: r.label_fr,
        label_ar: r.label_ar ?? "",
        employee_pct: optPct(extra.employee_pct),
        employer_pct: optPct(extra.employer_pct),
        fos_pct: optPct(extra.fos_pct),
        is_active: r.is_active !== false,
      };
    }),
  };
}

const pctOrNull = z.preprocess(
  (v) => (v === "" || v === undefined ? null : typeof v === "string" ? Number(v.replace(",", ".")) : v),
  z.number().min(0, "Taux ≥ 0.").max(100, "Taux ≤ 100 %.").nullable(),
);

const regimeSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_]{2,30}$/, "Code : 2 à 30 caractères A-Z, 0-9, _."),
  label_fr: z.string().trim().min(2, "Libellé requis.").max(80),
  label_ar: z.string().trim().max(80).optional().nullable(),
  employee_pct: pctOrNull,
  employer_pct: pctOrNull,
  fos_pct: pctOrNull,
  is_active: z.boolean().default(true),
});

/** CNAS regime (catalog social_profile): blank rate = legal rate of the period. */
export async function upsertCnasRegime(input: unknown): Promise<ActionResult<{ id: string }>> {
  const gate = await requireComplianceWrite();
  if (!gate.ok) return gate;
  const parsed = regimeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const p = parsed.data;
  const supabase = await createClient();
  let extra: Record<string, unknown> = {};
  if (p.id) {
    const { data: current } = await supabase
      .from("hr_catalogs")
      .select("extra")
      .eq("id", p.id)
      .eq("kind", "social_profile")
      .maybeSingle();
    if (!current) return { ok: false, error: "Régime introuvable." };
    extra = { ...((current.extra ?? {}) as Record<string, unknown>) };
  }
  for (const k of ["employee_pct", "employer_pct", "fos_pct"] as const) {
    if (p[k] == null) delete extra[k];
    else extra[k] = p[k];
  }
  const row = {
    kind: "social_profile",
    code: p.code,
    label_fr: p.label_fr,
    label_ar: p.label_ar || p.label_fr,
    extra,
    is_active: p.is_active,
  };
  const query = p.id
    ? supabase.from("hr_catalogs").update(row).eq("id", p.id).eq("kind", "social_profile").select("id").maybeSingle()
    : supabase.from("hr_catalogs").insert(row).select("id").maybeSingle();
  const { data, error } = await query;
  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? `Le code ${p.code} existe déjà.` : error.message,
    };
  }
  if (!data) return { ok: false, error: "Enregistrement refusé (droits)." };
  revalidateLegal();
  return { ok: true, data: { id: data.id } };
}
