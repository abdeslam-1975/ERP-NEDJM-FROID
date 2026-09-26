import { RhShell } from "@/components/rh/rh-shell";
import { AttendanceManager } from "@/components/rh/attendance-manager";
import { listHrContracts } from "@/lib/actions/hr-contracts";
import { loadHrLookups } from "@/lib/actions/hr-lookups";
import { listAttendanceColumns } from "@/lib/actions/hr-attendance-sheet";
import { toAttendanceContract } from "@/lib/hr/attendance-columns";

export const dynamic = "force-dynamic";

export default async function PresencePage({
  searchParams,
}: {
  searchParams: Promise<{ employee?: string; site?: string; mois?: string }>;
}) {
  const sp = await searchParams;
  const [contracts, lookups, columns] = await Promise.all([
    listHrContracts(),
    loadHrLookups(),
    listAttendanceColumns(),
  ]);
  const jobTitles = [
    ...new Set(
      lookups.catalogs
        .filter((c) => c.kind === "job_title" && c.is_active)
        .map((c) => c.label_fr.trim())
        .filter(Boolean),
    ),
  ];

  return (
    <RhShell title="Pointage">
      <AttendanceManager
        key={`${sp.employee ?? ""}|${sp.site ?? ""}|${sp.mois ?? ""}`}
        sites={lookups.sites}
        contracts={contracts.ok ? contracts.data.map(toAttendanceContract) : []}
        legends={lookups.legends}
        columns={columns.ok ? columns.data.filter((c) => c.is_active) : []}
        jobTitles={jobTitles}
        focus={{ employeeId: sp.employee, siteId: sp.site, month: sp.mois }}
        loadError={
          (!contracts.ok && contracts.error) ||
          lookups.error ||
          (!columns.ok && columns.error) ||
          undefined
        }
      />
    </RhShell>
  );
}
