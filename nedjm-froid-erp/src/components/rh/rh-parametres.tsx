"use client";

import type { ComponentProps } from "react";
import { useSearchParams } from "next/navigation";
import { CatalogsManager } from "@/components/rh/catalogs-manager";
import { LegalSettings, type Section as LegalSection } from "@/components/rh/legal-settings";
import { FicheSettingsManager } from "@/components/rh/fiche-settings-manager";
import {
  SalaryRubricsManager,
  type SalaryTarget,
} from "@/components/rh/salary-rubrics-manager";
import type { CatalogItem, CatalogKind, LegendRow } from "@/lib/actions/hr-catalogs";
import type { SalaryAssignment, SalaryRubrique } from "@/lib/actions/hr-salary";
import type { HrEmployeeField } from "@/lib/actions/hr-employees";
import type { HrFicheSettings } from "@/lib/hr/fiche-settings";
import type { HrBulletinSettings, BulletinLegalRates } from "@/lib/hr/bulletin-settings";
import { BulletinSettingsManager } from "@/components/rh/bulletin-settings-manager";
import { AttendanceColumnsManager } from "@/components/rh/attendance-columns-manager";
import type { AttendanceColumnsAdmin } from "@/lib/actions/hr-attendance-sheet";
import type { HrCompanyProfile } from "@/lib/hr/company-profile";
import { HrDocumentsSettings, type CustomDocsSettings } from "@/components/rh/hr-documents-settings";
import { RhAlert, RhPage, RhTabs } from "@/components/rh/rh-ui";

type RhSettingsTab = "salary" | "legal" | "fiche" | "catalogs" | "bulletin" | "documents" | "attendance";

const LEGAL_SECTIONS: LegalSection[] = ["cnas", "cacobatph", "irg", "other"];

export function RhParametres({
  kinds,
  items,
  legends,
  fields,
  fiche,
  isSuperAdmin,
  canEditSalaryValues = false,
  rubriques,
  assignments,
  employees,
  sites,
  contracts,
  postes = [],
  legal = null,
  bulletin,
  bulletinTemplate = "",
  legalRates,
  attendanceAdmin,
  company = null,
  customDocs = { defs: [], canEdit: false, fonts: [] },
  loadError,
}: {
  kinds: CatalogKind[];
  items: CatalogItem[];
  legends: LegendRow[];
  fields: HrEmployeeField[];
  fiche: HrFicheSettings;
  isSuperAdmin: boolean;
  canEditSalaryValues?: boolean;
  rubriques: SalaryRubrique[];
  assignments: SalaryAssignment[];
  employees: SalaryTarget[];
  sites: SalaryTarget[];
  contracts: SalaryTarget[];
  postes?: SalaryTarget[];
  /** null when the user may not read the legal settings. */
  legal?: ComponentProps<typeof LegalSettings> | null;
  bulletin: HrBulletinSettings;
  bulletinTemplate?: string;
  legalRates?: BulletinLegalRates;
  attendanceAdmin?: AttendanceColumnsAdmin | null;
  /** Company identity of the HR documents; null when it could not be read. */
  company?: { profile: HrCompanyProfile; canEdit: boolean } | null;
  /** Documents created from the interface and their fonts. */
  customDocs?: CustomDocsSettings;
  loadError?: string;
}) {
  const searchParams = useSearchParams();
  const tabs: { id: RhSettingsTab; label: string }[] = [
    { id: "salary", label: "Rubriques de salaire" },
    ...(legal ? [{ id: "legal" as const, label: "Cotisations & impôts" }] : []),
    { id: "fiche", label: "Modèle de fiche" },
    { id: "catalogs", label: "Listes et codes" },
    { id: "bulletin", label: "Modèle de bulletin" },
    ...(company ? [{ id: "documents" as const, label: "Documents" }] : []),
    ...(isSuperAdmin && attendanceAdmin
      ? [{ id: "attendance" as const, label: "Feuille de présence" }]
      : []),
  ];
  const tab = tabs.find((t) => t.id === searchParams.get("tab"))?.id ?? "salary";
  const legalSection = LEGAL_SECTIONS.find((s) => s === searchParams.get("section"));

  function selectTab(id: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", id);
    next.delete("section");
    window.history.replaceState(null, "", `?${next}`);
  }

  return (
    <RhPage>
      {loadError ? <RhAlert tone="danger">{loadError}</RhAlert> : null}
      <RhTabs uiKey="rh_settings" items={tabs} value={tab} onChange={selectTab} />
      {tab === "salary" ? (
        <SalaryRubricsManager
          isSuperAdmin={isSuperAdmin}
          canEditValues={canEditSalaryValues}
          rubriques={rubriques}
          assignments={assignments}
          employees={employees}
          sites={sites}
          contracts={contracts}
          postes={postes}
        />
      ) : tab === "legal" && legal ? (
        <LegalSettings key={legalSection ?? "cnas"} {...legal} initialSection={legalSection} />
      ) : tab === "fiche" ? (
        <FicheSettingsManager
          initial={fiche}
          fields={fields}
          catalogs={items}
          isSuperAdmin={isSuperAdmin}
        />
      ) : tab === "documents" && company ? (
        <HrDocumentsSettings
          company={company.profile}
          canEdit={company.canEdit}
          fiche={fiche}
          fields={fields}
          catalogs={items}
          kinds={kinds}
          custom={customDocs}
        />
      ) : tab === "attendance" && attendanceAdmin ? (
        <AttendanceColumnsManager initial={attendanceAdmin} />
      ) : tab === "bulletin" ? (
        <BulletinSettingsManager
          initial={bulletin}
          template={bulletinTemplate}
          ficheLetterheadUrl={fiche.letterhead_url ?? ""}
          legalRates={legalRates}
        />
      ) : (
        <CatalogsManager
          kinds={kinds}
          items={items}
          legends={legends}
          loadError={loadError}
        />
      )}
    </RhPage>
  );
}
