import { redirect } from "next/navigation";
import { RhShell } from "@/components/rh/rh-shell";
import { RhAlert } from "@/components/rh/rh-ui";
import { RuleProposalsManager } from "@/components/rules/rule-proposals-manager";
import { getRuleAccess, listRuleProposals } from "@/lib/actions/rule-proposals";

export const dynamic = "force-dynamic";

export default async function RuleProposalsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; vue?: string; tout?: string }>;
}) {
  const sp = await searchParams;
  const access = await getRuleAccess();
  if (!access.ok) redirect("/login");
  if (!access.data.canRead) redirect("/?error=forbidden");
  const all = sp.tout === "1";
  const proposals = await listRuleProposals({ onlyOpen: !all });

  return (
    <RhShell title="Propositions légales">
      {proposals.ok ? (
        <RuleProposalsManager
          proposals={proposals.data}
          access={access.data}
          focusId={sp.id ?? null}
          initialView={sp.vue === "approbation" ? "submitted" : sp.id ? "all" : "open"}
          showAll={all}
        />
      ) : (
        <RhAlert tone="danger">{proposals.error}</RhAlert>
      )}
    </RhShell>
  );
}
