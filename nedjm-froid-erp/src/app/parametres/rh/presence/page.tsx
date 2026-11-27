import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { AttendanceColumnsManager } from "@/components/rh/attendance-columns-manager";
import { PointageNetFormulaManager } from "@/components/rh/pointage-net-formula-manager";
import { RhAlert, RhPage, RhPageHeader } from "@/components/rh/rh-ui";
import { loadAttendanceColumnsAdmin } from "@/lib/actions/hr-attendance-sheet";
import { loadPointageNetFormula } from "@/lib/actions/hr-pointage-net";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AttendanceSheetSettingsPage() {
  const workspace = await getWorkspaceProfile();
  if (!workspace) redirect("/login");
  const supabase = await createClient();
  const perm = await supabase.rpc("erp_has_perm", { p_screen: "hr_settings", p_action: "update" });
  if (!workspace.isSuperAdmin && perm.data !== true) redirect("/?error=forbidden");
  const [admin, formula] = await Promise.all([
    workspace.isSuperAdmin ? loadAttendanceColumnsAdmin() : Promise.resolve(null),
    loadPointageNetFormula(),
  ]);
  return (
    <AppShell title="Feuille de présence">
      <RhPage>
        <RhPageHeader
          eyebrow="Paramètres · Ressources humaines"
          title="Feuille de présence"
          description="La formule du net à payer, puis les colonnes de la feuille imprimée."
        />
        {formula.ok ? (
          <PointageNetFormulaManager initial={formula.data} />
        ) : (
          <RhAlert tone="danger">{formula.error}</RhAlert>
        )}
        {admin?.ok ? <AttendanceColumnsManager initial={admin.data} /> : null}
        {admin && !admin.ok ? <RhAlert tone="danger">{admin.error}</RhAlert> : null}
      </RhPage>
    </AppShell>
  );
}
