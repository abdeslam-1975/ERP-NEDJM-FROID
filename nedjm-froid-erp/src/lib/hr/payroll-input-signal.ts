import type { createClient } from "@/lib/supabase/server";
import { parsePayrollSignal, type PayrollInputSource, type PayrollSignal } from "@/lib/decisions/catalog";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PayrollInputChange = {
  source: PayrollInputSource;
  employeeId?: string | null;
  contractIds?: string[];
  siteId?: string | null;
  year?: number;
  month?: number;
  detail?: string;
};

/**
 * Draft payrolls touched by a change are flagged "données modifiées depuis le calcul" and a D3
 * decision is requested; a validated attendance month without payroll opens a D4 request.
 * Nothing is created or recalculated here.
 */
export async function signalPayrollInputChange(
  supabase: Supabase,
  change: PayrollInputChange,
): Promise<{ ok: true; data: PayrollSignal } | { ok: false; error: string }> {
  const employeeId = change.employeeId && UUID_RE.test(change.employeeId) ? change.employeeId : null;
  const contractIds = (change.contractIds ?? []).filter((id) => UUID_RE.test(id));
  const siteId = change.siteId && UUID_RE.test(change.siteId) ? change.siteId : null;
  if (!employeeId && !contractIds.length && !siteId) {
    return { ok: true, data: { flagged_runs: 0, generation_decision: null } };
  }
  const { data, error } = await supabase.rpc("hr_payroll_signal_input_change", {
    p_source: change.source,
    p_employee: employeeId,
    p_contracts: contractIds.length ? contractIds : null,
    p_site: siteId,
    p_year: change.year ?? null,
    p_month: change.month ?? null,
    p_detail: change.detail?.slice(0, 300) ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: parsePayrollSignal(data) };
}
