import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { RhAlert, RhPageHeader } from "@/components/rh/rh-ui";
import { UiControlManager } from "@/components/settings/ui-control-manager";
import { loadUiControl } from "@/lib/actions/ui-control";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";

export const dynamic = "force-dynamic";

export default async function InterfaceSettingsPage() {
  const workspace = await getWorkspaceProfile();
  if (!workspace) redirect("/login");
  if (!workspace.isSuperAdmin) redirect("/?error=forbidden");
  const data = await loadUiControl();

  return (
    <AppShell title="Interface">
      <div className="space-y-6">
        <RhPageHeader
          eyebrow="Paramètres · الإعدادات"
          title="Interface · الواجهة"
          description="Choisissez, pour chaque rôle, les modules et les onglets affichés ; changez leur ordre, leurs libellés et les couleurs. Le SUPER_ADMIN voit toujours tout. Masquer un élément ne remplace pas la matrice des permissions, qui protège les données."
        />
        {data.ok ? <UiControlManager initial={data.data} /> : <RhAlert tone="danger">{data.error}</RhAlert>}
      </div>
    </AppShell>
  );
}
