import { AppShell } from "@/components/layout/app-shell";
import { VentesBcDesk } from "@/components/ventes/ventes-bc-desk";

export const dynamic = "force-dynamic";

export default function VentesBonsDeCommandePage() {
  return (
    <AppShell title="BON DE COMMANDE">
      <VentesBcDesk />
    </AppShell>
  );
}
