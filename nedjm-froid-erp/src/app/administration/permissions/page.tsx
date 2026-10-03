import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { PermissionMatrix } from "@/components/admin/admin-managers";
import { RhAlert } from "@/components/rh/rh-ui";
import { loadPermissionMatrix } from "@/lib/actions/admin-rbac";
import { requireRoles } from "@/lib/auth/require-roles";

export const dynamic = "force-dynamic";

export default async function PermissionsPage() {
  const workspace = await requireRoles(["SUPER_ADMIN", "GERANT"]);
  const matrix = await loadPermissionMatrix();
  return (
    <AppShell title="Matrice des droits">
      {workspace.isSuperAdmin ? (
        <div className="mb-4">
          <RhAlert tone="info">
            Pour choisir les modules et onglets d&apos;un compte précis :{" "}
            <Link href="/parametres/acces" className="font-semibold underline">
              Accès par compte
            </Link>
            .
          </RhAlert>
        </div>
      ) : null}
      {!matrix.ok ? <RhAlert tone="danger">{matrix.error}</RhAlert> : null}
      <PermissionMatrix
        roles={matrix.ok ? matrix.data.roles : []}
        screens={matrix.ok ? matrix.data.screens : []}
        initialPermissions={matrix.ok ? matrix.data.permissions : []}
        canEdit={workspace.isSuperAdmin}
      />
    </AppShell>
  );
}
