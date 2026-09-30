/** Attendance legend weight, typed with a decimal comma (0,5) or a dot. */
export function parseLegendCoefficient(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
  }
  if (typeof value !== "string") return null;
  const t = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
}

export function formatLegendCoefficient(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(Math.round(value * 1000) / 1000).replace(".", ",");
}

export type LegendCoefficientVersion = { effective_from: string; coefficient: number };

/** Coefficient in force for the month of `day` (versions from ref_legende_coefficients, D14). */
export function legendCoefficientAt(
  versions: readonly LegendCoefficientVersion[] | undefined,
  day: string,
  fallback: number,
): number {
  const month = `${day.slice(0, 7)}-01`;
  let best: LegendCoefficientVersion | null = null;
  for (const v of versions ?? []) {
    if (v.effective_from <= month && (!best || v.effective_from > best.effective_from)) best = v;
  }
  return best ? best.coefficient : fallback;
}

/** Versions starting after the month of `day`: changes already decided, not yet in force. */
export function scheduledLegendCoefficients(
  versions: readonly LegendCoefficientVersion[] | undefined,
  day: string,
): LegendCoefficientVersion[] {
  const month = `${day.slice(0, 7)}-01`;
  return (versions ?? [])
    .filter((v) => v.effective_from > month)
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from));
}

export function groupLegendCoefficientVersions(
  rows: readonly { legend_id: string; coefficient: unknown; effective_from: unknown }[],
): Map<string, LegendCoefficientVersion[]> {
  const out = new Map<string, LegendCoefficientVersion[]>();
  for (const r of rows) {
    const coefficient = Number(r.coefficient);
    if (!Number.isFinite(coefficient)) continue;
    const list = out.get(r.legend_id) ?? [];
    list.push({ effective_from: String(r.effective_from).slice(0, 10), coefficient });
    out.set(r.legend_id, list);
  }
  return out;
}

/** Keeps digits and a single comma while the user is typing. */
export function sanitizeLegendCoefficientInput(raw: string): string {
  const s = raw.replace(/\s/g, "").replace(/\./g, ",").replace(/[^\d,]/g, "");
  const comma = s.indexOf(",");
  if (comma === -1) return s.slice(0, 3);
  const intPart = s.slice(0, comma).replace(/,/g, "").slice(0, 3);
  const decPart = s.slice(comma + 1).replace(/,/g, "").slice(0, 3);
  return `${intPart},${decPart}`;
}
