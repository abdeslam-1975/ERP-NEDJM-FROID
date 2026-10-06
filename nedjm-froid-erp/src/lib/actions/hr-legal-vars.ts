"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireComplianceWrite } from "@/lib/auth/compliance-access";
import { logLegalOverride } from "@/lib/hr/log-legal-override";
import {
  regimeRateDeviations,
  legalOverrideError,
  STATUTORY_CNAS,
  STATUTORY_RATES,
  statutoryFractionDeviation,
  takeAuthorize,
} from "@/lib/hr/statutory";
import { createClient } from "@/lib/supabase/server";
import {
  complianceGroupOf,
  contributionKey,
  isComplianceKey,
  type ComplianceGroup,
} from "@/lib/hr/compliance-keys";
import type { ContributionBase, ContributionPart, ContributionScope } from "@/lib/hr/contributions";
import { frMonth, isOpenRuleStatus, ruleSourceSchema, type RuleSource } from "@/lib/rules/proposals";
import { PROPOSAL_SENT, saveRuleProposal } from "@/lib/rules/proposal-rpc";
import { earliestOpen, parseChainState } from "@/lib/hr/payroll-chains";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Open proposal (draft, submitted or approved without effect) shown next to the rule it targets. */
export type PendingRuleProposal = {
  id: string;
  action: "SET" | "STOP" | "VERIFY";
  status: string;
  title: string;
  requested_month: string | null;
};

export type ContributionSettings = {
  part: ContributionPart;
  base: ContributionBase;
  reduces_irg: boolean;
  scope: ContributionScope;
};

export type LegalVarVersion = {
  id: string;
  value: number | null;
  effective_from: string;
  effective_to: string | null;
  contribution: ContributionSettings | null;
  /** Approved through a proposal (lot 2); false = existing value, not verified yet. */
  verified: boolean;
};

export type LegalVarStatus = "active" | "planned" | "stopped" | "none";

export type LegalVarRow = {
  id: string;
  key: string;
  label_fr: string;
  label_ar: string | null;
  unit: string | null;
  value_type: string;
  is_system: boolean;
  /** Value applied by the payroll of the current month (version in force on its 1st day). */
  current_numeric: number | null;
  current_text: string | null;
  effective_from: string | null;
  /** Versions starting after the 1st of the current month, earliest first. */
  planned: LegalVarVersion[];
  /** All versions, latest first. */
  history: LegalVarVersion[];
  group: ComplianceGroup;
  /** Settings of the version in force (else the next planned one), with the payslip code. */
  contribution: (ContributionSettings & { code: string }) | null;
  sort_order: number;
  status: LegalVarStatus;
  /** First month without value when the latest version has an end date. */
  stops_from: string | null;
  /** Never applied to a closed month nor to a payslip: can be erased instead of stopped. */
  deletable: boolean;
  /** Version in force on the 1st of the current month. */
  current_version: LegalVarVersion | null;
  proposals: PendingRuleProposal[];
};

export type LegalRateVersion = {
  id: string;
  employee_pct: number | null;
  employer_pct: number | null;
  fos_pct: number | null;
  effective_from: string;
  effective_to: string | null;
  verified: boolean;
};

export type CnasRegimeRow = {
  id: string;
  code: string;
  label_fr: string;
  label_ar: string;
  /** Rates in force on the 1st of the current month; null = legal rate. */
  employee_pct: number | null;
  employer_pct: number | null;
  fos_pct: number | null;
  planned: LegalRateVersion[];
  history: LegalRateVersion[];
  is_active: boolean;
  current_version: LegalRateVersion | null;
  proposals: PendingRuleProposal[];
};

export type LegalPeriod = {
  /** First month whose payroll can still change; null when no payroll was validated yet. */
  open_from: string | null;
  month_start: string;
  /** Suggested month for a change: the later of open_from and the current month. */
  default_from: string;
};

function revalidateLegal() {
  revalidatePath("/rh");
  revalidatePath("/parametres/rh/cotisations");
  revalidatePath("/rh/contrats");
  revalidatePath("/parametres/rh");
  revalidatePath("/rh/paie");
  revalidatePath("/rh/paie/irg");
  revalidatePath("/rh/paie/social");
  revalidatePath("/referentiels/variables");
  revalidatePath("/referentiels/irg");
}

