import { AppShell } from "@/components/layout/app-shell";
import { FicheSettingsManager } from "@/components/rh/fiche-settings-manager";
import { RhAlert, RhPage } from "@/components/rh/rh-ui";
import { listHrEmployeeFields } from "@/lib/actions/hr-employees";
import { getHrFicheSettings } from "@/lib/actions/hr-fiche";
import { loadHrLookups } from "@/lib/actions/hr-lookups";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { DEFAULT_FICHE_SETTINGS } from "@/lib/hr/fiche-settings";

export const dynamic = "force-dynamic";

export default async function FicheSettingsPage() {
  const [workspace, fiche, fields, lookups] = await Promise.all([
    getWorkspaceProfile(),
    getHrFicheSettings(),
    listHrEmployeeFields(),
    loadHrLookups(),
  ]);
  const loadError = (!fiche.ok && fiche.error) || (!fields.ok && fields.error) || lookups.error || undefined;
  return (
    <AppShell title="Modèle de fiche employé">
      <RhPage>
        {loadError ? <RhAlert tone="danger">{loadError}</RhAlert> : null}
        <FicheSettingsManager
          initial={fiche.ok ? fiche.data : DEFAULT_FICHE_SETTINGS}
          fields={fields.ok ? fields.data : []}
          catalogs={lookups.catalogs}
          isSuperAdmin={workspace?.isSuperAdmin ?? false}
        />
      </RhPage>
    </AppShell>
  );
}
