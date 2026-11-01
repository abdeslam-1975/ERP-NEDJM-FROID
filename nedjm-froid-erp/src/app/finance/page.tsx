import { AppShell } from "@/components/layout/app-shell";
import { RhPageHeader } from "@/components/rh/rh-ui";

export const dynamic = "force-dynamic";

export default function FinancePage() {
  return (
    <AppShell title="Banque & Caisse">
      <RhPageHeader title="Banque & Caisse · البنك والصندوق" />
    </AppShell>
  );
}
