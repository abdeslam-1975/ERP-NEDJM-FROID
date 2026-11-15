import { AppShell } from "@/components/layout/app-shell";
import { FinanceHub } from "@/components/finance/finance-hub";
import { getBanqueDashboard } from "@/lib/actions/banque";
import { getFinanceHubData, type FinanceHubData } from "@/lib/actions/finance";
import type { BanqueDashboard } from "@/lib/banque/types";

export const dynamic = "force-dynamic";

const emptyFinance: FinanceHubData = {
  accounts: [],
  taxRates: [],
  methods: [],
  categories: [],
  transactions: [],
  advances: [],
  periodLocks: [],
  sites: [],
  employees: [],
};

const emptyBanque: BanqueDashboard = {
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
  const [finance, banque] = await Promise.all([getFinanceHubData(), getBanqueDashboard()]);
  return (
    <AppShell title="Banque">
      <FinanceHub
        initialData={finance.ok ? finance.data : emptyFinance}
        loadError={finance.ok ? undefined : finance.error}
        banqueData={banque.ok ? banque.data : emptyBanque}
        banqueError={banque.ok ? undefined : banque.error}
      />
    </AppShell>
  );
}
