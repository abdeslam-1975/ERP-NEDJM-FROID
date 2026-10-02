import { RhShell } from "@/components/rh/rh-shell";
import { DocumentsManager, type DocumentsTab } from "@/components/rh/documents-manager";
import { RhPage, RhPageHeader } from "@/components/rh/rh-ui";
import {
  listHrCorrespondences,
  listHrFiles,
} from "@/lib/actions/hr-documents";
import { listHrContracts } from "@/lib/actions/hr-contracts";
import { listHrEmployeeRows } from "@/lib/actions/hr-employees";
import { loadHrLookups } from "@/lib/actions/hr-lookups";
import { getHrFicheSettings } from "@/lib/actions/hr-fiche";
import type { MissionContractHint } from "@/lib/hr/mission-order";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ nouveau?: string; onglet?: string; titre?: string }>;
}) {
  const sp = await searchParams;
  const tabs: DocumentsTab[] = ["missions", "conges", "fiches"];
  const initialTab = tabs.find((tab) => tab === sp.onglet);
  const [files, corr, employees, lookups, contracts, fiche] = await Promise.all([
    listHrFiles(),
    listHrCorrespondences(),
    listHrEmployeeRows(),
    loadHrLookups(),
    listHrContracts(),
    getHrFicheSettings(),
  ]);
  const missionContracts: MissionContractHint[] = contracts.ok
    ? contracts.data.map((row) => ({
        employee_id: row.employee_id,
        site_id: row.site_id,
        poste_fr: row.poste_fr,
        poste_ar: row.poste_ar,
        affectation_principale: row.affectation_principale,
        status: row.status,
        start_date: row.start_date,
      }))
    : [];

  return (
    <RhShell title="Documents RH">
      <RhPage>
        <RhPageHeader
          title="Documents"
          description="Chaque document reçoit une référence unique, jamais réutilisée."
        />
        <DocumentsManager
          key={`${initialTab ?? ""}:${sp.titre ?? ""}`}
          initialTab={initialTab}
          openTitleId={sp.titre}
          files={files.ok ? files.data : []}
          correspondences={corr.ok ? corr.data : []}
          employees={employees.ok ? employees.data : []}
          sites={lookups.sites}
          catalogs={lookups.catalogs}
          contracts={missionContracts}
          contractCount={contracts.ok ? contracts.data.length : null}
          letterheadUrl={fiche.ok ? fiche.data.letterhead_url : null}
          openMission={sp.nouveau === "om"}
          loadError={
            (!files.ok && files.error) ||
            (!corr.ok && corr.error) ||
            lookups.error ||
            undefined
          }
        />
      </RhPage>
    </RhShell>
  );
}