function monthStartIso() {
  return `${new Date().toISOString().slice(0, 7)}-01`;
}

function nextDayIso(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

const n = (v: unknown) => (v == null ? null : Number(v));

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function openFrom(supabase: Supabase): Promise<string | null> {
  const { data } = await supabase.rpc("hr_first_open_payroll_month");
  const iso = typeof data === "string" ? data.slice(0, 10) : null;
  return iso && iso > "1900-01-01" ? iso : null;
}

export async function getLegalPeriod(): Promise<LegalPeriod> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("hr_payroll_chain_state");
  const open = earliestOpen(parseChainState(data));
  const month = monthStartIso();
  return { open_from: open, month_start: month, default_from: open && open > month ? open : month };
}

function settingsOf(
  row: { contrib_part?: unknown; contrib_base?: unknown; contrib_reduces_irg?: unknown; contrib_scope?: unknown },
): ContributionSettings | null {
  const part = row.contrib_part === "EMPLOYEE" || row.contrib_part === "EMPLOYER" ? row.contrib_part : null;
  if (!part) return null;
  return {
    part,
    base: row.contrib_base === "TAXABLE" ? "TAXABLE" : "COTISABLE",
    reduces_irg: part === "EMPLOYEE" && row.contrib_reduces_irg === true,
    scope:
      row.contrib_scope === "CACOBATPH_CONGES" || row.contrib_scope === "CACOBATPH_INTEMPERIES"
        ? row.contrib_scope
        : "ALL",
  };
}

/** Open proposals of a family, keyed by their target (var / regime id, or version id for a verification). */
async function openProposals(supabase: Supabase, family: "LEGAL_VAR" | "CNAS_RATES") {
  const { data } = await supabase
    .from("ref_rule_proposals")
    .select("id, action, status, title, target_id, requested_month")
    .eq("family", family)
    .in("status", ["DRAFT", "SUBMITTED", "APPROVED"])
    .order("created_at", { ascending: false });
  const byTarget = new Map<string, PendingRuleProposal[]>();
  for (const p of data ?? []) {
    if (!p.target_id || !isOpenRuleStatus(p.status)) continue;
    const list = byTarget.get(p.target_id) ?? [];
    list.push({
      id: p.id,
      action: p.action === "STOP" || p.action === "VERIFY" ? p.action : "SET",
      status: p.status,
      title: p.title,
      requested_month: p.requested_month ? String(p.requested_month).slice(0, 10) : null,
    });
    byTarget.set(p.target_id, list);
  }
  return byTarget;
}

function proposalsFor(byTarget: Map<string, PendingRuleProposal[]>, ids: string[]) {
  return ids.flatMap((id) => byTarget.get(id) ?? []);
}

