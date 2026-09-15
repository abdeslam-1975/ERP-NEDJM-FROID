import { AppShell } from "@/components/layout/app-shell";
import { PurchaseHub } from "@/components/purchases/purchase-hub";
import { getPurchaseHubData, type PurchaseHubData } from "@/lib/actions/purchases";

export const dynamic = "force-dynamic";

const emptyData: PurchaseHubData = {
  suppliers: [],
  situations: [],
  stampRules: [],
  sequences: [],
  documentProfiles: [],
  proformas: [],
  orders: [],
  receipts: [],
  invoices: [],
  taxRates: [],
  accounts: [],
  paymentMethods: [],
  sites: [],
};

export default async function PurchasesPage() {
  const result = await getPurchaseHubData();
  return (
    <AppShell title="Achats & fournisseurs">
      <PurchaseHub
        initialData={result.ok ? result.data : emptyData}
        loadError={result.ok ? undefined : result.error}
      />
    </AppShell>
  );
}
