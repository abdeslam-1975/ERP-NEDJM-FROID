import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { RhAlert, RhPageHeader } from "@/components/rh/rh-ui";
import { DashboardScenesManager } from "@/components/settings/dashboard-scenes-manager";
import { loadDashboardShowcase } from "@/lib/actions/dashboard-showcase";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";

export const dynamic = "force-dynamic";

export default async function AccueilSettingsPage() {
  const workspace = await getWorkspaceProfile();
  if (!workspace) redirect("/login");
  if (!workspace.isSuperAdmin) redirect("/?error=forbidden");
  const data = await loadDashboardShowcase();

  return (
    <AppShell title="Accueil">
      <div className="space-y-6">
        <RhPageHeader
          eyebrow="Paramètres · الإعدادات"
          title="الاستقبال · Accueil"
          description="صور ونصوص شريط لوحة التحكم. العربية فوق الفرنسية. يظهر الشريط للجميع، والتعديل للمدير العام فقط."
        />
        {data.ok ? <DashboardScenesManager initial={data.data} /> : <RhAlert tone="danger">{data.error}</RhAlert>}
      </div>
    </AppShell>
  );
}
