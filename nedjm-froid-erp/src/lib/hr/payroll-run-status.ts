export const PAYROLL_RUN_STATUSES = ["DRAFT", "VALIDATED", "LOCKED"] as const;

export type PayrollRunStatus = (typeof PAYROLL_RUN_STATUSES)[number];

/** Reopening is not a transition: it only happens through a SUPER_ADMIN decision D7. */
export type PayrollRunAction = "validate" | "close";

/** Mirrors the transitions allowed by the hr_payroll_runs guard trigger. */
const TRANSITIONS: Record<PayrollRunAction, { from: PayrollRunStatus; to: PayrollRunStatus }> = {
  validate: { from: "DRAFT", to: "VALIDATED" },
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
      error:
        "Paie clôturée : aucune modification sans décision D7 du SUPER_ADMIN. · الأجور مقفلة: لا تعديل دون قرار D7 من SUPER_ADMIN.",
    };
  }
  if (action === "close") {
    return {
      ok: false,
      error: "Validez la paie avant de la clôturer. · يجب اعتماد الأجور قبل إقفالها.",
    };
  }
  return { ok: false, error: "Paie déjà validée. · الأجور معتمدة مسبقاً." };
}

/** Reopening a validated or closed run is requested, never done directly (decision D7). */
export function canRequestReopen(status: string | null | undefined): boolean {
  const s = normalizeRunStatus(status);
  return s === "VALIDATED" || s === "LOCKED";
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
    return "Paie clôturée pour ce mois : le pointage est figé (réouverture seulement sur décision D7 du SUPER_ADMIN). · أجور هذا الشهر مقفلة: الحضور مجمّد (إعادة الفتح بقرار D7 فقط).";
  }
  if (status === "VALIDATED") {
    return "Paie validée pour ce mois : le pointage est figé. Demandez la réouverture depuis Paie (décision D7 du SUPER_ADMIN). · أجور هذا الشهر معتمدة: الحضور مجمّد. اطلب إعادة الفتح من صفحة الأجور (قرار D7).";
  }
  return null;
}

export function runStatusLabel(status: string | null | undefined): { fr: string; ar: string } {
  const s = normalizeRunStatus(status);
  if (s === "LOCKED") return { fr: "Clôturée", ar: "مقفلة" };
  if (s === "VALIDATED") return { fr: "Validée", ar: "معتمدة" };
  return { fr: "Brouillon", ar: "مسودة" };
}
