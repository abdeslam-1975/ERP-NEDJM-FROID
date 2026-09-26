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
};

export type LegalRateVersion = {
  id: string;
  employee_pct: number | null;
  employer_pct: number | null;
  fos_pct: number | null;
  effective_from: string;
  effective_to: string | null;
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
  revalidatePath("/rh/legal");
  revalidatePath("/rh/contrats");
  revalidatePath("/rh/parametres");
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
  const open = await openFrom(supabase);
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

  const [{ data: versions, error: vErr }, open, used] = await Promise.all([
    supabase
      .from("ref_global_var_versions")
      .select(
        "id, var_id, value_numeric, value_text, effective_from, effective_to, contrib_part, contrib_base, contrib_reduces_irg, contrib_scope",
      )
      .in(
        "var_id",
        vars.map((v) => v.id),
      )
      .order("effective_from", { ascending: false }),
    openFrom(supabase),
    usedContributionKeys(supabase),
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
          list.every((x) => !open || x.effective_from >= open),
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
});

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
    .select("id, key, is_system, contrib_part")
    .eq("id", id)
    .maybeSingle();
  if (!data || !isComplianceKey(data.key)) return null;
  return data;
}

/** New value from the 1st of an open month; same month replaces the value planned for it. */
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

/** Withdraw a value planned for an open month; the previous value covers its period again. */
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
});

/** New contribution computed by the payroll from the chosen month (CNAS, CACOBATPH or taxes tab). */
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

  const { error: vErr } = await supabase.rpc("hr_set_legal_var_version", {
    p_var_id: created.id,
    p_from: p.effective_from,
    p_value: toFraction(p.value_pct),
    p_params: params,
  });
  if (vErr) {
    await supabase.from("ref_global_vars").delete().eq("id", created.id);
    return { ok: false, error: vErr.message };
  }
  revalidateLegal();
  return { ok: true, data: { id: created.id, key } };
}

const saveContributionSchema = z.object({
  var_id: z.string().uuid(),
  display: displaySchema,
  change: z
    .object({
      settings: settingsSchema,
      value_pct: z.coerce.number().gt(0, "Taux > 0.").max(100, "Taux ≤ 100 %."),
      effective_from: monthSchema,
    })
    .optional()
    .nullable(),
});

/** Labels apply at once (payslips keep their own copy); rate and settings only from the chosen month. */
export async function saveContribution(input: unknown): Promise<ActionResult> {
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
    const { error: vErr } = await supabase.rpc("hr_set_legal_var_version", {
      p_var_id: row.id,
      p_from: p.change.effective_from,
      p_value: toFraction(p.change.value_pct),
      p_params: rpcParams(group, p.change.settings),
    });
    if (vErr) return { ok: false, error: vErr.message };
  }
  const { data, error } = await supabase
    .from("ref_global_vars")
    .update(displayColumns(p.display))
    .eq("id", row.id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Mise à jour refusée (droits)." };
  revalidateLegal();
  return { ok: true, data: undefined };
}

/** No longer computed from the chosen month; earlier months keep it. */
export async function stopContribution(input: unknown): Promise<ActionResult> {
  const gate = await requireComplianceWrite();
  if (!gate.ok) return gate;
  const parsed = z.object({ var_id: z.string().uuid(), effective_from: monthSchema }).safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("hr_stop_legal_var", {
    p_var_id: parsed.data.var_id,
    p_from: parsed.data.effective_from,
  });
  if (error) return { ok: false, error: error.message };
  revalidateLegal();
  return { ok: true, data: undefined };
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
  const { data: rates, error: rErr } = ids.length
    ? await supabase
        .from("hr_social_profile_rates")
        .select("id, profile_id, employee_pct, employer_pct, fos_pct, effective_from, effective_to")
        .in("profile_id", ids)
        .order("effective_from", { ascending: false })
    : { data: [], error: null };
  if (rErr) return { ok: false, error: rErr.message };

  const month = monthStartIso();
  const byProfile = new Map<string, LegalRateVersion[]>();
  for (const r of rates ?? []) {
    const list = byProfile.get(r.profile_id) ?? [];
    list.push({
      id: r.id,
      employee_pct: n(r.employee_pct),
      employer_pct: n(r.employer_pct),
      fos_pct: n(r.fos_pct),
      effective_from: r.effective_from,
      effective_to: r.effective_to,
    });
    byProfile.set(r.profile_id, list);
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
    })
    .optional()
    .nullable(),
});

/** CNAS regime (catalog social_profile). Rates are dated: blank = legal rate of the month. */
export async function saveCnasRegime(input: unknown): Promise<ActionResult<{ id: string }>> {
  const gate = await requireComplianceWrite();
  if (!gate.ok) return gate;
  const parsed = regimeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const p = parsed.data;
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
    const { error: rErr } = await supabase.rpc("hr_set_social_profile_rates", {
      p_profile_id: data.id,
      p_from: p.rates.effective_from,
      p_employee: p.rates.employee_pct,
      p_employer: p.rates.employer_pct,
      p_fos: p.rates.fos_pct,
    });
    if (rErr) {
      if (!p.id) await supabase.from("hr_catalogs").delete().eq("id", data.id);
      return { ok: false, error: rErr.message };
    }
  }
  revalidateLegal();
  return { ok: true, data: { id: data.id } };
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

export async function cancelCnasRegimeRates(input: unknown): Promise<ActionResult> {
  const gate = await requireComplianceWrite();
  if (!gate.ok) return gate;
  const parsed = z.object({ version_id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Version invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("hr_cancel_social_profile_rates", { p_id: parsed.data.version_id });
  if (error) return { ok: false, error: error.message };
  revalidateLegal();
  return { ok: true, data: undefined };
}
