import { redirect } from "next/navigation";
import { RhShell } from "@/components/rh/rh-shell";
import { RhAlert } from "@/components/rh/rh-ui";
import { LegalDocumentsManager } from "@/components/rules/legal-documents-manager";
import { getLegalDocAccess, listLegalDocuments } from "@/lib/actions/legal-documents";

export const dynamic = "force-dynamic";

export default async function LegalDocumentsPage({ searchParams }: { searchParams: Promise<{ annee?: string }> }) {
  const sp = await searchParams;
  const access = await getLegalDocAccess();
  if (!access.ok) redirect("/login");
  if (!access.data.read) redirect("/?error=forbidden");
  const parsed = Number(sp.annee);
  const year =
    sp.annee === "tout" ? null : Number.isInteger(parsed) && parsed >= 1990 && parsed <= 2100 ? parsed : new Date().getFullYear();
  const documents = await listLegalDocuments({ year });

  return (
    <RhShell title="Documents juridiques">
      {documents.ok ? (
        <LegalDocumentsManager documents={documents.data} access={access.data} year={year} />
      ) : (
        <RhAlert tone="danger">{documents.error}</RhAlert>
      )}
    </RhShell>
  );
}
