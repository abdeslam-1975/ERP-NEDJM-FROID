import { AppShell } from "@/components/layout/app-shell";
import { SitesManager } from "@/components/sites/sites-manager";
import { listActivityCodes, listIrgZoneOptions, listSites } from "@/lib/actions/sites";

export const dynamic = "force-dynamic";

export default async function ChantiersPage() {
  const [sitesResult, activitiesResult, zonesResult] = await Promise.all([
    listSites(),
    listActivityCodes(),
    listIrgZoneOptions(),
  ]);

  const loadError = !sitesResult.ok
    ? sitesResult.error
    : !activitiesResult.ok
      ? activitiesResult.error
      : undefined;

  return (
    <AppShell title="Chantiers">
      <SitesManager
        initialSites={sitesResult.ok ? sitesResult.data : []}
        activityCodes={activitiesResult.ok ? activitiesResult.data : []}
        irgZones={zonesResult.ok ? zonesResult.data : []}
        loadError={loadError}
      />
    </AppShell>
  );
}
