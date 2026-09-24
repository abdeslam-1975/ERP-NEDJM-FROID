"use client";

import Link from "next/link";
import { useState } from "react";
import { CatalogsManager } from "@/components/rh/catalogs-manager";
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
import { RhAlert, RhPage, RhTabs } from "@/components/rh/rh-ui";

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
  bulletin,
  legalRates,
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
  bulletin: HrBulletinSettings;
  legalRates?: BulletinLegalRates;
  loadError?: string;
}) {
  const [tab, setTab] = useState<"fiche" | "salary" | "catalogs" | "bulletin">("salary");
  return (
    <RhPage>
      {loadError ? <RhAlert tone="danger">{loadError}</RhAlert> : null}
      <div className="flex flex-wrap items-center gap-2">
        <RhTabs
          items={[
            { id: "salary", label: "Rubriques de salaire" },
            { id: "fiche", label: "Modèle de fiche" },
            { id: "catalogs", label: "Listes et codes" },
            { id: "bulletin", label: "Modèle de bulletin" },
          ]}
          value={tab}
          onChange={(id) => setTab(id as typeof tab)}
        />
        <Link
          href="/rh/legal"
          className="rounded-xl border border-border/70 bg-surface px-3.5 py-2 text-sm font-semibold text-foreground/75 transition hover:bg-surface-muted hover:text-foreground"
        >
          Cotisations & impôts
        </Link>
      </div>
      {tab === "salary" ? (
        <SalaryRubricsManager
          isSuperAdmin={isSuperAdmin}
          canEditValues={canEditSalaryValues}
          rubriques={rubriques}
          assignments={assignments}
          employees={employees}
          sites={sites}
          contracts={contracts}
        />
      ) : tab === "fiche" ? (
        <FicheSettingsManager
          initial={fiche}
          fields={fields}
          catalogs={items}
          isSuperAdmin={isSuperAdmin}
        />
      ) : tab === "bulletin" ? (
        <BulletinSettingsManager
          initial={bulletin}
          employeeFields={fields}
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
