import { RhShell } from "@/components/rh/rh-shell";
import { DocumentsManager, type DocumentsTab } from "@/components/rh/documents-manager";
import { RhPage, RhPageHeader } from "@/components/rh/rh-ui";
import {
  listHrCorrespondences,
  listHrFiles,
} from "@/lib/actions/hr-documents";
import { listHrContracts } from "@/lib/actions/hr-contracts";
import { listHrEmployeeFields, listHrEmployeeRows } from "@/lib/actions/hr-employees";
import { loadHrLookups } from "@/lib/actions/hr-lookups";
import { getHrFicheSettings } from "@/lib/actions/hr-fiche";
import { getHrCompanyProfile } from "@/lib/actions/hr-company";
import { EMPTY_COMPANY_PROFILE } from "@/lib/hr/company-profile";
import { mergeAffectationCatalog } from "@/lib/hr/affectation-options";
import { DEFAULT_FICHE_SETTINGS } from "@/lib/hr/fiche-settings";
import type { MissionContractHint } from "@/lib/hr/mission-order";
import { ContractsRegister } from "@/components/rh/contracts-register";
import { BulletinsRegister } from "@/components/rh/bulletins-register";
import { CustomDocsRegister } from "@/components/rh/custom-docs-register";
import { listCustomDocDefs, listIssuedCustomDocs } from "@/lib/actions/hr-custom-docs";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ nouveau?: string; onglet?: string; titre?: string }>;
}) {
  const sp = await searchParams;
  const tabs: DocumentsTab[] = ["fiches", "contrats", "missions", "conges", "bulletins", "autres"];
  const initialTab = tabs.find((tab) => tab === sp.onglet);
  const register =
    initialTab === "contrats" ? <ContractsRegister /> : initialTab === "bulletins" ? <BulletinsRegister /> : null;
  const [files, corr, employees, lookups, contracts, fiche, fields, company, customDefs, issued] = await Promise.all([
    listHrFiles(),
    listHrCorrespondences(),
    listHrEmployeeRows(),
    loadHrLookups(),
    listHrContracts(),
    getHrFicheSettings(),
    listHrEmployeeFields(),
    getHrCompanyProfile(),
    listCustomDocDefs(),
    listIssuedCustomDocs(),
  ]);
  const customRegister = (
    <CustomDocsRegister
      defs={customDefs.ok ? customDefs.data.defs.filter((d) => d.is_active && d.approved_version != null) : []}
      issued={issued.ok ? issued.data : []}
      employees={employees.ok ? employees.data : []}
      catalogs={lookups.catalogs}
      error={(!customDefs.ok ? customDefs.error : undefined) || (!issued.ok ? issued.error : undefined)}
    />
  );
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
          register={register}
          customRegister={customRegister}
          customCount={issued.ok ? issued.data.filter((d) => d.status === "ISSUED").length : null}
          openTitleId={sp.titre}
          files={files.ok ? files.data : []}
          correspondences={corr.ok ? corr.data : []}
          employees={employees.ok ? employees.data : []}
          sites={lookups.sites}
          catalogs={lookups.catalogs}
          contracts={missionContracts}
          contractCount={contracts.ok ? contracts.data.length : null}
          company={company.ok ? company.data.profile : EMPTY_COMPANY_PROFILE}
          letterheadUrl={fiche.ok ? fiche.data.letterhead_url : null}
          employeeFields={fields.ok ? fields.data : []}
          ficheCatalogs={mergeAffectationCatalog(lookups.catalogs, lookups.sites)}
          ficheSettings={fiche.ok ? fiche.data : DEFAULT_FICHE_SETTINGS}
          openMission={sp.nouveau === "om"}
          loadError={
            (!files.ok && files.error) ||
            (!corr.ok && corr.error) ||
            (!company.ok && company.error) ||
            lookups.error ||
            undefined
          }
        />
      </RhPage>
    </RhShell>
  );
}
