import { RhShell } from "@/components/rh/rh-shell";
import { PayrollManager } from "@/components/rh/payroll-manager";
import { listPayrollRuns, listPayrollSlips } from "@/lib/actions/hr-ops";
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
  const [slips, runs, sites, bulletin] = await Promise.all([
    listPayrollSlips({ year, month, includeLines: false }),
    listPayrollRuns({ year, month }),
    listSites(),
    loadPayrollBulletinContext(),
  ]);
  return (
    <RhShell title="Paie">
      <PayrollManager
        initialSlips={slips.ok ? slips.data : []}
        initialRuns={runs.ok ? runs.data.runs : []}
        canValidate={runs.ok && runs.data.can_validate}
        canClose={runs.ok && runs.data.can_close}
        sites={sites.ok ? sites.data.filter((s) => s.is_active) : []}
        year={year}
        month={month}
        view="all"
        bulletin={bulletin.bulletin}
        legalRates={bulletin.legalRates}
        loadError={(!slips.ok && slips.error) || (!runs.ok && runs.error) || (!sites.ok && sites.error) || bulletin.error}
      />
    </RhShell>
  );
}