async function usedContributionKeys(supabase: Supabase) {
  const { data } = await supabase.rpc("hr_used_contribution_keys");
  const keys = new Set<string>();
  for (const item of (data ?? []) as unknown[]) {
    if (typeof item === "string") keys.add(item);
    else if (item && typeof item === "object") {
      const v = Object.values(item as Record<string, unknown>)[0];
      if (typeof v === "string") keys.add(v);
    }
  }
  return keys;
}

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

  const [{ data: versions, error: vErr }, open, used, proposals] = await Promise.all([
    supabase
      .from("ref_global_var_versions")
      .select(
        "id, var_id, value_numeric, value_text, effective_from, effective_to, contrib_part, contrib_base, contrib_reduces_irg, contrib_scope, proposal_id",
      )
      .in(
        "var_id",
        vars.map((v) => v.id),
      )
      .order("effective_from", { ascending: false }),
    openFrom(supabase),
    usedContributionKeys(supabase),
    openProposals(supabase, "LEGAL_VAR"),
  ]);
  if (vErr) return { ok: false, error: vErr.message };

  const month = monthStartIso();
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
        (x) => x.effective_from <= month && (!x.effective_to || x.effective_to >= month),
      );
      const toVersion = (x: (typeof list)[number]): LegalVarVersion => ({
        id: x.id,
        value: n(x.value_numeric),
        effective_from: x.effective_from,
        effective_to: x.effective_to,
        contribution: settingsOf(x),
        verified: x.proposal_id != null,
      });
      const planned = list
        .filter((x) => x.effective_from > month)
        .map(toVersion)
        .reverse();
      const isContribution = v.contrib_part != null;
      const shown = current ?? list.find((x) => x.effective_from > month) ?? list[0];
      const settings = isContribution ? (shown ? settingsOf(shown) : null) ?? settingsOf(v) : null;
      const latest = list[0];
      const status: LegalVarStatus = current
        ? "active"
        : planned.length
          ? "planned"
          : list.length
            ? "stopped"
            : "none";
      const isSystem = v.is_system !== false;
      return {
        id: v.id,
        key: v.key,
        label_fr: v.label_fr,
        label_ar: v.label_ar,
        unit: v.unit,
        value_type: v.value_type,
        is_system: isSystem,
        current_numeric: current ? n(current.value_numeric) : null,
        current_text: current?.value_text ?? null,
        effective_from: current?.effective_from ?? null,
        planned,
        history: list.map(toVersion),
        group: complianceGroupOf(v.key),
        contribution: settings ? { ...settings, code: v.contrib_code ?? "" } : null,
        sort_order: Number(v.sort_order ?? 0) || 0,
        status,
        stops_from: latest?.effective_to ? nextDayIso(latest.effective_to) : null,
        deletable:
          !isSystem &&
          isContribution &&
          !used.has(v.key) &&
          list.every((x) => !open || x.effective_from >= open) &&
          list.every((x) => x.proposal_id == null),
        current_version: current ? toVersion(current) : null,
        proposals: proposalsFor(proposals, [v.id, ...list.map((x) => x.id)]),
      } satisfies LegalVarRow;
    }),
  };
}

const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-01$/, "Choisissez le mois d'effet (la paie lit la valeur du 1er du mois).");

const settingsSchema = z
  .object({
    part: z.enum(["EMPLOYEE", "EMPLOYER"]),
    base: z.enum(["COTISABLE", "TAXABLE"]),
    reduces_irg: z.boolean().default(false),
    scope: z.enum(["ALL", "CACOBATPH_CONGES", "CACOBATPH_INTEMPERIES"]).default("ALL"),
  })
  .transform((v) => ({ ...v, reduces_irg: v.part === "EMPLOYEE" && v.reduces_irg }));

const addVersionSchema = z.object({
  var_id: z.string().uuid(),
  effective_from: monthSchema,
  value_pct: z.coerce.number().min(0, "Taux ≥ 0.").max(100, "Taux ≤ 100 %.").optional(),
  value_numeric: z.coerce.number().min(0).max(99_999_999).optional(),
  as_percent: z.boolean().default(false),
  source: ruleSourceSchema,
});

function valueText(value: number, asPercent: boolean) {
  return asPercent
    ? `${String(Math.round(value * 1_000_000) / 10_000).replace(".", ",")} %`
    : String(value).replace(".", ",");
}

function toFraction(pct: number) {
  return Math.round((pct / 100) * 1_000_000) / 1_000_000;
}

function scopeFor(group: ComplianceGroup, scope: ContributionScope): ContributionScope {
  if (group !== "cacobatph") return "ALL";
  return scope === "ALL" ? "CACOBATPH_CONGES" : scope;
}

function rpcParams(group: ComplianceGroup, s: z.infer<typeof settingsSchema>) {
  return { part: s.part, base: s.base, reduces_irg: s.reduces_irg, scope: scopeFor(group, s.scope) };
}

async function loadComplianceVar(supabase: Supabase, id: string) {
  const { data } = await supabase
    .from("ref_global_vars")
    .select("id, key, label_fr, is_system, contrib_part")
    .eq("id", id)
    .maybeSingle();
  if (!data || !isComplianceKey(data.key)) return null;
  return data;
}

function proposeLegalVar(
  supabase: Supabase,
  input: {
    var_id: string;
    label: string;
    value: number;
    asPercent: boolean;
    params?: Record<string, unknown> | null;
    month: string;
    source: RuleSource;
    deviations?: string[];
  },
) {
  return saveRuleProposal(supabase, {
    family: "LEGAL_VAR",
    action: "SET",
    target_id: input.var_id,
    payload: { value: input.value, params: input.params ?? null, deviations: input.deviations ?? [] },
    title: `${input.label} : ${valueText(input.value, input.asPercent)} à partir de ${frMonth(input.month)}`.slice(0, 200),
    source_ref: input.source.source_ref,
    text_effective_date: input.source.text_effective_date,
    requested_month: input.month,
    submit: true,
    citations: input.source.citations,
  });
}

