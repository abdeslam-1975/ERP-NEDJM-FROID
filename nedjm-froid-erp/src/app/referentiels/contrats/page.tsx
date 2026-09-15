import { AppShell } from "@/components/layout/app-shell";
import { ContractsManager } from "@/components/contracts/contracts-manager";
import { requireContractRead } from "@/lib/auth/require-roles";
import {
  listContracts,
  listContractFinanceOptions,
  listSitesForContracts,
} from "@/lib/actions/contracts";

export const dynamic = "force-dynamic";

export default async function ContratsPage() {
  await requireContractRead();

  const [contractsRes, sitesRes, financeRes] = await Promise.all([
    listContracts(),
    listSitesForContracts(),
    listContractFinanceOptions(),
  ]);

  const loadError = !contractsRes.ok
    ? contractsRes.error
    : !sitesRes.ok
      ? sitesRes.error
      : undefined;

  return (
    <AppShell title="Contrats clients">
      <ContractsManager
        initialContracts={contractsRes.ok ? contractsRes.data : []}
        sites={sitesRes.ok ? sitesRes.data : []}
        taxRates={financeRes.ok ? financeRes.data.tax_rates : []}
        loadError={loadError}
      />
    </AppShell>
  );
}
