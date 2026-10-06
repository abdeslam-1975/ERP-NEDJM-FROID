import { AppShell } from "@/components/layout/app-shell";
import { CatalogsManager } from "@/components/rh/catalogs-manager";
import { RhPage } from "@/components/rh/rh-ui";
import { loadHrLookups } from "@/lib/actions/hr-lookups";

export const dynamic = "force-dynamic";

export default async function CatalogsSettingsPage() {
  const lookups = await loadHrLookups();
  return (
    <AppShell title="Listes et codes">
      <RhPage>
        <CatalogsManager kinds={lookups.kinds} items={lookups.catalogs} legends={lookups.legends} loadError={lookups.error} />
      </RhPage>
    </AppShell>
  );
}
