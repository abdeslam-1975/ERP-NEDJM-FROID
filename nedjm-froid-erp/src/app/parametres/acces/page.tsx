import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { RhAlert, RhPageHeader } from "@/components/rh/rh-ui";
import { UserAccessManager } from "@/components/settings/user-access-manager";
import { loadUserAccess } from "@/lib/actions/user-access";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";

export const dynamic = "force-dynamic";

export default async function UserAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string }>;
}) {
  const { user } = await searchParams;
  const workspace = await getWorkspaceProfile();
  if (!workspace) redirect("/login");
  if (!workspace.isSuperAdmin) redirect("/?error=forbidden");
  const data = await loadUserAccess();

  return (
    <AppShell title="Accès par compte">
      <div className="space-y-6">
        <RhPageHeader
          eyebrow="Paramètres · الإعدادات"
          title="Accès par compte · صلاحيات الحسابات"
          description="Choisissez le compte, ouvrez ses modules (tous fermés au départ), puis cochez les onglets de chaque module ouvert."
        />
        {data.ok ? <UserAccessManager users={data.data} initialUserId={user} /> : <RhAlert tone="danger">{data.error}</RhAlert>}
      </div>
    </AppShell>
  );
}
