"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { createClient } from "@/lib/supabase/server";
import {
  irgBracketsReplaceSchema,
  irgRuleSchema,
  irgRuleSetSchema,
  irgVersionSchema,
} from "@/lib/validations/hr";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type IrgVersion = {
  id: string;
  code: string;
  label_fr: string;
  source_ref: string | null;
  effective_from: string;
  effective_to: string | null;
};

export type IrgBracketRow = {
  id: string;
  version_id: string;
  min_annual: number;
  max_annual: number | null;
  rate: number;
  sort_order: number;
};

export type IrgRuleSet = {
  id: string;
  code: string;
  taxpayer_category: "STANDARD" | "DISABLED_OR_RETIREE";
  label_fr: string;
  effective_from: string;
  effective_to: string | null;
};

export type IrgRuleRow = {
  id: string;
  rule_set_id: string;
  kind: string;
  applies_to: string | null;
  sequence: number;
  params: Record<string, unknown>;
  formula: string | null;
};

export type IrgCatalog = {
  versions: IrgVersion[];
  brackets: IrgBracketRow[];
  ruleSets: IrgRuleSet[];
  rules: IrgRuleRow[];
};

function revalidateIrg() {
  revalidatePath("/rh");
  revalidatePath("/rh/legal");
  revalidatePath("/rh/parametres");
  revalidatePath("/rh/paie");
  revalidatePath("/rh/paie/irg");
  revalidatePath("/rh/paie/fiscal");
  revalidatePath("/referentiels/irg");
}

async function requireSuperAdmin(): Promise<ActionResult<true>> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return { ok: false, error: "Session requise. · يلزم تسجيل الدخول." };
  if (!workspace.isSuperAdmin) {
    return {
      ok: false,
      error:
        "Barème IRG réservé à SUPER_ADMIN. · سلم الضريبة محصور في SUPER_ADMIN.",
    };
  }
  return { ok: true, data: true };
}

