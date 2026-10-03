import { redirect } from "next/navigation";
import { RhShell } from "@/components/rh/rh-shell";
import { LegalSettings, type Section } from "@/components/rh/legal-settings";
import { RhPage, RhPageHeader } from "@/components/rh/rh-ui";
import { loadLegalSettings } from "@/lib/hr/load-legal-settings";

export const dynamic = "force-dynamic";

const SECTIONS: Section[] = ["cnas", "cacobatph", "irg", "other"];

export default async function RhLegalPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const section = SECTIONS.find((s) => s === tab) ?? "cnas";
  const legal = await loadLegalSettings();
  if (!legal) redirect("/?error=forbidden");
  return (
    <RhShell title="Cotisations & impôts">
      <RhPage className="mb-5">
        <RhPageHeader eyebrow="Juridique" title="Cotisations & impôts" />
      </RhPage>
      <LegalSettings key={section} {...legal} initialSection={section} />
    </RhShell>
  );
}
