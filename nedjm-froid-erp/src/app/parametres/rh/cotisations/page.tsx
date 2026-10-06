import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { LegalSettings, type Section } from "@/components/rh/legal-settings";
import { RhPage } from "@/components/rh/rh-ui";
import { loadLegalSettings } from "@/lib/hr/load-legal-settings";

export const dynamic = "force-dynamic";

const SECTIONS: Section[] = ["cnas", "cacobatph", "irg", "other"];

export default async function ContributionsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const section = SECTIONS.find((s) => s === tab) ?? "cnas";
  const legal = await loadLegalSettings();
  if (!legal) redirect("/?error=forbidden");
  return (
    <AppShell title="Cotisations & impôts">
      <RhPage>
        <LegalSettings key={section} {...legal} initialSection={section} />
      </RhPage>
    </AppShell>
  );
}
