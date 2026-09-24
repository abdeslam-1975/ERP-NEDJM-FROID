import { RhShell } from "@/components/rh/rh-shell";
import { PayrollManager } from "@/components/rh/payroll-manager";
import { listPayrollSlips } from "@/lib/actions/hr-ops";
import { loadHrLookups } from "@/lib/actions/hr-lookups";
import { loadPayrollBulletinContext } from "@/lib/actions/hr-bulletin";
import { resolvePayrollPeriod } from "@/lib/hr/payroll-calc";

export const dynamic = "force-dynamic";

export default async function FiscalPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const { year, month } = resolvePayrollPeriod(sp.year, sp.month);
  const [slips, lookups, bulletin] = await Promise.all([
    listPayrollSlips({ year, month }),
    loadHrLookups(),
    loadPayrollBulletinContext(),
  ]);
  return (
    <RhShell title="Retenue IRG">
      <PayrollManager
        initialSlips={slips.ok ? slips.data : []}
        sites={lookups.sites}
        year={year}
        month={month}
        view="fiscal"
        bulletin={bulletin.bulletin}
        legalRates={bulletin.legalRates}
        loadError={(!slips.ok && slips.error) || lookups.error || bulletin.error}
      />
    </RhShell>
  );
}
