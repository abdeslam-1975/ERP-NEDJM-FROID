import { roundMoney } from "@/lib/hr/payroll-calc";

/**
 * Net shown on the pointage grid. It does not feed the payslip.
 *
 * (P + MS + AOP + BC + W + JF) × salaire journalier P/MS
 * + CRP × salaire journalier CRP
 * − AN × sanction Sonatrach
 *
 * The daily P/MS rate is the contract net reference ÷ calendar days of the month.
 * The CRP rate is the contract recovery net ÷ the same number of days, or the P/MS rate when recovery net is empty.
 * The Sonatrach penalty is one P/MS daily rate per AN day, shown in its own column.
 * A code outside this list does not change the amount.
 */
export const POINTAGE_NET_PMS = ["P", "MS", "AOP", "BC", "W", "JF"] as const;
export const POINTAGE_NET_CRP = ["CRP"] as const;
export const POINTAGE_NET_AN = ["AN"] as const;

export const POINTAGE_NET_CODES = new Set<string>([
  ...POINTAGE_NET_PMS,
  ...POINTAGE_NET_CRP,
  ...POINTAGE_NET_AN,
]);

export const POINTAGE_NET_FORMULA =
  "(P + MS + AOP + BC + W + JF) × salaire journalier P/MS + CRP × salaire journalier CRP − AN × sanction Sonatrach";

export type PointageNetInput = {
  codes: readonly string[];
  calendarDays: number;
  netRefMonthly: number | null;
  netRecupMonthly: number | null;
};

export type PointageNet = {
  amount: number | null;
  dailyPms: number;
  dailyCrp: number;
  sanction: number;
  /** AN days × the P/MS daily rate. Null when the contract has no net reference. */
  penalty: number | null;
  counts: Record<string, number>;
  paidDays: number;
  crpDays: number;
  anDays: number;
  unknown: string[];
};

export function unknownPointageCodes(codes: readonly string[]): string[] {
  const unknown = new Set<string>();
  for (const raw of codes) {
    const code = raw.trim().toUpperCase();
    if (!code || POINTAGE_NET_CODES.has(code)) continue;
    unknown.add(code);
  }
  return [...unknown].sort();
}

export function pointageNet(input: PointageNetInput): PointageNet {
  const counts: Record<string, number> = {};
  for (const raw of input.codes) {
    const code = raw.trim().toUpperCase();
    if (!code) continue;
    counts[code] = (counts[code] ?? 0) + 1;
  }
  const days = input.calendarDays > 0 ? input.calendarDays : 0;
  const hasRef = input.netRefMonthly != null && Number.isFinite(input.netRefMonthly);
  const hasRecup = input.netRecupMonthly != null && Number.isFinite(input.netRecupMonthly);
  const dailyPms = hasRef && days > 0 ? (input.netRefMonthly as number) / days : 0;
  const crpMonthly = hasRecup ? (input.netRecupMonthly as number) : hasRef ? (input.netRefMonthly as number) : 0;
  const dailyCrp = days > 0 ? crpMonthly / days : 0;
  const sanction = dailyPms;
  const paidDays = POINTAGE_NET_PMS.reduce((sum, code) => sum + (counts[code] ?? 0), 0);
  const crpDays = POINTAGE_NET_CRP.reduce((sum, code) => sum + (counts[code] ?? 0), 0);
  const anDays = POINTAGE_NET_AN.reduce((sum, code) => sum + (counts[code] ?? 0), 0);
  const unknown = Object.keys(counts)
    .filter((code) => !POINTAGE_NET_CODES.has(code))
    .sort();
  const penalty = hasRef ? roundMoney(anDays * sanction) : null;
  const amount = hasRef
    ? roundMoney(paidDays * dailyPms + crpDays * dailyCrp - (penalty ?? 0))
    : null;
  return { amount, dailyPms, dailyCrp, sanction, penalty, counts, paidDays, crpDays, anDays, unknown };
}

export type PointageRateContract = {
  id: string;
  employee_id: string;
  site_id: string;
  start_date: string;
  end_date: string | null;
  net_ref: number;
  net_recup: number | null;
};

export type PointageRateAssignment = {
  contract_id: string;
  site_id: string;
  effective_from: string;
};

export type PointageRateHistory = {
  contract_id: string;
  effective_from: string;
  net_ref: number;
};

function monthBounds(year: number, month: number) {
  const mm = String(month).padStart(2, "0");
  const start = `${year}-${mm}-01`;
  const end = `${year}-${mm}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
  return { start, end };
}

function coversMonth(startDate: string, endDate: string | null, start: string, end: string) {
  const from = startDate.slice(0, 10);
  const to = endDate ? endDate.slice(0, 10) : null;
  return Boolean(from) && from <= end && (!to || to >= start);
}

/** Site of the contract on the last day of the month: the latest assignment, else the contract site. */
export function siteOnMonth(
  contract: Pick<PointageRateContract, "id" | "site_id">,
  assignments: readonly PointageRateAssignment[],
  monthEnd: string,
) {
  let best: PointageRateAssignment | null = null;
  for (const assignment of assignments) {
    if (assignment.contract_id !== contract.id) continue;
    const from = assignment.effective_from.slice(0, 10);
    if (from > monthEnd) continue;
    if (!best || from > best.effective_from.slice(0, 10)) best = assignment;
  }
  return best?.site_id ?? contract.site_id;
}

function netAt(
  contract: PointageRateContract,
  history: readonly PointageRateHistory[],
  monthEnd: string,
) {
  let best: PointageRateHistory | null = null;
  for (const version of history) {
    if (version.contract_id !== contract.id) continue;
    const from = version.effective_from.slice(0, 10);
    if (from > monthEnd) continue;
    if (!best || from > best.effective_from.slice(0, 10)) best = version;
  }
  return best ? best.net_ref : contract.net_ref;
}

/** One net per employee for the site and month. The latest covering contract wins. */
export function pointageRatesForSite(input: {
  contracts: readonly PointageRateContract[];
  assignments: readonly PointageRateAssignment[];
  history: readonly PointageRateHistory[];
  siteId: string;
  year: number;
  month: number;
}): Record<string, { net_ref: number; net_recup: number | null }> {
  const { start, end } = monthBounds(input.year, input.month);
  const chosen = new Map<string, PointageRateContract>();
  for (const contract of input.contracts) {
    if (!coversMonth(contract.start_date, contract.end_date, start, end)) continue;
    if (siteOnMonth(contract, input.assignments, end) !== input.siteId) continue;
    const prev = chosen.get(contract.employee_id);
    if (!prev || contract.start_date.slice(0, 10) > prev.start_date.slice(0, 10)) {
      chosen.set(contract.employee_id, contract);
    }
  }
  const rates: Record<string, { net_ref: number; net_recup: number | null }> = {};
  for (const [employeeId, contract] of chosen) {
    rates[employeeId] = {
      net_ref: netAt(contract, input.history, end),
      net_recup: contract.net_recup,
    };
  }
  return rates;
}
