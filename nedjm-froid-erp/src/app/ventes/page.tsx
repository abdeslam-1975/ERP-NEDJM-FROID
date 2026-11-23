import { AppShell } from "@/components/layout/app-shell";
import { VentesDesk } from "@/components/ventes/ventes-desk";
import { getVentesDashboard } from "@/lib/actions/ventes";

export const dynamic = "force-dynamic";

export default async function VentesPage() {
  const result = await getVentesDashboard();
  return (
    <AppShell title="GESTION VENTES">
      <VentesDesk
        initial={result.ok ? result.data : null}
        loadError={result.ok ? undefined : result.error}
      />
    </AppShell>
  );
}
