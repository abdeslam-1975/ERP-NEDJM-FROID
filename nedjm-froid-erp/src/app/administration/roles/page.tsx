import { AppShell } from "@/components/layout/app-shell";
import { RolesManager } from "@/components/admin/admin-managers";
import { RhAlert } from "@/components/rh/rh-ui";
import { listRolesAdmin } from "@/lib/actions/admin-rbac";
import { requireRoles } from "@/lib/auth/require-roles";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const workspace = await requireRoles(["SUPER_ADMIN", "GERANT"]);
  const roles = await listRolesAdmin();
  return (
    <AppShell title="Rôles">
      {!roles.ok ? <RhAlert tone="danger">{roles.error}</RhAlert> : null}
      <RolesManager initialRoles={roles.ok ? roles.data : []} canEdit={workspace.isSuperAdmin} />
    </AppShell>
  );
}
