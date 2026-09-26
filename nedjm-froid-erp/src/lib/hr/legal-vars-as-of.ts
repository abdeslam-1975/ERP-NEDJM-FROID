import type { createClient } from "@/lib/supabase/server";
import { parseSnapshotCompliance, type SnapshotCompliance } from "@/lib/hr/compliance";

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
