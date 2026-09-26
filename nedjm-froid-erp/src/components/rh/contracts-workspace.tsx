"use client";

import { useState } from "react";
import { ContractsManager } from "@/components/rh/contracts-manager";
import { SalaryRubricsManager, type SalaryTarget } from "@/components/rh/salary-rubrics-manager";
import { LegalSettings } from "@/components/rh/legal-settings";
import type { HrContractRow } from "@/lib/actions/hr-contracts";
import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import type { HrEmployeeRow } from "@/lib/actions/hr-employees";
import type { SalaryAssignment, SalaryRubrique } from "@/lib/actions/hr-salary";
import type { LegalVarRow } from "@/lib/actions/hr-legal-vars";
import type { IrgCatalog } from "@/lib/actions/hr-irg";
import type { PosteRow } from "@/lib/actions/hr-postes";
import { RhPage, RhTabs, bi } from "@/components/rh/rh-ui";

type SiteOpt = {
  id: string;
  name_fr: string;
  is_active: boolean;
  activity_code_id?: string | null;
};
type ActivityOpt = { id: string; code: string; label_fr: string };

type Tab = "contrat" | "rubriques" | "legal";

export function ContractsWorkspace({
  initialContracts,
  employees,
  sites,
  activities,
  catalogs,
  rubriques,
  assignments,
  salaryEmployees,
  salarySites,
  salaryContracts,
  legalVars,
  irgCatalog,
  isSuperAdmin,
  canEditSalaryValues,
  postes,
  loadError,
  legalError,
}: {
  postes: PosteRow[];
  initialContracts: HrContractRow[];
  employees: HrEmployeeRow[];
  sites: readonly SiteOpt[];
  activities: readonly ActivityOpt[];
  catalogs: CatalogItem[];
  rubriques: SalaryRubrique[];
  assignments: SalaryAssignment[];
  salaryEmployees: SalaryTarget[];
  salarySites: SalaryTarget[];
  salaryContracts: SalaryTarget[];
  legalVars: LegalVarRow[];
  irgCatalog: IrgCatalog;
  isSuperAdmin: boolean;
  canEditSalaryValues: boolean;
  loadError?: string;
  legalError?: string;
}) {
  const [tab, setTab] = useState<Tab>("contrat");

  return (
    <RhPage>
      <RhTabs
        items={[
          { id: "contrat", label: bi("Contrat de travail", "عقد العمل") },
          { id: "rubriques", label: bi("Rubriques de salaire", "بنود الأجر") },
          { id: "legal", label: bi("Cotisations & impôts", "الاشتراكات والضرائب") },
        ]}
        value={tab}
        onChange={(id) => setTab(id as Tab)}
      />

      {tab === "contrat" ? (
        <ContractsManager
          initialContracts={initialContracts}
          employees={employees}
          sites={sites}
          activities={activities}
          catalogs={catalogs}
          rubriques={rubriques}
          assignments={assignments}
          salaryEmployees={salaryEmployees}
          salarySites={salarySites}
          salaryContracts={salaryContracts}
          legalVars={legalVars}
          irgCatalog={irgCatalog}
          isSuperAdmin={isSuperAdmin}
          canEditSalaryValues={canEditSalaryValues}
          postes={postes}
          legalError={legalError}
          loadError={loadError}
        />
      ) : null}

      {tab === "rubriques" ? (
        <SalaryRubricsManager
          isSuperAdmin={isSuperAdmin}
          canEditValues={canEditSalaryValues}
          rubriques={rubriques}
          assignments={assignments}
          employees={salaryEmployees}
          sites={salarySites}
          contracts={salaryContracts}
          postes={postes.map((p) => ({ id: p.id, label: `${p.code} · ${p.label_fr}` }))}
        />
      ) : null}

      {tab === "legal" ? (
        <LegalSettings
          vars={legalVars}
          irgCatalog={irgCatalog}
          isSuperAdmin={isSuperAdmin}
          loadError={legalError}
        />
      ) : null}
    </RhPage>
  );
}
