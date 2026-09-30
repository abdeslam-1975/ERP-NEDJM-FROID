import { RhShell } from "@/components/rh/rh-shell";
import { TransfersManager } from "@/components/rh/transfers-manager";
import { listTransferBatches, listTransferDecisions } from "@/lib/actions/hr-transfers";
import { loadHrLookups } from "@/lib/actions/hr-lookups";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { HR_SALARY_VALUE_ROLES, workspaceHasRole } from "@/lib/auth/require-roles";
import { resolvePayrollPeriod } from "@/lib/hr/payroll-calc";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; decision?: string }>;
}) {
  const sp = await searchParams;
  const decision = sp.decision && UUID_RE.test(sp.decision) ? sp.decision : null;
  let yearParam = sp.year;
  let monthParam = sp.month;
  if (decision && !yearParam && !monthParam) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("sys_decisions")
      .select("period_year, period_month")
      .eq("id", decision)
      .eq("type_code", "D9")
      .maybeSingle();
    if (data?.period_year && data.period_month) {
      yearParam = String(data.period_year);
      monthParam = String(data.period_month);
    }
  }
  const { year, month } = resolvePayrollPeriod(yearParam, monthParam);
  const [batches, decisions, lookups, workspace] = await Promise.all([
    listTransferBatches({ year, month }),
    listTransferDecisions({ year, month }),
    loadHrLookups(),
    getWorkspaceProfile(),
  ]);
  const canEdit = workspace ? workspaceHasRole(workspace, HR_SALARY_VALUE_ROLES) : false;
  return (
    <RhShell title="Virements des salaires">
      <TransfersManager
        initialBatches={batches.ok ? batches.data : []}
        initialDecisions={decisions.ok ? decisions.data : []}
        highlightDecision={decision}
        sites={lookups.sites}
        year={year}
        month={month}
        canEdit={canEdit}
        loadError={(!batches.ok && batches.error) || (!decisions.ok && decisions.error) || lookups.error || undefined}
      />
    </RhShell>
  );
}
