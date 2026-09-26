import { RhShell } from "@/components/rh/rh-shell";
import { TransfersManager } from "@/components/rh/transfers-manager";
import { listTransferBatches } from "@/lib/actions/hr-transfers";
import { loadHrLookups } from "@/lib/actions/hr-lookups";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { HR_SALARY_VALUE_ROLES, workspaceHasRole } from "@/lib/auth/require-roles";
import { resolvePayrollPeriod } from "@/lib/hr/payroll-calc";

export const dynamic = "force-dynamic";

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const { year, month } = resolvePayrollPeriod(sp.year, sp.month);
  const [batches, lookups, workspace] = await Promise.all([
    listTransferBatches({ year, month }),
    loadHrLookups(),
    getWorkspaceProfile(),
  ]);
  const canEdit = workspace ? workspaceHasRole(workspace, HR_SALARY_VALUE_ROLES) : false;
  return (
    <RhShell title="Virements des salaires">
      <TransfersManager
        initialBatches={batches.ok ? batches.data : []}
        sites={lookups.sites}
        year={year}
        month={month}
        canEdit={canEdit}
        loadError={(!batches.ok && batches.error) || lookups.error || undefined}
      />
    </RhShell>
  );
}
