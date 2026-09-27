import { AppShell } from "@/components/layout/app-shell";
import { ClientsManager } from "@/components/clients/clients-manager";
import { listClients } from "@/lib/actions/clients";
import {
  requireContractRead,
  workspaceHasRole,
  CONTRACT_WRITE_ROLES,
} from "@/lib/auth/require-roles";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const workspace = await requireContractRead();
  const clientsRes = await listClients();

  return (
    <AppShell title="Clients">
      <ClientsManager
        clients={clientsRes.ok ? clientsRes.data : []}
        loadError={clientsRes.ok ? undefined : clientsRes.error}
        canWrite={workspaceHasRole(workspace, CONTRACT_WRITE_ROLES)}
      />
    </AppShell>
  );
}
