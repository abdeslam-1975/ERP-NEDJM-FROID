import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ContractWorkspace } from "@/components/contracts/contract-workspace";
import { listClients } from "@/lib/actions/clients";
import { requireContractRead } from "@/lib/auth/require-roles";
import {
  getContract,
  listContractFinanceOptions,
  listSitesForContracts,
} from "@/lib/actions/contracts";

export const dynamic = "force-dynamic";

export default async function ContratDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireContractRead();

  const { id } = await params;
  const [result, sitesRes, financeRes, clientsRes] = await Promise.all([
    getContract(id),
    listSitesForContracts(),
    listContractFinanceOptions(),
    listClients(),
  ]);
  if (!result.ok) notFound();

  return (
    <AppShell title="Workspace contrat">
      <ContractWorkspace
        key={`${result.data.id}:${result.data.total_amount_ht}:${result.data.caution_amount}:${result.data.items.length}`}
        contract={result.data}
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
        financeOptions={
          financeRes.ok
            ? financeRes.data
            : {
                tax_rates: [],
                accounts: [],
                payment_methods: [],
                situation_types: [],
                stamp_rules: [],
              }
        }
      />
    </AppShell>
  );
}
