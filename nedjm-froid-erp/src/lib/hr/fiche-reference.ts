/** Next fiche reference for a year: 2026/001, never reused. */
export function nextFicheReference(year: number, taken: readonly string[]): string {
  const prefix = String(year);
  let max = 0;
  for (const value of taken) {
    const [y, n] = value.split("/");
    if (y !== prefix || !/^\d+$/.test(n ?? "")) continue;
    max = Math.max(max, Number(n));
  }
  return `${prefix}/${String(max + 1).padStart(3, "0")}`;
}
