import { AppShell } from "@/components/layout/app-shell";
import { FinanceSettings } from "@/components/finance/finance-settings";
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

export default async function FinanceSettingsPage() {
  const result = await getFinanceHubData();
  return (
    <AppShell title="Paramètres financiers">
      <FinanceSettings
        initialData={result.ok ? result.data : emptyData}
        loadError={result.ok ? undefined : result.error}
      />
    </AppShell>
  );
}

