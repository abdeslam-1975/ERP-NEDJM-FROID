import type { createClient } from "@/lib/supabase/server";
import type { IrgBracket, IrgRule } from "@/lib/hr/irg-calc";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Rule row applied by the payroll: status LEGACY = existing value never verified; proposal/decision = lot 2 trace. */
export type RuleRowTrace = {
  id: string;
  status: string;
  proposal_id: string | null;
  decision_id: string | null;
};

export type IrgEngine = {
  brackets: IrgBracket[];
  rulesByCategory: Record<string, IrgRule[]>;
  trace: {
    bareme: RuleRowTrace | null;
    rule_sets: Record<string, RuleRowTrace>;
  };
};

/** Only rows in force are read by the payroll: drafts, proposals and replaced versions never apply. */
export const IRG_LIVE_STATUSES = ["LEGACY", "APPLIED"] as const;

function num(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function traceOf(row: Record<string, unknown>): RuleRowTrace {
  return {
    id: String(row.id),
    status: typeof row.status === "string" ? row.status : "LEGACY",
    proposal_id: typeof row.proposal_id === "string" ? row.proposal_id : null,
    decision_id: typeof row.decision_id === "string" ? row.decision_id : null,
  };
}

/** Barème version and rule sets in force at `asOf`, rules grouped by taxpayer category. */
export async function loadIrgEngine(
  supabase: Supabase,
  asOf: string,
): Promise<{ ok: true; data: IrgEngine } | { ok: false; error: string }> {
  const { data: versions, error: vErr } = await supabase
    .from("ref_bareme_irg_versions")
    .select("id, effective_from, effective_to, status, proposal_id, decision_id")
    .in("status", [...IRG_LIVE_STATUSES])
    .lte("effective_from", asOf)
    .order("effective_from", { ascending: false });
  if (vErr) return { ok: false, error: `Barème IRG : ${vErr.message}` };
  const version = ((versions ?? []) as Record<string, unknown>[]).find(
    (v) => !v.effective_to || String(v.effective_to) >= asOf,
  );
  let brackets: IrgBracket[] = [];
  if (version) {
    const { data: rows, error: bErr } = await supabase
      .from("ref_bareme_irg")
      .select("min_annual, max_annual, rate, sort_order")
      .eq("version_id", String(version.id))
      .order("sort_order");
    if (bErr) return { ok: false, error: `Barème IRG : ${bErr.message}` };
    brackets = (rows ?? []).map((r) => ({
      min_annual: num(r.min_annual),
      max_annual: r.max_annual == null ? null : num(r.max_annual),
      rate: num(r.rate),
    }));
  }
  const { data: sets, error: sErr } = await supabase
    .from("ref_irg_rule_sets")
    .select("id, taxpayer_category, effective_from, effective_to, status, proposal_id, decision_id")
    .in("status", [...IRG_LIVE_STATUSES])
    .lte("effective_from", asOf)
    .order("effective_from", { ascending: false });
  if (sErr) return { ok: false, error: `Règles IRG : ${sErr.message}` };
  const chosen = new Map<string, RuleRowTrace>();
  for (const s of (sets ?? []) as Record<string, unknown>[]) {
    if (s.effective_to && String(s.effective_to) < asOf) continue;
    const cat = String(s.taxpayer_category);
    if (!chosen.has(cat)) chosen.set(cat, traceOf(s));
  }
  const setIds = [...chosen.values()].map((s) => s.id);
  const rulesByCategory: Record<string, IrgRule[]> = {};
  if (setIds.length) {
    const { data: rules, error: rErr } = await supabase
      .from("ref_irg_rules")
      .select("rule_set_id, kind, params, formula, sequence")
      .in("rule_set_id", setIds)
      .order("sequence");
    if (rErr) return { ok: false, error: `Règles IRG : ${rErr.message}` };
    const setToCat = new Map([...chosen.entries()].map(([cat, s]) => [s.id, cat]));
    for (const rule of rules ?? []) {
      const cat = setToCat.get(rule.rule_set_id);
      if (!cat) continue;
      const list = rulesByCategory[cat] ?? [];
      list.push({
        kind: rule.kind,
        params: (rule.params ?? {}) as Record<string, unknown>,
        formula: rule.formula ?? null,
      });
      rulesByCategory[cat] = list;
    }
  }
  return {
    ok: true,
    data: {
      brackets,
      rulesByCategory,
      trace: { bareme: version ? traceOf(version) : null, rule_sets: Object.fromEntries(chosen) },
    },
  };
}
