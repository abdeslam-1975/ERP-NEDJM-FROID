import { AppShell } from "@/components/layout/app-shell";
import { BulletinSettingsManager } from "@/components/rh/bulletin-settings-manager";
import { RhAlert, RhPage } from "@/components/rh/rh-ui";
import { loadPayrollBulletinContext } from "@/lib/actions/hr-bulletin";
import { getHrFicheSettings } from "@/lib/actions/hr-fiche";

export const dynamic = "force-dynamic";

export default async function BulletinSettingsPage() {
  const [bulletin, fiche] = await Promise.all([loadPayrollBulletinContext(), getHrFicheSettings()]);
  return (
    <AppShell title="Modèle de bulletin">
      <RhPage>
        {bulletin.error ? <RhAlert tone="danger">{bulletin.error}</RhAlert> : null}
        <BulletinSettingsManager
          initial={bulletin.bulletin}
          template={bulletin.template}
          ficheLetterheadUrl={(fiche.ok ? fiche.data.letterhead_url : null) ?? ""}
          legalRates={bulletin.legalRates}
        />
      </RhPage>
    </AppShell>
  );
}
