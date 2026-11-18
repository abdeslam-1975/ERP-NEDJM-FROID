import { RhShell } from "@/components/rh/rh-shell";
import { CandidatesManager } from "@/components/rh/candidates-manager";
import { listCandidateCycle } from "@/lib/actions/hr-candidates";
import { loadHrLookups } from "@/lib/actions/hr-lookups";

export const dynamic = "force-dynamic";

export default async function CandidatsPage() {
  const [cycle, lookups] = await Promise.all([listCandidateCycle(), loadHrLookups()]);
  const empty = { candidates: [], documents: [], identitySlots: [], notice: null };

  return (
    <RhShell title="Candidats">
      <CandidatesManager
        initial={cycle.ok ? cycle.data : empty}
        sites={lookups.sites.map((site) => ({ id: site.id, label: site.name_fr }))}
        activities={lookups.activities.map((activity) => ({
          id: activity.id,
          label: `${activity.code} · ${activity.label_fr}`,
        }))}
        contractTypes={lookups.catalogs
          .filter((item) => item.kind === "contract_type" && item.is_active)
          .map((item) => ({ id: item.code, label: item.label_fr }))}
        loadError={cycle.ok ? lookups.error : cycle.error}
      />
    </RhShell>
  );
}
