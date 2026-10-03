type Orderable = { matricule: string; status?: string | null };

function matriculeParts(matricule: string): { year: number; seq: number } | null {
  const match = /^\s*(\d+)\s*\/\s*(\d{2}|\d{4})\s*$/.exec(matricule ?? "");
  if (!match) return null;
  const year = Number(match[2]);
  return { year: year < 100 ? 2000 + year : year, seq: Number(match[1]) };
}

/**
 * Staff order: matricule year (NN/YY) from the most recent, then active employees first,
 * then matricule number. Matricules outside the NN/YY pattern come last.
 */
export function compareEmployees(a: Orderable, b: Orderable): number {
  const pa = matriculeParts(a.matricule);
  const pb = matriculeParts(b.matricule);
  if (pa && !pb) return -1;
  if (!pa && pb) return 1;
  if (pa && pb && pa.year !== pb.year) return pb.year - pa.year;
  const aActive = a.status === "ACTIVE";
  const bActive = b.status === "ACTIVE";
  if (aActive !== bActive) return aActive ? -1 : 1;
  if (pa && pb && pa.seq !== pb.seq) return pa.seq - pb.seq;
  return (a.matricule ?? "").localeCompare(b.matricule ?? "", "fr", { numeric: true });
}

export function sortEmployees<T extends Orderable>(rows: T[]): T[] {
  return [...rows].sort(compareEmployees);
}
