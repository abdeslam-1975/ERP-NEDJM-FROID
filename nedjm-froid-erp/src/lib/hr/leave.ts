/** Leave balances and end-of-employment settlement (pure helpers). */

export type LeaveKind = "ANNUAL" | "RECOVERY" | "SICK" | "UNPAID" | "EXCEPTIONAL";
export type LeaveStatus = "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED";

export const LEAVE_KINDS: { code: LeaveKind; fr: string; ar: string; legend: string }[] = [
  { code: "ANNUAL", fr: "Congé annuel", ar: "عطلة سنوية", legend: "CA" },
  { code: "RECOVERY", fr: "Récupération", ar: "عطلة تعويضية", legend: "CRP" },
  { code: "SICK", fr: "Congé maladie", ar: "عطلة مرضية", legend: "CM" },
  { code: "UNPAID", fr: "Congé sans solde", ar: "عطلة بدون أجر", legend: "CSS" },
  { code: "EXCEPTIONAL", fr: "Absence autorisée payée", ar: "غياب مرخص مدفوع", legend: "AOP" },
];

export function leaveKindLabel(kind: string) {
  return LEAVE_KINDS.find((k) => k.code === kind) ?? { code: kind, fr: kind, ar: kind, legend: "" };
}

const DAY_MS = 86_400_000;

function dayIndex(iso: string) {
  return Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS);
}

export function isoFromIndex(idx: number) {
  return new Date(idx * DAY_MS).toISOString().slice(0, 10);
}

/** Calendar days between two ISO dates, inclusive. */
export function calendarDays(start: string, end: string) {
  if (!start || !end) return 0;
  const n = dayIndex(end) - dayIndex(start) + 1;
  return n > 0 ? n : 0;
}

/** Day after the last leave day. */
export function returnDate(end: string) {
  return isoFromIndex(dayIndex(end) + 1);
}

type ContractSpan = { employee_id: string; start_date: string; end_date: string | null; affectation_principale?: boolean };

/**
 * Months of employment between contract starts and `asOf` (overlaps counted once), as a fraction:
 * each calendar month counts covered days / days of that month.
 */
export function monthsWorked(contracts: ContractSpan[], asOf: string) {
  const limit = dayIndex(asOf);
  const spans = contracts
    .filter((c) => c.affectation_principale !== false && c.start_date && dayIndex(c.start_date) <= limit)
    .map((c) => [dayIndex(c.start_date), Math.min(c.end_date ? dayIndex(c.end_date) : limit, limit)] as const)
    .filter(([a, b]) => b >= a)
    .sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of spans) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  let months = 0;
  for (const [a, b] of merged) {
    let cur = a;
    while (cur <= b) {
      const d = new Date(cur * DAY_MS);
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth();
      const monthLen = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const monthEnd = Math.floor(Date.UTC(y, m, monthLen) / DAY_MS);
      const to = Math.min(b, monthEnd);
      months += (to - cur + 1) / monthLen;
      cur = to + 1;
    }
  }
  return Math.round(months * 100) / 100;
}

export type LeaveBalance = {
  employee_id: string;
  months: number;
  accrued: number;
  adjustments: number;
  taken: number;
  pending: number;
  balance: number;
};

/** Annual leave balance: adjustments + accrued (rate × months worked) − approved annual leave. */
export function computeLeaveBalance(input: {
  employeeId: string;
  contracts: ContractSpan[];
  requests: { employee_id: string; kind: string; status: string; days: number }[];
  adjustments: { employee_id: string; days: number }[];
  asOf: string;
  ratePerMonth: number;
}): LeaveBalance {
  const own = <T extends { employee_id: string }>(rows: T[]) => rows.filter((r) => r.employee_id === input.employeeId);
  const months = monthsWorked(own(input.contracts), input.asOf);
  const accrued = Math.round(months * input.ratePerMonth * 10) / 10;
  const adjustments = own(input.adjustments).reduce((s, a) => s + Number(a.days), 0);
  const annual = own(input.requests).filter((r) => r.kind === "ANNUAL");
  const taken = annual.filter((r) => r.status === "APPROVED").reduce((s, r) => s + Number(r.days), 0);
  const pending = annual.filter((r) => r.status === "SUBMITTED").reduce((s, r) => s + Number(r.days), 0);
  return {
    employee_id: input.employeeId,
    months,
    accrued,
    adjustments,
    taken,
    pending,
    balance: Math.round((adjustments + accrued - taken) * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// End of employment
// ---------------------------------------------------------------------------

export const EXIT_REASONS: { code: string; fr: string; ar: string }[] = [
  { code: "END_CDD", fr: "Fin de contrat (CDD)", ar: "انتهاء مدة العقد" },
  { code: "RESIGNATION", fr: "Démission", ar: "استقالة" },
  { code: "DISMISSAL", fr: "Licenciement", ar: "تسريح" },
  { code: "ABANDON", fr: "Abandon de poste", ar: "إهمال المنصب" },
  { code: "MUTUAL", fr: "Rupture à l'amiable", ar: "فسخ بالتراضي" },
  { code: "TRIAL_END", fr: "Fin de période d'essai", ar: "إنهاء فترة التجربة" },
  { code: "RETIREMENT", fr: "Retraite", ar: "تقاعد" },
  { code: "DEATH", fr: "Décès", ar: "وفاة" },
  { code: "OTHER", fr: "Autre", ar: "أخرى" },
];

export function exitReasonLabel(code: string) {
  return EXIT_REASONS.find((r) => r.code === code) ?? { code, fr: code, ar: code };
}

export type SettlementLine = {
  code: string;
  label_fr: string;
  label_ar: string;
  /** 1 = cotisable + imposable, 2 = cotisable, 3 = imposable, 4 = ni l'un ni l'autre. */
  category: "1" | "2" | "3" | "4";
  amount: number;
};

/** Suggested final settlement: untaken annual leave paid at base / 30 per day (cotisable + imposable). */
export function suggestSettlement(input: { leaveBalanceDays: number; baseMonthly: number }): SettlementLine[] {
  const lines: SettlementLine[] = [];
  const days = Math.max(0, input.leaveBalanceDays);
  if (days > 0 && input.baseMonthly > 0) {
    lines.push({
      code: "ICP",
      label_fr: `Indemnité compensatrice de congé (${days} j)`,
      label_ar: `تعويض العطلة غير المستهلكة (${days} يوم)`,
      category: "1",
      amount: Math.round((input.baseMonthly / 30) * days * 100) / 100,
    });
  }
  return lines;
}

export function normalizeSettlementLines(raw: unknown): SettlementLine[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
    .map((l) => ({
      code: String(l.code ?? "AUTRE").slice(0, 20),
      label_fr: String(l.label_fr ?? ""),
      label_ar: String(l.label_ar ?? ""),
      category: (["1", "2", "3", "4"].includes(String(l.category)) ? String(l.category) : "4") as SettlementLine["category"],
      amount: Number(l.amount) || 0,
    }))
    .filter((l) => l.amount !== 0);
}
