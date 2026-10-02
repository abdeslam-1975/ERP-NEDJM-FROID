import Link from "next/link";
import { CalendarPlus, Upload } from "lucide-react";
import { RhShell } from "@/components/rh/rh-shell";
import { AttendanceManager } from "@/components/rh/attendance-manager";
import { AttendanceKpis } from "@/components/rh/rh-kpis";
import { RhPage, RhPageHeader } from "@/components/rh/rh-ui";
import { listAttendanceRoster } from "@/lib/actions/hr-ops";
import { loadAttendanceSnapshot, loadHrLookups } from "@/lib/actions/hr-lookups";
import { listAttendanceColumns } from "@/lib/actions/hr-attendance-sheet";
import { rosterToAttendanceContract } from "@/lib/hr/attendance-columns";

export const dynamic = "force-dynamic";

export default async function PresencePage({
  searchParams,
}: {
  searchParams: Promise<{ employee?: string; site?: string; mois?: string }>;
}) {
  const sp = await searchParams;
  const [roster, lookups, columns, snapshot] = await Promise.all([
    listAttendanceRoster(),
    loadHrLookups(),
    listAttendanceColumns(),
    loadAttendanceSnapshot(sp.site),
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
      <RhPage>
        <RhPageHeader
          eyebrow="Pointage des équipes"
          title="Temps & présence"
          actions={
            <>
              <Link
                href="/rh/presence/imports"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/80 bg-surface px-4 text-sm font-medium text-foreground/75 transition hover:border-brand/35 hover:text-brand"
              >
                <Upload className="h-4 w-4" aria-hidden />
                Importer pointeuse
              </Link>
              <Link
                href="/rh/conges"
                className="ui-btn ui-btn-primary inline-flex h-10 items-center gap-2 px-4 text-sm font-medium transition hover:-translate-y-px"
              >
                <CalendarPlus className="h-4 w-4" aria-hidden />
                Nouveau congé
              </Link>
            </>
          }
        />
        <AttendanceKpis snapshot={snapshot} />
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
      </RhPage>
    </RhShell>
  );
}
