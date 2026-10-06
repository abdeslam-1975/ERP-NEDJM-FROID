"use server";

import { revalidatePath } from "next/cache";
import { requireComplianceWrite } from "@/lib/auth/compliance-access";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { logLegalOverride } from "@/lib/hr/log-legal-override";
import {
  irgBracketDeviations,
  irgRuleDeviations,
  legalOverrideError,
  statutoryIrgRule,
  takeAuthorize,
} from "@/lib/hr/statutory";
import { createClient } from "@/lib/supabase/server";
import { isOpenRuleStatus, parseIrgRowStatus, type IrgRowStatus } from "@/lib/rules/proposals";
import {
  irgBracketsReplaceSchema,
  irgRuleSchema,
  irgRuleSetSchema,
  irgVersionSchema,
} from "@/lib/validations/hr";
import { z } from "zod";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type IrgPendingProposal = { id: string; action: "SET" | "VERIFY"; status: string };

type IrgRowTrace = {
  /** LEGACY = existing, not verified; DRAFT = editable; PROPOSED = frozen; APPLIED; REPLACED. */
  status: IrgRowStatus;
  proposal_id: string | null;
  decision_id: string | null;
  proposals: IrgPendingProposal[];
};

export type IrgVersion = IrgRowTrace & {
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

export type IrgRuleSet = IrgRowTrace & {
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

type Supabase = Awaited<ReturnType<typeof createClient>>;

const DRAFT_ONLY =
  "Seul un brouillon est modifiable : une version approuvée ou reprise ne change que par une nouvelle proposition (« Nouveau brouillon »).";

function monthStart(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

async function requireDraft(
  supabase: Supabase,
  table: "ref_bareme_irg_versions" | "ref_irg_rule_sets",
  id: string,
): Promise<ActionResult> {
  const { data, error } = await supabase.from(table).select("status").eq("id", id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Brouillon introuvable." };
  if (data.status !== "DRAFT") return { ok: false, error: DRAFT_ONLY };
  return { ok: true, data: undefined };
}

async function parentDraft(
  supabase: Supabase,
  table: "ref_bareme_irg_versions" | "ref_irg_rule_sets",
  id: string | null | undefined,
): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Brouillon introuvable." };
  return requireDraft(supabase, table, id);
}

function revalidateIrg() {
  revalidatePath("/rh");
  revalidatePath("/parametres/rh/cotisations");
  revalidatePath("/parametres/rh");
  revalidatePath("/rh/paie");
  revalidatePath("/rh/paie/irg");
  revalidatePath("/rh/paie/fiscal");
  revalidatePath("/referentiels/irg");
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

const TRACE_COLUMNS = "status, proposal_id, decision_id";

function traceOf(row: Record<string, unknown>, pending: Map<string, IrgPendingProposal[]>): IrgRowTrace {
  const id = String(row.id);
  return {
    status: parseIrgRowStatus(row.status),
    proposal_id: typeof row.proposal_id === "string" ? row.proposal_id : null,
    decision_id: typeof row.decision_id === "string" ? row.decision_id : null,
    proposals: pending.get(id) ?? [],
  };
}

export async function listIrgCatalog(): Promise<ActionResult<IrgCatalog>> {
  const supabase = await createClient();
  const [versions, brackets, sets, rules, proposals] = await Promise.all([
    supabase
      .from("ref_bareme_irg_versions")
      .select(`id, code, label_fr, source_ref, effective_from, effective_to, ${TRACE_COLUMNS}`)
      .order("effective_from", { ascending: false }),
    supabase
      .from("ref_bareme_irg")
      .select("id, version_id, min_annual, max_annual, rate, sort_order")
      .order("sort_order"),
    supabase
      .from("ref_irg_rule_sets")
      .select(`id, code, taxpayer_category, label_fr, effective_from, effective_to, ${TRACE_COLUMNS}`)
      .order("effective_from", { ascending: false }),
    supabase
      .from("ref_irg_rules")
      .select("id, rule_set_id, kind, applies_to, sequence, params, formula")
      .order("sequence"),
    supabase
      .from("ref_rule_proposals")
      .select("id, action, status, target_id")
      .in("family", ["IRG_BAREME", "IRG_RULES"])
      .in("status", ["DRAFT", "SUBMITTED", "APPROVED"]),
  ]);
  if (versions.error) return { ok: false, error: versions.error.message };
  if (brackets.error) return { ok: false, error: brackets.error.message };
  if (sets.error) return { ok: false, error: sets.error.message };
  if (rules.error) return { ok: false, error: rules.error.message };
  const pending = new Map<string, IrgPendingProposal[]>();
  for (const p of proposals.data ?? []) {
    if (!p.target_id || !isOpenRuleStatus(p.status)) continue;
    const list = pending.get(p.target_id) ?? [];
    list.push({ id: p.id, action: p.action === "VERIFY" ? "VERIFY" : "SET", status: p.status });
    pending.set(p.target_id, list);
  }
  return {
    ok: true,
    data: {
      versions: ((versions.data ?? []) as Record<string, unknown>[]).map((v) => ({
        id: String(v.id),
        code: String(v.code),
        label_fr: String(v.label_fr),
        source_ref: typeof v.source_ref === "string" ? v.source_ref : null,
        effective_from: asDate(v.effective_from),
        effective_to: v.effective_to ? asDate(v.effective_to) : null,
        ...traceOf(v, pending),
      })),
      brackets: (brackets.data ?? []).map((b) => ({
        id: b.id,
        version_id: b.version_id,
        min_annual: num(b.min_annual),
        max_annual: b.max_annual == null ? null : num(b.max_annual),
        rate: num(b.rate),
        sort_order: Number(b.sort_order),
      })),
      ruleSets: ((sets.data ?? []) as Record<string, unknown>[]).map((s) => ({
        id: String(s.id),
        code: String(s.code),
        taxpayer_category: s.taxpayer_category === "DISABLED_OR_RETIREE" ? "DISABLED_OR_RETIREE" : "STANDARD",
        label_fr: String(s.label_fr),
        effective_from: asDate(s.effective_from),
        effective_to: s.effective_to ? asDate(s.effective_to) : null,
        ...traceOf(s, pending),
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
  const gate = await requireComplianceWrite();
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
    effective_from: monthStart(p.effective_from),
    effective_to: null,
  };
  if (p.id) {
    const draft = await requireDraft(supabase, "ref_bareme_irg_versions", p.id);
    if (!draft.ok) return draft;
    const { error } = await supabase.from("ref_bareme_irg_versions").update(row).eq("id", p.id);
    if (error) return { ok: false, error: error.message };
    revalidateIrg();
    return { ok: true, data: { id: p.id } };
  }
  const { data, error } = await supabase
    .from("ref_bareme_irg_versions")
    .insert({ ...row, status: "DRAFT", created_by: workspace?.id ?? null })
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
  const gate = await requireComplianceWrite();
  if (!gate.ok) return gate;
  const { body, authorize } = takeAuthorize(input);
  const parsed = irgBracketsReplaceSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const supabase = await createClient();
  const { version_id, brackets } = parsed.data;
  const draft = await parentDraft(supabase, "ref_bareme_irg_versions", version_id);
  if (!draft.ok) return draft;
  const deviations = irgBracketDeviations(
    brackets.map((b) => ({
      min_annual: b.min_annual,
      max_annual: b.max_annual,
      rate: b.rate_pct / 100,
    })),
  );
  if (deviations.length && !authorize) return { ok: false, error: legalOverrideError(deviations) };
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
  if (deviations.length && authorize) {
    const logged = await logLegalOverride("irg_brackets", { brackets: "LF 2022 art. 104" }, { version_id, brackets });
    if (logged) return { ok: false, error: `Tranches enregistrées. Journal d'audit indisponible : ${logged}` };
  }
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

const ruleSetDraftSchema = irgRuleSetSchema.extend({
  copy_from_rule_set_id: z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.string().uuid().optional().nullable(),
  ),
});

/** Rule set draft (new, or copied from a version with its rules); approved sets never change. */
export async function upsertIrgRuleSet(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireComplianceWrite();
  if (!gate.ok) return gate;
  const parsed = ruleSetDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const supabase = await createClient();
  const p = parsed.data;
  const row = {
    code: p.code,
    taxpayer_category: p.taxpayer_category,
    label_fr: p.label_fr,
    effective_from: monthStart(p.effective_from),
    effective_to: null,
  };
  if (p.id) {
    const draft = await requireDraft(supabase, "ref_irg_rule_sets", p.id);
    if (!draft.ok) return draft;
    const { error } = await supabase.from("ref_irg_rule_sets").update(row).eq("id", p.id);
    if (error) return { ok: false, error: error.message };
    revalidateIrg();
    return { ok: true, data: { id: p.id } };
  }
  const { data, error } = await supabase
    .from("ref_irg_rule_sets")
    .insert({ ...row, status: "DRAFT" })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Création refusée." };
  if (p.copy_from_rule_set_id) {
    const { data: source, error: srcErr } = await supabase
      .from("ref_irg_rules")
      .select("kind, applies_to, sequence, params, formula")
      .eq("rule_set_id", p.copy_from_rule_set_id);
    if (srcErr) return { ok: false, error: srcErr.message };
    if (source?.length) {
      const { error: copyErr } = await supabase
        .from("ref_irg_rules")
        .insert(source.map((r) => ({ ...r, rule_set_id: data.id })));
      if (copyErr) return { ok: false, error: copyErr.message };
    }
  }
  revalidateIrg();
  return { ok: true, data: { id: data.id } };
}

/** A draft never submitted (or released after a withdrawal or a rejection) can be erased. */
export async function deleteIrgDraft(input: unknown): Promise<ActionResult> {
  const gate = await requireComplianceWrite();
  if (!gate.ok) return gate;
  const parsed = z
    .object({ family: z.enum(["IRG_BAREME", "IRG_RULES"]), id: z.string().uuid() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Brouillon invalide." };
  const table = parsed.data.family === "IRG_BAREME" ? "ref_bareme_irg_versions" : "ref_irg_rule_sets";
  const supabase = await createClient();
  const draft = await requireDraft(supabase, table, parsed.data.id);
  if (!draft.ok) return draft;
  const { count } = await supabase
    .from("ref_rule_proposals")
    .select("id", { count: "exact", head: true })
    .eq("target_id", parsed.data.id);
  if ((count ?? 0) > 0) {
    return { ok: false, error: "Ce brouillon est cité par une proposition : il reste conservé pour la traçabilité." };
  }
  const { data, error } = await supabase.from(table).delete().eq("id", parsed.data.id).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Suppression refusée (droits)." };
  revalidateIrg();
  return { ok: true, data: undefined };
}

export async function upsertIrgRule(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireComplianceWrite();
  if (!gate.ok) return gate;
  const { body, authorize } = takeAuthorize(input);
  const parsed = irgRuleSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const p = parsed.data;
  const params = buildRuleParams(p);
  const supabase = await createClient();
  const draft = await parentDraft(supabase, "ref_irg_rule_sets", p.rule_set_id);
  if (!draft.ok) return draft;
  const { data: ruleSet } = await supabase
    .from("ref_irg_rule_sets")
    .select("taxpayer_category")
    .eq("id", p.rule_set_id)
    .maybeSingle();
  const deviations = irgRuleDeviations(ruleSet?.taxpayer_category ?? "STANDARD", p.kind, params, p.formula);
  if (deviations.length && !authorize) return { ok: false, error: legalOverrideError(deviations) };
  const row = {
    rule_set_id: p.rule_set_id,
    kind: p.kind,
    applies_to: p.applies_to,
    sequence: p.sequence,
    params,
    formula: p.formula,
  };
  const savedId = p.id;
  if (p.id) {
    const { error } = await supabase.from("ref_irg_rules").update(row).eq("id", p.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data, error } = await supabase.from("ref_irg_rules").insert(row).select("id").single();
    if (error || !data) return { ok: false, error: error?.message ?? "Règle refusée." };
    if (deviations.length && authorize) {
      const logged = await logLegalOverride(
        `irg_rule:${data.id}`,
        statutoryIrgRule(ruleSet?.taxpayer_category ?? "STANDARD", p.kind),
        { kind: p.kind, params, formula: p.formula },
      );
      if (logged) return { ok: false, error: `Règle enregistrée. Journal d'audit indisponible : ${logged}` };
    }
    revalidateIrg();
    return { ok: true, data: { id: data.id } };
  }
  if (deviations.length && authorize) {
    const logged = await logLegalOverride(
      `irg_rule:${savedId}`,
      statutoryIrgRule(ruleSet?.taxpayer_category ?? "STANDARD", p.kind),
      { kind: p.kind, params, formula: p.formula },
    );
    if (logged) return { ok: false, error: `Règle enregistrée. Journal d'audit indisponible : ${logged}` };
  }
  revalidateIrg();
  return { ok: true, data: { id: savedId ?? "" } };
}

export async function deleteIrgRule(id: string, authorizeOverride = false): Promise<ActionResult<true>> {
  const gate = await requireComplianceWrite();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("ref_irg_rules")
    .select("id, kind, params, formula, rule_set_id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Règle introuvable." };
  const draft = await parentDraft(supabase, "ref_irg_rule_sets", existing.rule_set_id);
  if (!draft.ok) return draft;
  if (statutoryIrgRule("STANDARD", existing.kind)) {
    const { data: ruleSet } = await supabase
      .from("ref_irg_rule_sets")
      .select("taxpayer_category")
      .eq("id", existing.rule_set_id)
      .maybeSingle();
    const legal = statutoryIrgRule(ruleSet?.taxpayer_category ?? "STANDARD", existing.kind);
    if (legal && !authorizeOverride) {
      return {
        ok: false,
        error: legalOverrideError([
          `${existing.kind} : supprimer cette règle retire un élément du barème légal.`,
        ]),
      };
    }
    if (legal && authorizeOverride) {
      const logged = await logLegalOverride(`irg_rule:${id}`, legal, { deleted: true, kind: existing.kind });
      if (logged) return { ok: false, error: `Journal d'audit indisponible : ${logged}` };
    }
  }
  const { error } = await supabase.from("ref_irg_rules").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateIrg();
  return { ok: true, data: true };
}
