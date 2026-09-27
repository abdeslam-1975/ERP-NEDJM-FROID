import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ContractWorkspace } from "@/components/contracts/contract-workspace";
import { listClients } from "@/lib/actions/clients";
import { listContractDocuments } from "@/lib/actions/contract-documents";
import { getOpenContractExtraction } from "@/lib/actions/contract-extractions";
import { geminiConfigured, geminiModel } from "@/lib/ai/gemini";
import {
  CONTRACT_WRITE_ROLES,
  requireContractRead,
  workspaceHasRole,
} from "@/lib/auth/require-roles";
import {
  getContract,
  listContractFinanceOptions,
  listSitesForContracts,
} from "@/lib/actions/contracts";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function ContratDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const workspace = await requireContractRead();

  const { id } = await params;
  const [result, sitesRes, financeRes, clientsRes, documentsRes, extractionRes] =
    await Promise.all([
      getContract(id),
      listSitesForContracts(),
      listContractFinanceOptions(),
      listClients(),
      listContractDocuments(id),
      getOpenContractExtraction(id),
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
        documents={documentsRes.ok ? documentsRes.data : []}
        canWrite={workspaceHasRole(workspace, CONTRACT_WRITE_ROLES)}
        extraction={extractionRes.ok ? extractionRes.data : null}
        ai={{ configured: geminiConfigured(), model: geminiModel() }}
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
