import type { createClient } from "@/lib/supabase/server";
import { parseSnapshotCompliance, type SnapshotCompliance } from "@/lib/hr/compliance";
import { contributionDefFromRow, type ContributionDef } from "@/lib/hr/contributions";
import type { RuleRowTrace } from "@/lib/hr/irg-engine-load";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Legal rates frozen on a payroll slip at generation time. */
export type PayrollLegalSnapshot = {
  /** Date used to pick each variable version (YYYY-MM-DD). */
  as_of: string;
  /** ref_global_vars.key → numeric value applied to this slip (CNAS keys follow the slip regime). */
  vars: Record<string, number>;
  irg_category: string;
  /** Absent on slips generated before the compliance engine. */
  compliance?: SnapshotCompliance | null;
  /** Assignment in force on the 1st that set the site and IRG zone of the month (absent before lot 1). */
  assignment?: {
    id: string | null;
    contract_id: string;
    site_id: string;
    zone_code: string;
  } | null;
  /** Versions and decisions behind the slip (absent before lot 2). */
  trace?: PayrollSlipTrace | null;
};

export const RULE_TRACE_FAMILIES = ["LEGAL_VAR", "CNAS_RATES", "IRG_BAREME", "IRG_RULES", "IRG_ZONE_SCOPE"] as const;
export type RuleTraceFamily = (typeof RULE_TRACE_FAMILIES)[number];

/** Rule row applied to the slip; proposal_id null = existing value never verified. */
export type SlipRuleRef = RuleRowTrace & { family: RuleTraceFamily; key: string };

export type PayrollSlipTrace = {
  rules: SlipRuleRef[];
  contract: { id: string; start_exception_decision: string | null };
  assignment: { id: string | null; corrected_by_decision: string | null };
  /** hr_contract_salary_history row; null = salary of the contract record. */
  salary_version_id: string | null;
  /** D4 (or D3 policy) decision that authorised the generation. */
  payroll_decision_id: string | null;
};

export function unverifiedRules(trace: PayrollSlipTrace | null | undefined): SlipRuleRef[] {
  return (trace?.rules ?? []).filter((r) => !r.proposal_id);
}

const strOrNull = (v: unknown) => (typeof v === "string" && v ? v : null);

function parseSlipTrace(raw: unknown): PayrollSlipTrace | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const contract = (t.contract ?? {}) as Record<string, unknown>;
  const assignment = (t.assignment ?? {}) as Record<string, unknown>;
  if (typeof contract.id !== "string") return null;
  const rules: SlipRuleRef[] = [];
  for (const item of Array.isArray(t.rules) ? t.rules : []) {
    const r = (item ?? {}) as Record<string, unknown>;
    const family = RULE_TRACE_FAMILIES.find((f) => f === r.family);
    if (!family || typeof r.id !== "string" || typeof r.key !== "string") continue;
    rules.push({
      family,
      key: r.key,
      id: r.id,
      status: typeof r.status === "string" ? r.status : "LEGACY",
      proposal_id: strOrNull(r.proposal_id),
      decision_id: strOrNull(r.decision_id),
    });
  }
  return {
    rules,
    contract: { id: contract.id, start_exception_decision: strOrNull(contract.start_exception_decision) },
    assignment: { id: strOrNull(assignment.id), corrected_by_decision: strOrNull(assignment.corrected_by_decision) },
    salary_version_id: strOrNull(t.salary_version_id),
    payroll_decision_id: strOrNull(t.payroll_decision_id),
  };
}

function parseAssignment(raw: unknown): PayrollLegalSnapshot["assignment"] {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if (typeof a.contract_id !== "string" || typeof a.site_id !== "string") return null;
  return {
    id: strOrNull(a.id),
    contract_id: a.contract_id,
    site_id: a.site_id,
    zone_code: typeof a.zone_code === "string" ? a.zone_code : "",
  };
}

/** Numeric legal variables in force on a given date (latest version per key). */
export async function legalVarsAsOf(
  supabase: Supabase,
  asOf: string,
): Promise<Record<string, number>> {
  return (await legalVarVersionsAsOf(supabase, asOf)).vars;
}

/** Same values, plus the version row behind each key (for the payslip trace). */
export async function legalVarVersionsAsOf(
  supabase: Supabase,
  asOf: string,
): Promise<{ vars: Record<string, number>; rows: Record<string, RuleRowTrace> }> {
  const { data, error } = await supabase
    .from("ref_global_var_versions")
    .select("id, value_numeric, effective_from, effective_to, proposal_id, decision_id, ref_global_vars ( key )")
    .lte("effective_from", asOf)
    .order("effective_from", { ascending: false });
  // An empty map would let payroll run with every legal rate missing.
  if (error) throw new Error(`Variables légales illisibles : ${error.message}`);
  const vars: Record<string, number> = {};
  const rows: Record<string, RuleRowTrace> = {};
  for (const row of data ?? []) {
    if (row.effective_to && row.effective_to < asOf) continue;
    const v = Array.isArray(row.ref_global_vars) ? row.ref_global_vars[0] : row.ref_global_vars;
    const key = (v as { key?: string } | null)?.key;
    if (!key || key in vars || row.value_numeric == null) continue;
    const n = Number(row.value_numeric);
    if (!Number.isFinite(n)) continue;
    vars[key] = n;
    rows[key] = {
      id: String(row.id),
      status: row.proposal_id ? "APPLIED" : "LEGACY",
      proposal_id: row.proposal_id ? String(row.proposal_id) : null,
      decision_id: row.decision_id ? String(row.decision_id) : null,
    };
  }
  return { vars, rows };
}

/** User-defined contributions (unit 05) in force on `asOf`, with the settings of that version. */
export async function loadContributionDefs(
  supabase: Supabase,
  asOf: string,
): Promise<{ ok: true; data: ContributionDef[] } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("ref_global_var_versions")
    .select(
      "contrib_part, contrib_base, contrib_reduces_irg, contrib_scope, ref_global_vars!inner ( key, label_fr, label_ar, contrib_part, contrib_base, contrib_reduces_irg, contrib_scope, contrib_code, sort_order )",
    )
    .lte("effective_from", asOf)
    .or(`effective_to.is.null,effective_to.gte.${asOf}`);
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).flatMap((row) => {
      const joined = row.ref_global_vars as unknown;
      const v = (Array.isArray(joined) ? joined[0] : joined) as Record<string, unknown> | null;
      if (!v || (row.contrib_part == null && v.contrib_part == null)) return [];
      const def = contributionDefFromRow({
        ...v,
        contrib_part: row.contrib_part ?? v.contrib_part,
        contrib_base: row.contrib_base ?? v.contrib_base,
        contrib_reduces_irg: row.contrib_reduces_irg ?? v.contrib_reduces_irg,
        contrib_scope: row.contrib_scope ?? v.contrib_scope,
      });
      return def ? [def] : [];
    }),
  };
}

export function parseLegalSnapshot(raw: unknown): PayrollLegalSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<PayrollLegalSnapshot>;
  if (typeof r.as_of !== "string" || !r.vars || typeof r.vars !== "object") return null;
  const vars: Record<string, number> = {};
  for (const [k, v] of Object.entries(r.vars)) {
    const n = Number(v);
    if (Number.isFinite(n)) vars[k] = n;
  }
  return {
    as_of: r.as_of,
    vars,
    irg_category: String(r.irg_category ?? "STANDARD"),
    compliance: parseSnapshotCompliance(r.compliance),
    assignment: parseAssignment(r.assignment),
    trace: parseSlipTrace(r.trace),
  };
}
