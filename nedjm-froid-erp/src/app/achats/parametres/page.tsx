import { AppShell } from "@/components/layout/app-shell";
import { PurchaseSettings } from "@/components/purchases/purchase-settings";
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

export default async function PurchaseSettingsPage() {
  const result = await getPurchaseHubData();
  return (
    <AppShell title="Paramètres achats & facturation">
      <PurchaseSettings
        initialData={result.ok ? result.data : emptyData}
        loadError={result.ok ? undefined : result.error}
      />
    </AppShell>
  );
}
