import type { AttendanceCell } from "@/lib/actions/hr-ops";

export function isAutoProposed(cell: Pick<AttendanceCell, "source_code" | "status_code"> | undefined) {
  return Boolean(cell) && cell!.source_code !== "MANUAL" && cell!.status_code === "PROPOSED";
}

export function countPending(cells: AttendanceCell[]) {
  let proposed = 0;
  let edited = 0;
  for (const cell of cells) {
    if (cell.status_code !== "PROPOSED") continue;
    if (cell.source_code === "MANUAL") edited += 1;
    else proposed += 1;
  }
  return { proposed, edited };
}

export function cellOriginLabel(cell: AttendanceCell | undefined) {
  if (!cell) return "";
  const pending = cell.status_code === "PROPOSED";
  if (cell.source_code === "OM") {
    const ref = cell.correspondence_number ? ` N° ${cell.correspondence_number}` : "";
    return pending
      ? `Proposé par l'ordre de mission${ref} — non validé · مقترح من أمر المهمة — غير معتمد`
      : `Ordre de mission${ref} — validé · من أمر المهمة — معتمد`;
  }
  if (cell.source_code === "AUTO") {
    return pending ? "Proposé automatiquement — non validé · مقترح تلقائيًا — غير معتمد" : "Automatique — validé";
  }
  return pending ? "Saisie manuelle — non validée · إدخال يدوي — غير معتمد" : "Saisie manuelle — validée · إدخال يدوي — معتمد";
}

/**
 * Writes `code` on the given days for one employee. Days that already hold the same code
 * keep their origin (an untouched MS from an ordre de mission stays an OM value);
 * any real change becomes a MANUAL, not-yet-validated value. Empty code clears the days.
 */
export function paintAttendanceCells(
  prev: AttendanceCell[],
  input: { employeeId: string; siteId: string; dates: string[]; code: string },
): AttendanceCell[] {
  const code = input.code.trim().toUpperCase();
  const targets = new Set(input.dates);
  const kept: AttendanceCell[] = [];
  const existing = new Map<string, AttendanceCell>();
  for (const cell of prev) {
    if (cell.employee_id === input.employeeId && targets.has(cell.work_date)) {
      existing.set(cell.work_date, cell);
    } else {
      kept.push(cell);
    }
  }
  if (!code) return kept;
  for (const date of input.dates) {
    const current = existing.get(date);
    if (current && current.legend_code.toUpperCase() === code) {
      kept.push(current);
      continue;
    }
    kept.push({
      employee_id: input.employeeId,
      site_id: input.siteId,
      work_date: date,
      legend_code: code,
      source_code: "MANUAL",
      status_code: "PROPOSED",
      correspondence_id: null,
      correspondence_number: null,
    });
  }
  return kept;
}
