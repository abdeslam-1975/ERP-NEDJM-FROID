import { AppShell } from "@/components/layout/app-shell";
import { PeriodLocksManager } from "@/components/admin/admin-managers";
import { listPayrollMonthStatus, listPeriodLocks } from "@/lib/actions/admin-rbac";
import { requireRoles, workspaceHasRole } from "@/lib/auth/require-roles";

export const dynamic = "force-dynamic";

export default async function PeriodesPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const workspace = await requireRoles(["SUPER_ADMIN", "GERANT", "ADMIN_FINANCE"]);
  const sp = await searchParams;
  const parsed = Number(sp.year);
  const year = Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : new Date().getFullYear();
  const [locks, payroll] = await Promise.all([listPeriodLocks(year), listPayrollMonthStatus(year)]);
  return (
    <AppShell title="Clôture des périodes">
      <PeriodLocksManager
        key={year}
        year={year}
        initialLocks={locks.ok ? locks.data : []}
        payroll={payroll}
        canEdit={workspace.isSuperAdmin || workspaceHasRole(workspace, ["GERANT", "ADMIN_FINANCE"])}
        loadError={locks.ok ? undefined : locks.error}
      />
    </AppShell>
  );
}
