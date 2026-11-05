function showDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

/** Dates already stored for this employee and this kind of document. */
export function documentDates(
  rows: { employee_id: string; start_date?: string | null; created_at?: string | null }[],
  employeeId: string,
): string[] {
  return rows
    .filter((row) => row.employee_id === employeeId)
    .map((row) => row.start_date || (row.created_at ? row.created_at.slice(0, 10) : "sans date"));
}

/**
 * Asks before creating another copy. The existing document stays.
 * An empty list means there is nothing to confirm.
 */
export function confirmAnotherCopy(titleFr: string, _titleAr: string, dates: string[]): boolean {
  if (typeof window === "undefined" || dates.length === 0) return true;
  const lines = dates.map((date) => `• ${showDate(date)}`).join("\n");
  return window.confirm(
    `${titleFr} existe déjà pour cet employé :\n${lines}\n\nCréer une nouvelle copie pour cet emploi ? L'ancienne reste conservée.`,
  );
}
