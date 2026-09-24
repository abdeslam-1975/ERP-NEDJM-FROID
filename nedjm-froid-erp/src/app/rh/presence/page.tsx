import { RhShell } from "@/components/rh/rh-shell";
import { AttendanceManager } from "@/components/rh/attendance-manager";
import { listHrContracts } from "@/lib/actions/hr-contracts";
import { loadHrLookups } from "@/lib/actions/hr-lookups";

export const dynamic = "force-dynamic";

export default async function PresencePage({
  searchParams,
}: {
  searchParams: Promise<{ employee?: string; site?: string; mois?: string }>;
}) {
  const sp = await searchParams;
  const [contracts, lookups] = await Promise.all([
    listHrContracts(),
    loadHrLookups(),
  ]);

  return (
    <RhShell title="Pointage">
      <AttendanceManager
        key={`${sp.employee ?? ""}|${sp.site ?? ""}|${sp.mois ?? ""}`}
        sites={lookups.sites}
        contracts={contracts.ok ? contracts.data : []}
        legends={lookups.legends}
        focus={{ employeeId: sp.employee, siteId: sp.site, month: sp.mois }}
        loadError={
          (!contracts.ok && contracts.error) || lookups.error || undefined
        }
      />
    </RhShell>
  );
}
