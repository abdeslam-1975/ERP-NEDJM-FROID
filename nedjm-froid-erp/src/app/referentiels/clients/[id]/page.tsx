import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ClientFiche } from "@/components/clients/client-fiche";
import { getClient, listClientContracts } from "@/lib/actions/clients";
import {
  CONTRACT_WRITE_ROLES,
  requireContractRead,
  workspaceHasRole,
} from "@/lib/auth/require-roles";

export const dynamic = "force-dynamic";

export default async function ClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const workspace = await requireContractRead();
  const [clientRes, contractsRes] = await Promise.all([
    getClient(id),
    listClientContracts(id),
  ]);

  if (!clientRes.ok) notFound();

  return (
    <AppShell title={clientRes.data.nom_fr}>
      <ClientFiche
        client={clientRes.data}
        contracts={contractsRes.ok ? contractsRes.data : []}
        canWrite={workspaceHasRole(workspace, CONTRACT_WRITE_ROLES)}
      />
    </AppShell>
  );
}