/** New value proposed from the 1st of an open month; nothing changes before approval and decision D2. */
export async function addLegalVarVersion(
  input: unknown,
): Promise<ActionResult<{ id: string; message: string }>> {
  const gate = await requireComplianceWrite();
  if (!gate.ok) return gate;
  const { body, authorize } = takeAuthorize(input);
  const parsed = addVersionSchema.safeParse(body);
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
  const variable = await loadComplianceVar(supabase, p.var_id);
  if (!variable) {
    return { ok: false, error: "Variable hors unité 05." };
  }
  const deviation = statutoryFractionDeviation(variable.key, value);
  if (deviation && !authorize) return { ok: false, error: legalOverrideError([deviation]) };
  const saved = await proposeLegalVar(supabase, {
    var_id: p.var_id,
    label: variable.label_fr,
    value,
    asPercent: p.as_percent,
    month: p.effective_from,
    source: p.source,
    deviations: deviation ? [deviation] : [],
  });
  if (!saved.ok) return saved;
  if (deviation && authorize) {
    const logged = await logLegalOverride(
      variable.key,
      { fraction: STATUTORY_RATES[variable.key]?.fraction ?? null },
      { fraction: value, effective_from: p.effective_from, proposal_id: saved.data.id },
    );
    if (logged) return { ok: false, error: `Proposition enregistrée. Journal d'audit indisponible : ${logged}` };
  }
  revalidateLegal();
  return { ok: true, data: { id: saved.data.id, message: PROPOSAL_SENT } };
}

const displaySchema = z.object({
  label_fr: z.string().trim().min(2, "Libellé requis.").max(80),
  label_ar: z.string().trim().max(80).optional().nullable(),
  code: z.string().trim().max(12).optional().nullable(),
  sort_order: z.coerce.number().int().min(0).max(9999).default(0),
});

function displayColumns(d: z.infer<typeof displaySchema>) {
  return {
    label_fr: d.label_fr,
    label_ar: d.label_ar || null,
    contrib_code: d.code || null,
    sort_order: d.sort_order,
  };
}

const createContributionSchema = z.object({
  group: z.enum(["cnas", "cacobatph", "irg"]),
  display: displaySchema,
  settings: settingsSchema,
  value_pct: z.coerce.number().gt(0, "Taux > 0.").max(100, "Taux ≤ 100 %."),
  effective_from: monthSchema,
  source: ruleSourceSchema,
});

/**
 * New contribution: the catalog row (labels, no value, so no effect) is created at once; its rate is a proposal
 * computed by the payroll only once approved and dated (D2).
 */
export async function createContribution(
  input: unknown,
): Promise<ActionResult<{ id: string; key: string; message: string }>> {
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
    p.display.label_fr,
    (existing ?? []).map((r) => r.key),
  );
  const params = rpcParams(p.group, p.settings);
  const { data: created, error } = await supabase
    .from("ref_global_vars")
    .insert({
      key,
      value_type: "numeric",
      unit: "%",
      is_system: false,
      description: "Cotisation ajoutée depuis l'unité 05",
      ...displayColumns(p.display),
      contrib_part: params.part,
      contrib_base: params.base,
      contrib_reduces_irg: params.reduces_irg,
      contrib_scope: params.scope,
    })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!created) return { ok: false, error: "Création refusée (droits)." };

  const saved = await proposeLegalVar(supabase, {
    var_id: created.id,
    label: p.display.label_fr,
    value: toFraction(p.value_pct),
    asPercent: true,
    params,
    month: p.effective_from,
    source: p.source,
  });
  if (!saved.ok) {
    await supabase.from("ref_global_vars").delete().eq("id", created.id);
    return saved;
  }
  revalidateLegal();
  return { ok: true, data: { id: created.id, key, message: PROPOSAL_SENT } };
}

const saveContributionSchema = z.object({
  var_id: z.string().uuid(),
  display: displaySchema,
  change: z
    .object({
      settings: settingsSchema,
      value_pct: z.coerce.number().gt(0, "Taux > 0.").max(100, "Taux ≤ 100 %."),
      effective_from: monthSchema,
      source: ruleSourceSchema,
    })
    .optional()
    .nullable(),
});

