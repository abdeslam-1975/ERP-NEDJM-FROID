import { redirect } from "next/navigation";
import { RhShell } from "@/components/rh/rh-shell";
import { RhAlert } from "@/components/rh/rh-ui";
import { AttendanceImportsManager } from "@/components/rh/attendance-imports-manager";
import {
  archiveBatchOfDecision,
  getArchiveAccess,
  getArchiveDetail,
  listArchiveBatches,
  listCodeMappings,
} from "@/lib/actions/hr-attendance-archive";
import { listLegends } from "@/lib/actions/hr-catalogs";
import { listSites } from "@/lib/actions/sites";

export const dynamic = "force-dynamic";

const VIEWS = ["lots", "validation", "codes", "politique"] as const;
type View = (typeof VIEWS)[number];

export default async function AttendanceImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ lot?: string; vue?: string; decision?: string }>;
}) {
  const sp = await searchParams;
  const access = await getArchiveAccess();
  if (!access.ok) redirect("/login");
  if (!access.data.read && !access.data.mappingDecider) redirect("/?error=forbidden");

  const lotId = sp.lot ?? (sp.decision ? await archiveBatchOfDecision(sp.decision) : null);
  const view: View = (VIEWS as readonly string[]).includes(sp.vue ?? "") ? (sp.vue as View) : "lots";
  const [batches, detail, mappings, sites, legends] = await Promise.all([
    access.data.read ? listArchiveBatches() : Promise.resolve({ ok: true as const, data: [] }),
    lotId && access.data.read ? getArchiveDetail(lotId) : Promise.resolve(null),
    listCodeMappings(),
    listSites(),
    listLegends(),
  ]);

  return (
    <RhShell title="Imports de présences">
      {batches.ok ? (
        <AttendanceImportsManager
          key={`${lotId ?? ""}|${view}`}
          access={access.data}
          batches={batches.data}
          detail={detail?.ok ? detail.data : null}
          detailError={detail && !detail.ok ? detail.error : null}
          mappings={mappings.ok ? mappings.data : []}
          sites={sites.ok ? sites.data.filter((s) => s.is_active).map((s) => ({ id: s.id, code: s.code, name: s.name_fr })) : []}
          legends={legends.ok ? legends.data.filter((l) => l.is_active).map((l) => ({ code: l.code, label: l.label_fr })) : []}
          view={view}
          focusDecision={sp.decision ?? null}
        />
      ) : (
        <RhAlert tone="danger">{batches.error}</RhAlert>
      )}
    </RhShell>
  );
}
