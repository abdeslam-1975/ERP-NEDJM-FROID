import { redirect } from "next/navigation";
import { RhShell } from "@/components/rh/rh-shell";
import { LegalSettings } from "@/components/rh/legal-settings";
import { getLegalPeriod, listCnasRegimes, listLegalVars } from "@/lib/actions/hr-legal-vars";
import { listIrgCatalog } from "@/lib/actions/hr-irg";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { getComplianceAccess } from "@/lib/auth/compliance-access";

export const dynamic = "force-dynamic";

export default async function RhLegalPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab = sp.tab;
  const initialSection =
    tab === "cacobatph" || tab === "irg" || tab === "other" || tab === "cnas"
      ? tab
      : "cnas";

  const workspace = await getWorkspaceProfile();
  if (!workspace) redirect("/login");
  const access = await getComplianceAccess();
  if (!access.canRead) redirect("/?error=forbidden");

  const [vars, irg, regimes, period] = await Promise.all([
    listLegalVars(),
    listIrgCatalog(),
    listCnasRegimes(),
    getLegalPeriod(),
  ]);

  return (
    <RhShell title="Cotisations & impôts">
      <LegalSettings
        vars={vars.ok ? vars.data : []}
        regimes={regimes.ok ? regimes.data : []}
        period={period}
        irgCatalog={
          irg.ok
            ? irg.data
            : { versions: [], brackets: [], ruleSets: [], rules: [] }
        }
        canEdit={access.canWrite}
        loadError={
          (!vars.ok && vars.error) || (!irg.ok && irg.error) || (!regimes.ok && regimes.error) || undefined
        }
        initialSection={initialSection}
      />
    </RhShell>
  );
}
