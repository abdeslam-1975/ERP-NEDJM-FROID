import { RhShell } from "@/components/rh/rh-shell";
import { AttendanceManager } from "@/components/rh/attendance-manager";
import { listAttendanceRoster } from "@/lib/actions/hr-ops";
import { loadHrLookups } from "@/lib/actions/hr-lookups";
import { listAttendanceColumns } from "@/lib/actions/hr-attendance-sheet";
import { rosterToAttendanceContract } from "@/lib/hr/attendance-columns";

export const dynamic = "force-dynamic";

export default async function PresencePage({
  searchParams,
}: {
  searchParams: Promise<{ employee?: string; site?: string; mois?: string }>;
}) {
  const sp = await searchParams;
  const [roster, lookups, columns] = await Promise.all([
    listAttendanceRoster(),
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
        contracts={roster.ok ? roster.data.map(rosterToAttendanceContract) : []}
        legends={lookups.legends}
        columns={columns.ok ? columns.data.filter((c) => c.is_active) : []}
        jobTitles={jobTitles}
        focus={{ employeeId: sp.employee, siteId: sp.site, month: sp.mois }}
        loadError={
          (!roster.ok && roster.error) ||
          lookups.error ||
          (!columns.ok && columns.error) ||
          undefined
        }
      />
    </RhShell>
  );
}
