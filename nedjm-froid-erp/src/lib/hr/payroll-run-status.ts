export const PAYROLL_RUN_STATUSES = ["DRAFT", "VALIDATED", "LOCKED"] as const;

export type PayrollRunStatus = (typeof PAYROLL_RUN_STATUSES)[number];

export type PayrollRunAction = "validate" | "reopen" | "close";

/** Mirrors the transitions allowed by the hr_payroll_runs guard trigger. */
const TRANSITIONS: Record<PayrollRunAction, { from: PayrollRunStatus; to: PayrollRunStatus }> = {
  validate: { from: "DRAFT", to: "VALIDATED" },
  reopen: { from: "VALIDATED", to: "DRAFT" },
  close: { from: "VALIDATED", to: "LOCKED" },
};

export function normalizeRunStatus(value: string | null | undefined): PayrollRunStatus {
  return value === "VALIDATED" || value === "LOCKED" ? value : "DRAFT";
}

export function planRunTransition(
  current: string | null | undefined,
  action: PayrollRunAction,
): { ok: true; to: PayrollRunStatus } | { ok: false; error: string } {
  const from = normalizeRunStatus(current);
  const rule = TRANSITIONS[action];
  if (from === rule.from) return { ok: true, to: rule.to };
  if (from === "LOCKED") {
    return {
      ok: false,
      error: "Paie clôturée : aucune modification possible. · الأجور مقفلة: لا يمكن أي تعديل.",
    };
  }
  if (action === "close") {
    return {
      ok: false,
      error: "Validez la paie avant de la clôturer. · يجب اعتماد الأجور قبل إقفالها.",
    };
  }
  if (action === "validate") {
    return { ok: false, error: "Paie déjà validée. · الأجور معتمدة مسبقاً." };
  }
  return { ok: false, error: "Seule une paie validée peut être réouverte. · يمكن إعادة فتح الأجور المعتمدة فقط." };
}

/** Status of a period when several runs (per site and company-wide) cover it. */
export function periodStatus(statuses: readonly (string | null | undefined)[]): PayrollRunStatus | null {
  let result: PayrollRunStatus | null = null;
  for (const raw of statuses) {
    const s = normalizeRunStatus(raw);
    if (s === "LOCKED") return "LOCKED";
    if (s === "VALIDATED") result = "VALIDATED";
  }
  return result;
}

export function attendanceFrozenMessage(status: PayrollRunStatus | null): string | null {
  if (status === "LOCKED") {
    return "Paie clôturée pour ce mois : le pointage est figé. · أجور هذا الشهر مقفلة: الحضور مجمّد.";
  }
  if (status === "VALIDATED") {
    return "Paie validée pour ce mois : réouvrez-la depuis Paie avant de modifier le pointage. · أجور هذا الشهر معتمدة: أعد فتحها من صفحة الأجور قبل تعديل الحضور.";
  }
  return null;
}

export function runStatusLabel(status: string | null | undefined): { fr: string; ar: string } {
  const s = normalizeRunStatus(status);
  if (s === "LOCKED") return { fr: "Clôturée", ar: "مقفلة" };
  if (s === "VALIDATED") return { fr: "Validée", ar: "معتمدة" };
  return { fr: "Brouillon", ar: "مسودة" };
}
