import { redirect } from "next/navigation";
import { RhShell } from "@/components/rh/rh-shell";
import { DeclarationsRegister } from "@/components/rh/declarations-register";
import { getDeclarationDecisionScope, listDeclarationExports } from "@/lib/actions/hr-declarations";
import { loadHrLookups } from "@/lib/actions/hr-lookups";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { HR_SALARY_VALUE_ROLES, workspaceHasRole } from "@/lib/auth/require-roles";

export const dynamic = "force-dynamic";

export default async function DeclarationsRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; decision?: string }>;
}) {
  const sp = await searchParams;
  const workspace = await getWorkspaceProfile();
  if (!workspace) redirect("/login");
  const decision = sp.decision ? await getDeclarationDecisionScope(sp.decision) : null;
  const y = Number(sp.year);
  const year =
    Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : decision?.ok ? decision.data.year : new Date().getFullYear();
  const [exports, lookups] = await Promise.all([listDeclarationExports({ year }), loadHrLookups()]);
  return (
    <RhShell title="Registre des déclarations">
      <DeclarationsRegister
        exports={exports.ok ? exports.data : []}
        year={year}
        sites={lookups.sites}
        canExport={workspaceHasRole(workspace, HR_SALARY_VALUE_ROLES)}
        decision={decision?.ok ? decision.data : null}
        loadError={(!exports.ok && exports.error) || (decision && !decision.ok && decision.error) || lookups.error || undefined}
      />
    </RhShell>
  );
}
