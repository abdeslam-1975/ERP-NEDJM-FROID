type Orderable = { matricule: string };

function matriculeParts(matricule: string): { year: number; seq: number } | null {
  const match = /^\s*(\d+)\s*\/\s*(\d{2}|\d{4})\s*$/.exec(matricule ?? "");
  if (!match) return null;
  const year = Number(match[2]);
  return { year: year < 100 ? 2000 + year : year, seq: Number(match[1]) };
}

/**
 * Staff order: latest hire first — matricule year (NN/YY) descending, then matricule number
 * descending. Matricules outside the NN/YY pattern come last.
 */
export function compareEmployees(a: Orderable, b: Orderable): number {
  const pa = matriculeParts(a.matricule);
  const pb = matriculeParts(b.matricule);
  if (pa && !pb) return -1;
  if (!pa && pb) return 1;
  if (pa && pb) {
    if (pa.year !== pb.year) return pb.year - pa.year;
    if (pa.seq !== pb.seq) return pb.seq - pa.seq;
  }
  return (b.matricule ?? "").localeCompare(a.matricule ?? "", "fr", { numeric: true });
}

export function sortEmployees<T extends Orderable>(rows: T[]): T[] {
  return [...rows].sort(compareEmployees);
}

/** Newest matricule year first, then the serial number from 001 upward. */
export function compareBySerial(a: Orderable, b: Orderable): number {
  const pa = matriculeParts(a.matricule);
  const pb = matriculeParts(b.matricule);
  if (pa && !pb) return -1;
  if (!pa && pb) return 1;
  if (pa && pb) {
    if (pa.year !== pb.year) return pb.year - pa.year;
    if (pa.seq !== pb.seq) return pa.seq - pb.seq;
  }
  return (a.matricule ?? "").localeCompare(b.matricule ?? "", "fr", { numeric: true });
}

export function compareByHired<T extends Orderable & { hired_at?: string | null }>(a: T, b: T): number {
  const ah = a.hired_at ?? "";
  const bh = b.hired_at ?? "";
  if (ah && !bh) return -1;
  if (!ah && bh) return 1;
  if (ah !== bh) return bh.localeCompare(ah);
  return compareBySerial(a, b);
}

export function compareByName<T extends { last_name?: string | null; first_name?: string | null; last_name_ar?: string | null; first_name_ar?: string | null }>(
  a: T,
  b: T,
): number {
  const name = (row: T) =>
    `${row.last_name ?? ""} ${row.first_name ?? ""}`.trim() ||
    `${row.last_name_ar ?? ""} ${row.first_name_ar ?? ""}`.trim();
  return name(a).localeCompare(name(b), "fr", { sensitivity: "base" });
}
