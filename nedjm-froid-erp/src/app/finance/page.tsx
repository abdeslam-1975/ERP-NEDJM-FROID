import { AppShell } from "@/components/layout/app-shell";
import { FinanceHub } from "@/components/finance/finance-hub";
import { getFinanceHubData, type FinanceHubData } from "@/lib/actions/finance";

export const dynamic = "force-dynamic";

const emptyData: FinanceHubData = {
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

export default async function FinancePage() {
  const result = await getFinanceHubData();
  return (
    <AppShell title="Banque & Caisse">
      <FinanceHub
        initialData={result.ok ? result.data : emptyData}
        loadError={result.ok ? undefined : result.error}
      />
    </AppShell>
  );
}

