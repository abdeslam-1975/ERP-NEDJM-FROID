import { AppShell } from "@/components/layout/app-shell";
import { ContractsManager } from "@/components/contracts/contracts-manager";
import {
  listContracts,
  listSitesForContracts,
} from "@/lib/actions/contracts";

export const dynamic = "force-dynamic";

export default async function ContratsPage() {
  const [contractsRes, sitesRes] = await Promise.all([
    listContracts(),
    listSitesForContracts(),
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
        loadError={loadError}
      />
    </AppShell>
  );
}
