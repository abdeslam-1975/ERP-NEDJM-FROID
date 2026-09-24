export type SalaryUnit = "day" | "month" | "percent" | "presence_day";

/** Three GAS modes: % / forfait / journalier (*J). */
export const VALUE_MODES = [
  { unit: "percent" as const, fr: "Pourcentage *%", ar: "نسبة" },
  { unit: "month" as const, fr: "Montant /F", ar: "مبلغ" },
  { unit: "day" as const, fr: "Journalier *J", ar: "برام" },
];

export function valueModeLabel(unit: SalaryUnit, bi: (fr: string, ar: string) => string) {
  if (unit === "percent") return bi("Pourcentage *%", "نسبة");
  if (unit === "month") return bi("Montant /F", "مبلغ");
  if (unit === "presence_day") return bi("Journalier présence", "برام حضور");
  return bi("Journalier *J", "برام");
}

export function valueModeSelectValue(unit: SalaryUnit): "percent" | "month" | "day" {
  if (unit === "percent") return "percent";
  if (unit === "month") return "month";
  return "day";
}

export function applyValueMode(
  mode: "percent" | "month" | "day",
  previous: SalaryUnit,
): SalaryUnit {
  if (mode === "percent") return "percent";
  if (mode === "month") return "month";
  return previous === "presence_day" ? "presence_day" : "day";
}

export function valueSuffix(unit: SalaryUnit) {
  if (unit === "percent") return "%";
  if (unit === "month") return "DA";
  return "DA/j";
}
