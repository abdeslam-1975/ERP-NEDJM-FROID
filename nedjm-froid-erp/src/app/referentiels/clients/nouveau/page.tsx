import { AppShell } from "@/components/layout/app-shell";
import { ClientFiche } from "@/components/clients/client-fiche";
import {
  CONTRACT_WRITE_ROLES,
  requireContractRead,
  workspaceHasRole,
} from "@/lib/auth/require-roles";

export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  const workspace = await requireContractRead();

  return (
    <AppShell title="Nouveau client">
      <ClientFiche
        client={null}
        contracts={[]}
        canWrite={workspaceHasRole(workspace, CONTRACT_WRITE_ROLES)}
      />
    </AppShell>
  );
}
