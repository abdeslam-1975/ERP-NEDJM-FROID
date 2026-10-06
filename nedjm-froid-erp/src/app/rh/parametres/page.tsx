import { RhShell } from "@/components/rh/rh-shell";
import { RhParametres } from "@/components/rh/rh-parametres";
import { RhSettingsOverview } from "@/components/rh/rh-settings-overview";
import { RhPage, RhPageHeader } from "@/components/rh/rh-ui";
import { loadPayrollIrgScales } from "@/lib/actions/hr-ops";
import { loadHrLookups } from "@/lib/actions/hr-lookups";
import { listHrEmployeeFields, listHrEmployeeRows } from "@/lib/actions/hr-employees";
import { listHrContracts } from "@/lib/actions/hr-contracts";
import { listSites } from "@/lib/actions/sites";
import { listSalaryAssignments, listSalaryRubriques } from "@/lib/actions/hr-salary";
import { getHrFicheSettings } from "@/lib/actions/hr-fiche";
import { getHrCompanyProfile } from "@/lib/actions/hr-company";
import { listCustomDocDefs, listDocFonts } from "@/lib/actions/hr-custom-docs";
import { loadPayrollBulletinContext } from "@/lib/actions/hr-bulletin";
import { loadAttendanceColumnsAdmin } from "@/lib/actions/hr-attendance-sheet";
import { listPostes } from "@/lib/actions/hr-postes";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { HR_SALARY_VALUE_ROLES, workspaceHasRole } from "@/lib/auth/require-roles";
import { DEFAULT_FICHE_SETTINGS } from "@/lib/hr/fiche-settings";
import { loadLegalSettings } from "@/lib/hr/load-legal-settings";

export const dynamic = "force-dynamic";

export default async function RhParametresPage() {
  const now = new Date();
  const [
    lookups,
    fields,
    fiche,
    workspace,
    rubriques,
    assignments,
    employees,
    contracts,
    sites,
    bulletin,
    attendanceAdmin,
    irg,
    postes,
    legal,
    company,
    customDefs,
    docFonts,
  ] = await Promise.all([
    loadHrLookups(),
    listHrEmployeeFields(),
    getHrFicheSettings(),
    getWorkspaceProfile(),
    listSalaryRubriques(),
    listSalaryAssignments(),
    listHrEmployeeRows(),
    listHrContracts(),
    listSites(),
    loadPayrollBulletinContext(),
    loadAttendanceColumnsAdmin(),
    loadPayrollIrgScales({ year: now.getFullYear(), month: now.getMonth() + 1 }),
    listPostes(),
    loadLegalSettings(),
    getHrCompanyProfile(),
    listCustomDocDefs(),
    listDocFonts(),
  ]);
  const salaryError =
    (!rubriques.ok && rubriques.error) ||
    (!assignments.ok && assignments.error) ||
    undefined;
  return (
    <RhShell title="Paramètres RH">
      <RhPage className="mb-5">
        <RhPageHeader eyebrow="Configuration du module RH" title="Paramètres" />
        <RhSettingsOverview
          rates={bulletin.legalRates}
          brackets={irg.ok ? irg.data.brackets.slice().sort((a, b) => a.min_annual - b.min_annual) : []}
          counts={{
            rubriques: rubriques.ok ? rubriques.data.length : 0,
            lists: lookups.kinds.length,
            fields: fields.ok ? fields.data.filter((f) => f.is_active).length : 0,
            legends: lookups.legends.length,
            sites: sites.ok ? sites.data.length : 0,
          }}
        />
      </RhPage>
      <RhParametres
        kinds={lookups.kinds}
        items={lookups.catalogs}
        legends={lookups.legends}
        fields={fields.ok ? fields.data : []}
        fiche={fiche.ok ? fiche.data : DEFAULT_FICHE_SETTINGS}
        isSuperAdmin={workspace?.isSuperAdmin ?? false}
        canEditSalaryValues={
          workspace ? workspaceHasRole(workspace, HR_SALARY_VALUE_ROLES) : false
        }
        rubriques={rubriques.ok ? rubriques.data : []}
        assignments={assignments.ok ? assignments.data : []}
        employees={(employees.ok ? employees.data : []).map((e) => ({
          id: e.id,
          label: `${e.matricule} · ${e.last_name} ${e.first_name}`,
        }))}
        sites={(sites.ok ? sites.data : []).map((s) => ({
          id: s.id,
          label: `${s.code} · ${s.name_fr}`,
        }))}
        contracts={(contracts.ok ? contracts.data : []).map((c) => ({
          id: c.id,
          label: `${c.matricule} · ${c.employee_name} · ${c.site_name}${
            c.poste_fr ? ` · ${c.poste_fr}` : ""
          }`,
        }))}
        postes={(postes.ok ? postes.data : []).map((p) => ({ id: p.id, label: `${p.code} · ${p.label_fr}` }))}
        legal={legal}
        bulletin={bulletin.bulletin}
        bulletinTemplate={bulletin.template}
        legalRates={bulletin.legalRates}
        attendanceAdmin={attendanceAdmin.ok ? attendanceAdmin.data : null}
        company={company.ok ? company.data : null}
        customDocs={{
          defs: customDefs.ok ? customDefs.data.defs : [],
          canEdit: customDefs.ok ? customDefs.data.canEdit : false,
          fonts: docFonts.ok ? docFonts.data : [],
          error: (!customDefs.ok ? customDefs.error : undefined) || (!docFonts.ok ? docFonts.error : undefined),
        }}
        loadError={
          lookups.error ||
          (!fields.ok ? fields.error : undefined) ||
          (!fiche.ok ? fiche.error : undefined) ||
          (!company.ok ? company.error : undefined) ||
          salaryError ||
          bulletin.error
        }
      />
    </RhShell>
  );
}
