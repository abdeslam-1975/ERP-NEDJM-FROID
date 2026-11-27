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
 * The Sonatrach penalty is one P/MS daily rate per sanctioned day, shown in its own column.
 * Which codes use each rate is saved in Paramètres → Feuille de présence.
 * A code with no saved effect does not change the amount.
 */
export const POINTAGE_NET_PMS = ["P", "MS", "AOP", "BC", "W", "JF"] as const;
export const POINTAGE_NET_CRP = ["CRP"] as const;
export const POINTAGE_NET_AN = ["AN"] as const;

/** How a legend changes the pointage net. Stored per code in hr_pointage_net_rules. */
export type PointageNetEffect = "PMS" | "CRP" | "SANCTION" | "NONE";

export type PointageNetRule = {
  code: string;
  effect: PointageNetEffect;
};

export const POINTAGE_NET_EFFECTS: readonly PointageNetEffect[] = ["PMS", "CRP", "SANCTION", "NONE"];

/** Used when the settings table has not been read yet. */
export const POINTAGE_NET_DEFAULT_RULES: readonly PointageNetRule[] = [
  ...POINTAGE_NET_PMS.map((code) => ({ code, effect: "PMS" as const })),
  ...POINTAGE_NET_CRP.map((code) => ({ code, effect: "CRP" as const })),
  ...POINTAGE_NET_AN.map((code) => ({ code, effect: "SANCTION" as const })),
];

export const POINTAGE_NET_CODES = new Set<string>(POINTAGE_NET_DEFAULT_RULES.map((rule) => rule.code));

export type PointageNetInput = {
  codes: readonly string[];
  calendarDays: number;
  netRefMonthly: number | null;
  netRecupMonthly: number | null;
  /** Null or omitted: the built-in formula. An array is the formula saved in the application. */
  rules?: readonly PointageNetRule[] | null;
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

export function pointageNetRuleMap(rules?: readonly PointageNetRule[] | null): Map<string, PointageNetEffect> {
  const source = rules == null ? POINTAGE_NET_DEFAULT_RULES : rules;
  const map = new Map<string, PointageNetEffect>();
  for (const rule of source) {
    const code = rule.code.trim().toUpperCase();
    if (!code || !POINTAGE_NET_EFFECTS.includes(rule.effect)) continue;
    map.set(code, rule.effect);
  }
  return map;
}

function codesFor(rules: readonly PointageNetRule[] | null | undefined, effect: PointageNetEffect): string[] {
  const source = rules == null ? POINTAGE_NET_DEFAULT_RULES : rules;
  const seen = new Set<string>();
  const codes: string[] = [];
  for (const rule of source) {
    const code = rule.code.trim().toUpperCase();
    if (!code || seen.has(code) || rule.effect !== effect) continue;
    seen.add(code);
    codes.push(code);
  }
  return codes;
}

function joinFormula(rules: readonly PointageNetRule[] | null | undefined, pms: string, crp: string, sanction: string): string {
  const presence = codesFor(rules, "PMS");
  const recovery = codesFor(rules, "CRP");
  const penalty = codesFor(rules, "SANCTION");
  const parts: string[] = [];
  if (presence.length) parts.push(`(${presence.join(" + ")}) × ${pms}`);
  if (recovery.length) parts.push(`(${recovery.join(" + ")}) × ${crp}`);
  const plus = parts.join(" + ");
  if (!penalty.length) return plus || "Aucun code dans la formule";
  const minus = `(${penalty.join(" + ")}) × ${sanction}`;
  return plus ? `${plus} − ${minus}` : `− ${minus}`;
}

/** French sentence shown on the net column. Follows the rules saved in the application. */
export function pointageNetFormula(rules?: readonly PointageNetRule[] | null): string {
  return joinFormula(rules, "salaire journalier P/MS", "salaire journalier CRP", "sanction Sonatrach");
}

export function pointageNetFormulaAr(rules?: readonly PointageNetRule[] | null): string {
  return joinFormula(rules, "أجر يوم الحضور", "أجر يوم الاسترجاع", "عقوبة سوناطراك");
}

export const POINTAGE_NET_FORMULA = pointageNetFormula();

export function unknownPointageCodes(codes: readonly string[], rules?: readonly PointageNetRule[] | null): string[] {
  const known = pointageNetRuleMap(rules);
  const unknown = new Set<string>();
  for (const raw of codes) {
    const code = raw.trim().toUpperCase();
    if (!code || known.has(code)) continue;
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
  const effects = pointageNetRuleMap(input.rules);
  let paidDays = 0;
  let crpDays = 0;
  let anDays = 0;
  const unknown: string[] = [];
  for (const [code, count] of Object.entries(counts)) {
    const effect = effects.get(code);
    if (effect === "PMS") paidDays += count;
    else if (effect === "CRP") crpDays += count;
    else if (effect === "SANCTION") anDays += count;
    else if (effect !== "NONE") unknown.push(code);
  }
  unknown.sort();
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
