import { RhShell } from "@/components/rh/rh-shell";
import { CostsManager } from "@/components/rh/costs-manager";
import { loadCostReport } from "@/lib/actions/hr-costs";
import { requireRoles, workspaceHasRole } from "@/lib/auth/require-roles";
import { resolvePayrollPeriod } from "@/lib/hr/payroll-calc";

export const dynamic = "force-dynamic";

export default async function CostsPage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const workspace = await requireRoles(["SUPER_ADMIN", "ADMIN_RH", "GERANT", "ADMIN_FINANCE"]);
  const sp = await searchParams;
  const { year, month } = resolvePayrollPeriod(sp.year, sp.month);
  const report = await loadCostReport({ year, month });
  return (
    <RhShell title="Coûts par chantier / contrat">
      <CostsManager
        report={report.ok ? report.data : null}
        canEditAccounts={workspace.isSuperAdmin || workspaceHasRole(workspace, ["ADMIN_FINANCE", "GERANT"])}
        loadError={report.ok ? undefined : report.error}
      />
    </RhShell>
  );
}
