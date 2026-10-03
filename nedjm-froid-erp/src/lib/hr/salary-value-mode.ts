export type SalaryUnit = "day" | "month" | "percent" | "presence_day" | "month_days";
export type ValueMode = "percent" | "month" | "day" | "month_days";

/** GAS modes: % / forfait / journalier (*J), plus monthly amount spread over the days of the month. */
export const VALUE_MODES = [
  { unit: "percent" as const, fr: "Pourcentage *%", ar: "نسبة" },
  { unit: "month" as const, fr: "Montant /F", ar: "مبلغ" },
  { unit: "day" as const, fr: "Journalier *J", ar: "برام" },
  { unit: "month_days" as const, fr: "Mensuel ÷ jours du mois", ar: "شهري ÷ أيام الشهر" },
];

export function valueModeLabel(unit: SalaryUnit, bi: (fr: string, ar: string) => string) {
  if (unit === "percent") return bi("Pourcentage *%", "نسبة");
  if (unit === "month") return bi("Montant /F", "مبلغ");
  if (unit === "month_days") return bi("Mensuel ÷ jours du mois", "شهري ÷ أيام الشهر");
  if (unit === "presence_day") return bi("Journalier présence", "برام حضور");
  return bi("Journalier *J", "برام");
}

export function valueModeSelectValue(unit: SalaryUnit): ValueMode {
  if (unit === "percent" || unit === "month" || unit === "month_days") return unit;
  return "day";
}

export function applyValueMode(mode: ValueMode, previous: SalaryUnit): SalaryUnit {
  if (mode !== "day") return mode;
  return previous === "presence_day" ? "presence_day" : "day";
}

export function valueSuffix(unit: SalaryUnit) {
  if (unit === "percent") return "%";
  if (unit === "month") return "DA";
  if (unit === "month_days") return "DA/mois";
  return "DA/j";
}
