import { redirect } from "next/navigation";
import { RhShell } from "@/components/rh/rh-shell";
import { RhAlert } from "@/components/rh/rh-ui";
import { LegalAiExtractionManager } from "@/components/rules/legal-ai-extraction-manager";
import { getLegalAiAccess, getLegalAiWorkspace } from "@/lib/actions/legal-ai-extraction";

export const dynamic = "force-dynamic";

export default async function LegalAiExtractionPage({ searchParams }: { searchParams: Promise<{ document?: string }> }) {
  const sp = await searchParams;
  const access = await getLegalAiAccess();
  if (!access.ok) redirect("/login");
  if (!access.data.read) redirect("/?error=forbidden");
  const workspace = await getLegalAiWorkspace(sp.document ?? null);

  return (
    <RhShell title="Extraction IA">
      {workspace.ok ? (
        <LegalAiExtractionManager workspace={workspace.data} access={access.data} />
      ) : (
        <RhAlert tone="danger">{workspace.error}</RhAlert>
      )}
    </RhShell>
  );
}