/** Labels apply at once (payslips keep their own copy); rate and settings are a proposal (approval, then D2). */
export async function saveContribution(input: unknown): Promise<ActionResult<{ message: string }>> {
  const gate = await requireComplianceWrite();
  if (!gate.ok) return gate;
  const parsed = saveContributionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const p = parsed.data;
  const supabase = await createClient();
  const row = await loadComplianceVar(supabase, p.var_id);
  if (!row || row.is_system || row.contrib_part == null) {
    return { ok: false, error: "Seules les cotisations ajoutées ont des paramètres." };
  }
  const group = complianceGroupOf(row.key);
  if (group === "other") return { ok: false, error: "Variable hors unité 05." };

  if (p.change) {
    const saved = await proposeLegalVar(supabase, {
      var_id: row.id,
      label: p.display.label_fr,
      value: toFraction(p.change.value_pct),
      asPercent: true,
      params: rpcParams(group, p.change.settings),
      month: p.change.effective_from,
      source: p.change.source,
    });
    if (!saved.ok) return saved;
  }
  const { data, error } = await supabase
    .from("ref_global_vars")
    .update(displayColumns(p.display))
    .eq("id", row.id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Mise à jour refusée (droits)." };
  revalidateLegal();
  return { ok: true, data: { message: p.change ? `Libellés mis à jour. ${PROPOSAL_SENT}` : "Libellés mis à jour." } };
}

/** Stop proposed from the chosen month; earlier months keep the contribution. */
export async function stopContribution(input: unknown): Promise<ActionResult<{ message: string }>> {
  const gate = await requireComplianceWrite();
  if (!gate.ok) return gate;
  const parsed = z
    .object({ var_id: z.string().uuid(), effective_from: monthSchema, source: ruleSourceSchema })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const p = parsed.data;
  const supabase = await createClient();
  const row = await loadComplianceVar(supabase, p.var_id);
  if (!row) return { ok: false, error: "Cotisation introuvable." };
  const saved = await saveRuleProposal(supabase, {
    family: "LEGAL_VAR",
    action: "STOP",
    target_id: row.id,
    payload: {},
    title: `Arrêt de ${row.label_fr} à partir de ${frMonth(p.effective_from)}`.slice(0, 200),
    source_ref: p.source.source_ref,
    text_effective_date: p.source.text_effective_date,
    requested_month: p.effective_from,
    submit: true,
    citations: p.source.citations,
  });
  if (!saved.ok) return saved;
  revalidateLegal();
  return { ok: true, data: { message: PROPOSAL_SENT } };
}

/** Erases a contribution never applied to a closed month nor to a payslip (enforced in the database). */
export async function deleteContribution(input: unknown): Promise<ActionResult> {
  const gate = await requireComplianceWrite();
  if (!gate.ok) return gate;
  const parsed = z.object({ var_id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Cotisation invalide." };
  const supabase = await createClient();
  const row = await loadComplianceVar(supabase, parsed.data.var_id);
  if (!row || row.is_system) return { ok: false, error: "Les taux légaux ne peuvent pas être supprimés." };
  const { count: openCount, error: pErr } = await supabase
    .from("ref_rule_proposals")
    .select("id", { count: "exact", head: true })
    .eq("family", "LEGAL_VAR")
    .eq("target_id", row.id)
    .in("status", ["DRAFT", "SUBMITTED", "APPROVED"]);
  if (pErr) return { ok: false, error: pErr.message };
  if ((openCount ?? 0) > 0) {
    return { ok: false, error: "Une proposition est en cours sur cette cotisation : retirez-la d'abord (écran Propositions)." };
  }
  const { data, error } = await supabase.from("ref_global_vars").delete().eq("id", row.id).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Suppression refusée (droits)." };
  revalidateLegal();
  return { ok: true, data: undefined };
}

export async function listCnasRegimes(): Promise<ActionResult<CnasRegimeRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_catalogs")
    .select("id, code, label_fr, label_ar, is_active, sort_order")
    .eq("kind", "social_profile")
    .order("sort_order")
    .order("code");
  if (error) return { ok: false, error: error.message };
  const ids = (data ?? []).map((r) => r.id);
  const [{ data: rates, error: rErr }, proposals] = await Promise.all([
    ids.length
      ? supabase
          .from("hr_social_profile_rates")
          .select("id, profile_id, employee_pct, employer_pct, fos_pct, effective_from, effective_to, proposal_id")
          .in("profile_id", ids)
          .order("effective_from", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    openProposals(supabase, "CNAS_RATES"),
  ]);
  if (rErr) return { ok: false, error: rErr.message };

  const month = monthStartIso();
  const byProfile = new Map<string, LegalRateVersion[]>();
  for (const r of (rates ?? []) as Record<string, unknown>[]) {
    const profile = String(r.profile_id);
    const list = byProfile.get(profile) ?? [];
    list.push({
      id: String(r.id),
      employee_pct: n(r.employee_pct),
      employer_pct: n(r.employer_pct),
      fos_pct: n(r.fos_pct),
      effective_from: String(r.effective_from),
      effective_to: r.effective_to ? String(r.effective_to) : null,
      verified: r.proposal_id != null,
    });
    byProfile.set(profile, list);
  }
  return {
    ok: true,
    data: (data ?? []).map((r) => {
      const history = byProfile.get(r.id) ?? [];
      const current = history.find(
        (x) => x.effective_from <= month && (!x.effective_to || x.effective_to >= month),
      );
      return {
        id: r.id,
        code: r.code,
        label_fr: r.label_fr,
        label_ar: r.label_ar ?? "",
        employee_pct: current?.employee_pct ?? null,
        employer_pct: current?.employer_pct ?? null,
        fos_pct: current?.fos_pct ?? null,
        planned: history.filter((x) => x.effective_from > month).reverse(),
        history,
        is_active: r.is_active !== false,
        current_version: current ?? null,
        proposals: proposalsFor(proposals, [r.id, ...history.map((x) => x.id)]),
      };
    }),
  };
}

const pctOrNull = z.preprocess(
  (v) => {
    if (v === undefined || v === null) return null;
    if (typeof v !== "string") return v;
    const s = v.replace(/[\s%]/g, "").replace(",", ".");
    return s ? Number(s) : null;
  },
  z.number({ error: "Taux : nombre attendu (ex. 10,2)." }).min(0, "Taux ≥ 0.").max(100, "Taux ≤ 100 %.").nullable(),
);

const regimeSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  code: z
    .string()
    .transform((s) =>
      s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, ""),
    )
    .pipe(z.string().regex(/^[A-Z0-9_]{2,30}$/, "Code : au moins 2 caractères (lettres, chiffres ou _), ex. R10.")),
  label_fr: z.string().trim().min(2, "Libellé requis.").max(80),
  label_ar: z.string().trim().max(80).optional().nullable(),
  is_active: z.boolean().default(true),
  rates: z
    .object({
      employee_pct: pctOrNull,
      employer_pct: pctOrNull,
      fos_pct: pctOrNull,
      effective_from: monthSchema,
      source: ruleSourceSchema,
    })
    .optional()
    .nullable(),
});

