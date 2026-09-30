import type { createClient } from "@/lib/supabase/server";
import { parseSnapshotCompliance, type SnapshotCompliance } from "@/lib/hr/compliance";
import { contributionDefFromRow, type ContributionDef } from "@/lib/hr/contributions";

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
};

/** Numeric legal variables in force on a given date (latest version per key). */
export async function legalVarsAsOf(
  supabase: Supabase,
  asOf: string,
): Promise<Record<string, number>> {
  const { data } = await supabase
    .from("ref_global_var_versions")
    .select("value_numeric, effective_from, effective_to, ref_global_vars ( key )")
    .lte("effective_from", asOf)
    .order("effective_from", { ascending: false });
  const out: Record<string, number> = {};
  for (const row of data ?? []) {
    if (row.effective_to && row.effective_to < asOf) continue;
    const v = Array.isArray(row.ref_global_vars) ? row.ref_global_vars[0] : row.ref_global_vars;
    const key = (v as { key?: string } | null)?.key;
    if (!key || key in out || row.value_numeric == null) continue;
    const n = Number(row.value_numeric);
    if (Number.isFinite(n)) out[key] = n;
  }
  return out;
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
  };
}
