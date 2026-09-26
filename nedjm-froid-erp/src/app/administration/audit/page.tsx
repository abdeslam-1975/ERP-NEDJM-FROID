import { AppShell } from "@/components/layout/app-shell";
import { AuditViewer } from "@/components/admin/admin-managers";
import { listAuditLogs, listAuditTables } from "@/lib/actions/admin-rbac";
import { requireRoles } from "@/lib/auth/require-roles";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  await requireRoles(["SUPER_ADMIN", "GERANT", "ADMIN_RH", "ADMIN_FINANCE"]);
  const [logs, tables] = await Promise.all([listAuditLogs({ page: 0 }), listAuditTables()]);
  return (
    <AppShell title="Journal d'audit">
      <AuditViewer
        initialRows={logs.ok ? logs.data.rows : []}
        initialHasMore={logs.ok && logs.data.hasMore}
        tables={tables}
        loadError={logs.ok ? undefined : logs.error}
      />
    </AppShell>
  );
}
