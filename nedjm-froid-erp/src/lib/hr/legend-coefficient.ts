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

/** Keeps digits and a single comma while the user is typing. */
export function sanitizeLegendCoefficientInput(raw: string): string {
  const s = raw.replace(/\s/g, "").replace(/\./g, ",").replace(/[^\d,]/g, "");
  const comma = s.indexOf(",");
  if (comma === -1) return s.slice(0, 3);
  const intPart = s.slice(0, comma).replace(/,/g, "").slice(0, 3);
  const decPart = s.slice(comma + 1).replace(/,/g, "").slice(0, 3);
  return `${intPart},${decPart}`;
}
