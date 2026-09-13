import { AppShell } from "@/components/layout/app-shell";
import { UsersAdminManager } from "@/components/users/users-admin-manager";
import { requireRoles } from "@/lib/auth/require-roles";
import {
  listAdminUsers,
  listRolesAndSites,
} from "@/lib/actions/user-admin";

export const dynamic = "force-dynamic";

export default async function UtilisateursPage() {
  const workspace = await requireRoles(["SUPER_ADMIN", "ADMIN_RH"]);
  const [usersRes, metaRes] = await Promise.all([
    listAdminUsers(),
    listRolesAndSites(),
  ]);

  const loadError = !usersRes.ok
    ? usersRes.error
    : !metaRes.ok
      ? metaRes.error
      : undefined;

  return (
    <AppShell title="Utilisateurs">
      <UsersAdminManager
        initialUsers={usersRes.ok ? usersRes.data : []}
        roles={metaRes.ok ? metaRes.data.roles : []}
        sites={metaRes.ok ? metaRes.data.sites : []}
        isSuperAdmin={workspace.isSuperAdmin}
        loadError={loadError}
      />
    </AppShell>
  );
}
