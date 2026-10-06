import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { AttendanceColumnsManager } from "@/components/rh/attendance-columns-manager";
import { RhAlert, RhPage, RhPageHeader } from "@/components/rh/rh-ui";
import { loadAttendanceColumnsAdmin } from "@/lib/actions/hr-attendance-sheet";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";

export const dynamic = "force-dynamic";

export default async function AttendanceSheetSettingsPage() {
  const workspace = await getWorkspaceProfile();
  if (!workspace) redirect("/login");
  if (!workspace.isSuperAdmin) redirect("/?error=forbidden");
  const admin = await loadAttendanceColumnsAdmin();
  return (
    <AppShell title="Feuille de présence">
      <RhPage>
        <RhPageHeader
          eyebrow="Paramètres · Ressources humaines"
          title="Feuille de présence"
          description="Les colonnes de la feuille de présence imprimée."
        />
        {admin.ok ? <AttendanceColumnsManager initial={admin.data} /> : <RhAlert tone="danger">{admin.error}</RhAlert>}
      </RhPage>
    </AppShell>
  );
}
