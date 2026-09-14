import { AppShell } from "@/components/layout/app-shell";
import { SitesManager } from "@/components/sites/sites-manager";
import { listActivityCodes, listSites } from "@/lib/actions/sites";

export const dynamic = "force-dynamic";

export default async function ChantiersPage() {
  const [sitesResult, activitiesResult] = await Promise.all([
    listSites(),
    listActivityCodes(),
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
        loadError={loadError}
      />
    </AppShell>
  );
}
