import { RhShell } from "@/components/rh/rh-shell";
import { InterimManager } from "@/components/rh/interim-manager";
import { listAgencies, listInterimStatements } from "@/lib/actions/hr-interim";
import { loadHrLookups } from "@/lib/actions/hr-lookups";
import { HR_SALARY_VALUE_ROLES, requireRoles, workspaceHasRole } from "@/lib/auth/require-roles";
import { resolvePayrollPeriod } from "@/lib/hr/payroll-calc";

export const dynamic = "force-dynamic";

export default async function InterimPage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const workspace = await requireRoles(["SUPER_ADMIN", "ADMIN_RH", "GERANT", "ADMIN_FINANCE"]);
  const sp = await searchParams;
  const { year, month } = resolvePayrollPeriod(sp.year, sp.month);
  const [agencies, statements, lookups] = await Promise.all([
    listAgencies(),
    listInterimStatements({ year, month }),
    loadHrLookups(),
  ]);
  return (
    <RhShell title="Intérim">
      <InterimManager
        initialAgencies={agencies.ok ? agencies.data : []}
        initialStatements={statements.ok ? statements.data : []}
        sites={lookups.sites}
        year={year}
        month={month}
        canEdit={workspaceHasRole(workspace, HR_SALARY_VALUE_ROLES)}
        loadError={(!agencies.ok && agencies.error) || (!statements.ok && statements.error) || lookups.error || undefined}
      />
    </RhShell>
  );
}