/**
 * CNAS regime (catalog social_profile). Labels apply at once; dated rates (blank = legal rate of the month)
 * are a proposal: approval, then decision D2.
 */
export async function saveCnasRegime(input: unknown): Promise<ActionResult<{ id: string; message: string }>> {
  const gate = await requireComplianceWrite();
  if (!gate.ok) return gate;
  const { body, authorize } = takeAuthorize(input);
  const parsed = regimeSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const p = parsed.data;
  const deviations = p.rates ? regimeRateDeviations(p.code, p.rates) : [];
  if (deviations.length && !authorize) return { ok: false, error: legalOverrideError(deviations) };
  const supabase = await createClient();
  const row = {
    kind: "social_profile",
    code: p.code,
    label_fr: p.label_fr,
    label_ar: p.label_ar || p.label_fr,
    is_active: p.is_active,
  };
  const { data, error } = p.id
    ? await supabase
        .from("hr_catalogs")
        .update({ label_fr: row.label_fr, label_ar: row.label_ar, is_active: row.is_active })
        .eq("id", p.id)
        .eq("kind", "social_profile")
        .select("id")
        .maybeSingle()
    : await supabase.from("hr_catalogs").insert(row).select("id").maybeSingle();
  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? `Le code ${p.code} existe déjà.` : error.message,
    };
  }
  if (!data) return { ok: false, error: "Enregistrement refusé (droits)." };

  if (p.rates) {
    const pctText = (v: number | null) => (v == null ? "légal" : `${String(v).replace(".", ",")} %`);
    const saved = await saveRuleProposal(supabase, {
      family: "CNAS_RATES",
      action: "SET",
      target_id: data.id,
      payload: {
        employee_pct: p.rates.employee_pct,
        employer_pct: p.rates.employer_pct,
        fos_pct: p.rates.fos_pct,
        deviations,
      },
      title: `Régime CNAS ${p.code} : ${pctText(p.rates.employee_pct)} / ${pctText(p.rates.employer_pct)} / FOS ${pctText(
        p.rates.fos_pct,
      )} à partir de ${frMonth(p.rates.effective_from)}`.slice(0, 200),
      source_ref: p.rates.source.source_ref,
      text_effective_date: p.rates.source.text_effective_date,
      requested_month: p.rates.effective_from,
      submit: true,
      citations: p.rates.source.citations,
    });
    if (!saved.ok) {
      if (!p.id) await supabase.from("hr_catalogs").delete().eq("id", data.id);
      return saved;
    }
    if (deviations.length && authorize) {
      const logged = await logLegalOverride(
        `cnas:${p.code}`,
        STATUTORY_CNAS,
        { ...p.rates, decision: "AUTORISER_DEPASSEMENT", proposal_id: saved.data.id },
      );
      if (logged) return { ok: false, error: `Proposition enregistrée. Journal d'audit indisponible : ${logged}` };
    }
  }
  revalidateLegal();
  return { ok: true, data: { id: data.id, message: p.rates ? PROPOSAL_SENT : `Régime ${p.code} enregistré.` } };
}

