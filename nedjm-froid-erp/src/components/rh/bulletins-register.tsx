import { PayrollManager } from "@/components/rh/payroll-manager";
import { listPayrollRuns, listPayrollSlips, loadPayrollIrgScales } from "@/lib/actions/hr-ops";
import { listSites } from "@/lib/actions/sites";
import { loadPayrollBulletinContext } from "@/lib/actions/hr-bulletin";
import { listBulletinArchives } from "@/lib/hr/bulletin-archive";

/** Register of the month's payslips, shown in the Documents page. */
export async function BulletinsRegister({ year, month }: { year: number; month: number }) {
  const [slips, runs, sites, bulletin, irgScales, archives] = await Promise.all([
    listPayrollSlips({ year, month, includeLines: false }),
    listPayrollRuns({ year, month }),
    listSites(),
    loadPayrollBulletinContext(),
    loadPayrollIrgScales({ year, month }),
    listBulletinArchives(year, month),
  ]);
  return (
    <PayrollManager
      initialSlips={slips.ok ? slips.data : []}
      initialRuns={runs.ok ? runs.data.runs : []}
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
      bulletinArchives={archives}
      loadError={
        (!slips.ok && slips.error) ||
        (!runs.ok && runs.error) ||
        (!sites.ok && sites.error) ||
        bulletin.error ||
        (!irgScales.ok ? irgScales.error : undefined)
      }
    />
  );
}
