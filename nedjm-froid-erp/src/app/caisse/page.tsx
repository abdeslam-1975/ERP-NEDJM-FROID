import { AppShell } from "@/components/layout/app-shell";
import { CaisseDesk } from "@/components/caisse/caisse-desk";
import { getCaisseDashboard } from "@/lib/actions/caisse";

export const dynamic = "force-dynamic";

export default async function CaissePage() {
  const result = await getCaisseDashboard({ month: "CURRENT" });
  return (
    <AppShell title="GESTION CAISSE 2026">
      <CaisseDesk initial={result.ok ? result.data : null} loadError={result.ok ? undefined : result.error} />
    </AppShell>
  );
}
