import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { RoleRightsManager } from "@/components/admin/role-rights-manager";
import { RhAlert } from "@/components/rh/rh-ui";
import { loadRoleRights } from "@/lib/actions/role-rights";
import { requireRoles } from "@/lib/auth/require-roles";

export const dynamic = "force-dynamic";

export default async function RoleRightsPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const workspace = await requireRoles(["SUPER_ADMIN", "GERANT"]);
  const [data, { role }] = await Promise.all([loadRoleRights(), searchParams]);
  return (
    <AppShell title="Droits par rôle">
      <div className="space-y-4">
        {data.ok ? (
          <RoleRightsManager data={data.data} initialRoleId={role} />
        ) : (
          <RhAlert tone="danger">{data.error}</RhAlert>
        )}
        {workspace.isSuperAdmin ? (
          <p className="text-xs text-foreground/55">
            Un compte précis peut recevoir d&apos;autres modules que son rôle :{" "}
            <Link href="/parametres/acces" className="font-semibold text-brand underline">
              Accès par compte
            </Link>
            .
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}
