import { redirect } from "next/navigation";
import { RhShell } from "@/components/rh/rh-shell";
import { RhAlert } from "@/components/rh/rh-ui";
import { LegalWatchManager } from "@/components/rules/legal-watch-manager";
import { getLegalWatchAccess, getLegalWatchWorkspace } from "@/lib/actions/legal-watch";

export const dynamic = "force-dynamic";

const TABS = ["textes", "sources", "domaines", "mots-cles", "historique"] as const;

export default async function LegalWatchPage({ searchParams }: { searchParams: Promise<{ onglet?: string }> }) {
  const sp = await searchParams;
  const access = await getLegalWatchAccess();
  if (!access.ok) redirect("/login");
  if (!access.data.read) redirect("/?error=forbidden");
  const workspace = await getLegalWatchWorkspace();
  const tab = (TABS as readonly string[]).includes(sp.onglet ?? "") ? (sp.onglet as (typeof TABS)[number]) : "textes";

  return (
    <RhShell title="Veille juridique">
      {workspace.ok ? (
        <LegalWatchManager workspace={workspace.data} access={access.data} initialTab={tab} />
      ) : (
        <RhAlert tone="danger">{workspace.error}</RhAlert>
      )}
    </RhShell>
  );
}
