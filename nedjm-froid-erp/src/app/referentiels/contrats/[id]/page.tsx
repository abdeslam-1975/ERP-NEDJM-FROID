import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ContractWorkspace } from "@/components/contracts/contract-workspace";
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
  const [result, sitesRes, financeRes] = await Promise.all([
    getContract(id),
    listSitesForContracts(),
    listContractFinanceOptions(),
  ]);
  if (!result.ok) notFound();

  return (
    <AppShell title="Workspace contrat">
      <ContractWorkspace
        key={`${result.data.id}:${result.data.total_amount_ht}:${result.data.caution_amount}:${result.data.items.length}`}
        contract={result.data}
        sites={sitesRes.ok ? sitesRes.data : []}
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