function num(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function asDate(v: unknown) {
  if (typeof v === "string") return v.slice(0, 10);
  return String(v ?? "").slice(0, 10);
}

function buildRuleParams(input: {
  kind: string;
  monthly_min?: number;
  monthly_max?: number;
  rate_pct?: number;
  min_monthly?: number;
  max_monthly?: number;
  deduct_tokens?: string | null;
}): Record<string, unknown> {
  if (input.kind === "EXEMPTION_THRESHOLD") {
    return { monthly_max: input.monthly_max ?? 0 };
  }
  if (input.kind === "ABATEMENT_ON_TAX") {
    return {
      rate: (input.rate_pct ?? 0) / 100,
      min_monthly: input.min_monthly ?? 0,
      max_monthly: input.max_monthly ?? 0,
    };
  }
  if (input.kind === "LISSAGE") {
    return {
      monthly_min: input.monthly_min ?? 0,
      monthly_max: input.monthly_max ?? 0,
    };
  }
  if (input.kind === "NON_MONTHLY_WITHHOLDING") {
    return { rate: (input.rate_pct ?? 0) / 100 };
  }
  if (input.kind === "BASE_PREPROCESS") {
    const tokens = (input.deduct_tokens ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    return { deduct_tokens: tokens };
  }
  return {};
}

export async function listIrgCatalog(): Promise<ActionResult<IrgCatalog>> {
  const supabase = await createClient();
  const [versions, brackets, sets, rules] = await Promise.all([
    supabase
      .from("ref_bareme_irg_versions")
      .select("id, code, label_fr, source_ref, effective_from, effective_to")
      .order("effective_from", { ascending: false }),
    supabase
      .from("ref_bareme_irg")
      .select("id, version_id, min_annual, max_annual, rate, sort_order")
      .order("sort_order"),
    supabase
      .from("ref_irg_rule_sets")
      .select("id, code, taxpayer_category, label_fr, effective_from, effective_to")
      .order("effective_from", { ascending: false }),
    supabase
      .from("ref_irg_rules")
      .select("id, rule_set_id, kind, applies_to, sequence, params, formula")
      .order("sequence"),
  ]);
  if (versions.error) return { ok: false, error: versions.error.message };
  if (brackets.error) return { ok: false, error: brackets.error.message };
  if (sets.error) return { ok: false, error: sets.error.message };
  if (rules.error) return { ok: false, error: rules.error.message };
  return {
    ok: true,
    data: {
      versions: (versions.data ?? []).map((v) => ({
        id: v.id,
        code: v.code,
        label_fr: v.label_fr,
        source_ref: v.source_ref,
        effective_from: asDate(v.effective_from),
        effective_to: v.effective_to ? asDate(v.effective_to) : null,
      })),
      brackets: (brackets.data ?? []).map((b) => ({
        id: b.id,
        version_id: b.version_id,
        min_annual: num(b.min_annual),
        max_annual: b.max_annual == null ? null : num(b.max_annual),
        rate: num(b.rate),
        sort_order: Number(b.sort_order),
      })),
      ruleSets: (sets.data ?? []).map((s) => ({
        id: s.id,
        code: s.code,
        taxpayer_category: s.taxpayer_category as IrgRuleSet["taxpayer_category"],
        label_fr: s.label_fr,
        effective_from: asDate(s.effective_from),
        effective_to: s.effective_to ? asDate(s.effective_to) : null,
      })),
      rules: (rules.data ?? []).map((r) => ({
        id: r.id,
        rule_set_id: r.rule_set_id,
        kind: r.kind,
        applies_to: r.applies_to,
        sequence: Number(r.sequence),
        params: (r.params ?? {}) as Record<string, unknown>,
        formula: r.formula,
      })),
    },
  };
}

export async function upsertIrgVersion(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  const parsed = irgVersionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const workspace = await getWorkspaceProfile();
  const supabase = await createClient();
  const p = parsed.data;
  const row = {
    code: p.code,
    label_fr: p.label_fr,
    source_ref: p.source_ref,
    effective_from: p.effective_from,
    effective_to: p.effective_to,
  };
  if (p.id) {
    const { error } = await supabase.from("ref_bareme_irg_versions").update(row).eq("id", p.id);
    if (error) return { ok: false, error: error.message };
    revalidateIrg();
    return { ok: true, data: { id: p.id } };
  }
  const { data, error } = await supabase
    .from("ref_bareme_irg_versions")
    .insert({ ...row, created_by: workspace?.id ?? null })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Création refusée." };
  if (p.copy_from_version_id) {
    const { data: source, error: srcErr } = await supabase
      .from("ref_bareme_irg")
      .select("min_annual, max_annual, rate, sort_order")
      .eq("version_id", p.copy_from_version_id);
    if (srcErr) return { ok: false, error: srcErr.message };
    if (source?.length) {
      const { error: copyErr } = await supabase.from("ref_bareme_irg").insert(
        source.map((b) => ({
          version_id: data.id,
          min_annual: b.min_annual,
          max_annual: b.max_annual,
          rate: b.rate,
          sort_order: b.sort_order,
        })),
      );
      if (copyErr) return { ok: false, error: copyErr.message };
    }
  }
  revalidateIrg();
  return { ok: true, data: { id: data.id } };
}

export async function replaceIrgBrackets(
  input: unknown,
): Promise<ActionResult<IrgBracketRow[]>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  const parsed = irgBracketsReplaceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const supabase = await createClient();
  const { version_id, brackets } = parsed.data;
  const kept: string[] = [];
  for (let i = 0; i < brackets.length; i += 1) {
    const b = brackets[i];
    const row = {
      version_id,
      min_annual: b.min_annual,
      max_annual: b.max_annual,
      rate: b.rate_pct / 100,
      sort_order: 1000 + i,
    };
    if (b.id) {
      const { error } = await supabase.from("ref_bareme_irg").update(row).eq("id", b.id);
      if (error) return { ok: false, error: error.message };
      kept.push(b.id);
    } else {
      const { data, error } = await supabase
        .from("ref_bareme_irg")
        .insert(row)
        .select("id")
        .single();
      if (error || !data) return { ok: false, error: error?.message ?? "Tranche refusée." };
      kept.push(data.id);
    }
  }
  const { data: existing, error: listErr } = await supabase
    .from("ref_bareme_irg")
    .select("id")
    .eq("version_id", version_id);
  if (listErr) return { ok: false, error: listErr.message };
  const extra = (existing ?? []).map((r) => r.id).filter((id) => !kept.includes(id));
  if (extra.length) {
    const { error: delErr } = await supabase.from("ref_bareme_irg").delete().in("id", extra);
    if (delErr) return { ok: false, error: delErr.message };
  }
  for (let i = 0; i < kept.length; i += 1) {
    const { error } = await supabase
      .from("ref_bareme_irg")
      .update({ sort_order: i + 1 })
      .eq("id", kept[i]);
    if (error) return { ok: false, error: error.message };
  }
  revalidateIrg();
  const { data: saved, error: savedErr } = await supabase
    .from("ref_bareme_irg")
    .select("id, version_id, min_annual, max_annual, rate, sort_order")
    .eq("version_id", version_id)
    .order("sort_order");
  if (savedErr) return { ok: false, error: savedErr.message };
  return {
    ok: true,
    data: (saved ?? []).map((b) => ({
      id: b.id,
      version_id: b.version_id,
      min_annual: num(b.min_annual),
      max_annual: b.max_annual == null ? null : num(b.max_annual),
      rate: num(b.rate),
      sort_order: Number(b.sort_order),
    })),
  };
}

export async function upsertIrgRuleSet(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  const parsed = irgRuleSetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const supabase = await createClient();
  const p = parsed.data;
  const row = {
    code: p.code,
    taxpayer_category: p.taxpayer_category,
    label_fr: p.label_fr,
    effective_from: p.effective_from,
    effective_to: p.effective_to,
  };
  if (p.id) {
    const { error } = await supabase.from("ref_irg_rule_sets").update(row).eq("id", p.id);
    if (error) return { ok: false, error: error.message };
    revalidateIrg();
    return { ok: true, data: { id: p.id } };
  }
  const { data, error } = await supabase
    .from("ref_irg_rule_sets")
    .insert(row)
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Création refusée." };
  revalidateIrg();
  return { ok: true, data: { id: data.id } };
}

export async function upsertIrgRule(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  const parsed = irgRuleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const p = parsed.data;
  const params = buildRuleParams(p);
  const supabase = await createClient();
  const row = {
    rule_set_id: p.rule_set_id,
    kind: p.kind,
    applies_to: p.applies_to,
    sequence: p.sequence,
    params,
    formula: p.formula,
  };
  if (p.id) {
    const { error } = await supabase.from("ref_irg_rules").update(row).eq("id", p.id);
    if (error) return { ok: false, error: error.message };
    revalidateIrg();
    return { ok: true, data: { id: p.id } };
  }
  const { data, error } = await supabase.from("ref_irg_rules").insert(row).select("id").single();
  if (error || !data) return { ok: false, error: error?.message ?? "Règle refusée." };
  revalidateIrg();
  return { ok: true, data: { id: data.id } };
}

export async function deleteIrgRule(id: string): Promise<ActionResult<true>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const { error } = await supabase.from("ref_irg_rules").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateIrg();
  return { ok: true, data: true };
}
