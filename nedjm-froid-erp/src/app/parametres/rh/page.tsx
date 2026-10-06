import { AppShell } from "@/components/layout/app-shell";
import { RhSettingsOverview } from "@/components/rh/rh-settings-overview";
import { RhPage, RhPageHeader } from "@/components/rh/rh-ui";
import { loadPayrollIrgScales } from "@/lib/actions/hr-ops";
import { loadHrLookups } from "@/lib/actions/hr-lookups";
import { listHrEmployeeFields } from "@/lib/actions/hr-employees";
import { listSites } from "@/lib/actions/sites";
import { listSalaryRubriques } from "@/lib/actions/hr-salary";
import { loadPayrollBulletinContext } from "@/lib/actions/hr-bulletin";

export const dynamic = "force-dynamic";

export default async function RhSettingsOverviewPage() {
  const now = new Date();
  const [lookups, fields, rubriques, sites, bulletin, irg] = await Promise.all([
    loadHrLookups(),
    listHrEmployeeFields(),
    listSalaryRubriques(),
    listSites(),
    loadPayrollBulletinContext(),
    loadPayrollIrgScales({ year: now.getFullYear(), month: now.getMonth() + 1 }),
  ]);
  return (
    <AppShell title="Paramètres RH">
      <RhPage>
        <RhPageHeader
          eyebrow="Paramètres · Ressources humaines"
          title="Vue d'ensemble RH"
          description="Les taux et le barème en vigueur, et ce qui est déjà paramétré. Chaque bloc s'ouvre sur la section où il se modifie."
        />
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
    </AppShell>
  );
}
