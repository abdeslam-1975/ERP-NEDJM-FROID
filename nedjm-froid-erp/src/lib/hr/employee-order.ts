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
