import { RhShell } from "@/components/rh/rh-shell";
import { PayrollManager } from "@/components/rh/payroll-manager";
import { listPayrollRuns, listPayrollSlips, loadPayrollIrgScales } from "@/lib/actions/hr-ops";
import { listSites } from "@/lib/actions/sites";
import { loadPayrollBulletinContext } from "@/lib/actions/hr-bulletin";
import { resolvePayrollPeriod } from "@/lib/hr/payroll-calc";

export const dynamic = "force-dynamic";

export default async function PaiePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const { year, month } = resolvePayrollPeriod(sp.year, sp.month);
  const [slips, runs, sites, bulletin, irgScales] = await Promise.all([
    listPayrollSlips({ year, month, includeLines: false }),
    listPayrollRuns({ year, month }),
    listSites(),
    loadPayrollBulletinContext(),
    loadPayrollIrgScales({ year, month }),
  ]);
  return (
    <RhShell title="Paie">
      <PayrollManager
        initialSlips={slips.ok ? slips.data : []}
        initialRuns={runs.ok ? runs.data.runs : []}
        generationRequests={runs.ok ? runs.data.generation_requests : []}
        chainDecisionId={runs.ok ? runs.data.chain_decision_id : null}
        canValidate={runs.ok && runs.data.can_validate}
        canClose={runs.ok && runs.data.can_close}
        sites={sites.ok ? sites.data.filter((s) => s.is_active) : []}
        year={year}
        month={month}
        view="all"
        bulletin={bulletin.bulletin}
        bulletinTemplate={bulletin.template}
        legalRates={bulletin.legalRates}
        irgScales={irgScales.ok ? irgScales.data : null}
        loadError={(!slips.ok && slips.error) || (!runs.ok && runs.error) || (!sites.ok && sites.error) || bulletin.error || (!irgScales.ok ? irgScales.error : undefined)}
      />
    </RhShell>
  );
}
