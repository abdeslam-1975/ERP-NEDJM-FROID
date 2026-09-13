import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ContractDetailView } from "@/components/contracts/contract-detail-view";
import { getContract } from "@/lib/actions/contracts";

export const dynamic = "force-dynamic";

export default async function ContratDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getContract(id);
  if (!result.ok) notFound();

  return (
    <AppShell title="Détail contrat">
      <ContractDetailView contract={result.data} />
    </AppShell>
  );
}
