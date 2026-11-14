import { AppShell } from "@/components/layout/app-shell";
import { BanqueDesk } from "@/components/finance/banque-desk";
import { getBanqueDashboard, type ActionResult } from "@/lib/actions/banque";
import type { BanqueDashboard } from "@/lib/banque/types";

export const dynamic = "force-dynamic";

const emptyData: BanqueDashboard = {
  accounts: [],
  lines: [],
  lists: { affectations: [], fournisseurs: [], modes: [] },
  totalSolde: 0,
  totalSoum: 0,
  totalFin: 0,
  canCreate: false,
  canUpdate: false,
  canDelete: false,
  today: new Date().toISOString().slice(0, 10),
  selectedAccountId: null,
};

export default async function FinancePage() {
  const result: ActionResult<BanqueDashboard> = await getBanqueDashboard();
  return (
    <AppShell title="Banque">
      <BanqueDesk
        initialData={result.ok ? result.data : emptyData}
        loadError={result.ok ? undefined : result.error}
      />
    </AppShell>
  );
}