/** Erases a regime nobody uses and never applied to a closed month; payslips keep their frozen snapshot. */
export async function deleteCnasRegime(input: unknown): Promise<ActionResult> {
  const gate = await requireComplianceWrite();
  if (!gate.ok) return gate;
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Régime invalide." };
  const supabase = await createClient();
  const { data: regime } = await supabase
    .from("hr_catalogs")
    .select("id, code")
    .eq("id", parsed.data.id)
    .eq("kind", "social_profile")
    .maybeSingle();
  if (!regime) return { ok: false, error: "Régime introuvable." };
  if (regime.code === "STANDARD") {
    return { ok: false, error: "STANDARD est le régime par défaut : il ne peut pas être supprimé." };
  }
  const open = await openFrom(supabase);
  const [employees, contracts, overrides, closedRates] = await Promise.all([
    supabase
      .from("hr_employee_social")
      .select("employee_id", { count: "exact", head: true })
      .eq("social_profile_code", regime.code),
    supabase
      .from("hr_contracts")
      .select("id", { count: "exact", head: true })
      .eq("cnas_regime_code", regime.code),
    supabase
      .from("hr_contract_compliance")
      .select("id", { count: "exact", head: true })
      .eq("domain", "CNAS")
      .eq("params->>regime_code", regime.code),
    open
      ? supabase
          .from("hr_social_profile_rates")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", regime.id)
          .lt("effective_from", open)
      : Promise.resolve({ count: 0, error: null }),
  ]);
  const failed = [employees, contracts, overrides, closedRates].find((r) => r.error);
  if (failed?.error) return { ok: false, error: failed.error.message };
  const users = (employees.count ?? 0) + (contracts.count ?? 0) + (overrides.count ?? 0);
  if (users > 0) {
    return {
      ok: false,
      error: `Régime ${regime.code} attribué à ${users} salarié(s) ou contrat(s) : changez leur régime d'abord, ou décochez « Régime actif ».`,
    };
  }
  if ((closedRates.count ?? 0) > 0) {
    return {
      ok: false,
      error: `Régime ${regime.code} déjà appliqué à des paies validées : décochez « Régime actif » pour ne plus l'utiliser.`,
    };
  }
  const { data, error } = await supabase
    .from("hr_catalogs")
    .delete()
    .eq("id", regime.id)
    .eq("kind", "social_profile")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Suppression refusée (droits)." };
  revalidateLegal();
  return { ok: true, data: undefined };
}