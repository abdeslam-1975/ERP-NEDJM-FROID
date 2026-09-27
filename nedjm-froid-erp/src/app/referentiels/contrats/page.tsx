import { AppShell } from "@/components/layout/app-shell";
import { ContractsManager } from "@/components/contracts/contracts-manager";
import { listClients } from "@/lib/actions/clients";
import { requireContractRead } from "@/lib/auth/require-roles";
import {
  listContracts,
  listContractFinanceOptions,
  listSitesForContracts,
} from "@/lib/actions/contracts";

export const dynamic = "force-dynamic";

export default async function ContratsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  await requireContractRead();
  const sp = await searchParams;

  const [contractsRes, sitesRes, financeRes, clientsRes] = await Promise.all([
    listContracts(),
    listSitesForContracts(),
    listContractFinanceOptions(),
    listClients(),
  ]);

  const loadError = !contractsRes.ok
    ? contractsRes.error
    : !sitesRes.ok
      ? sitesRes.error
      : !clientsRes.ok
        ? clientsRes.error
        : undefined;

  return (
    <AppShell title="Contrats clients">
      <ContractsManager
        initialContracts={contractsRes.ok ? contractsRes.data : []}
        sites={sitesRes.ok ? sitesRes.data : []}
        clients={
          clientsRes.ok
            ? clientsRes.data.map((client) => ({
                id: client.id,
                nom_fr: client.nom_fr,
                code_client: client.code_client,
              }))
            : []
        }
        focusClientId={sp.client}
        taxRates={financeRes.ok ? financeRes.data.tax_rates : []}
        loadError={loadError}
      />
    </AppShell>
  );
}
