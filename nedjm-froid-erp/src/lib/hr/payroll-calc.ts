export type SalaryCategory = "1" | "2" | "3" | "4";
export type SalaryUnit = "day" | "month" | "percent" | "presence_day";
export type SalaryNature =
  | "indemnite"
  | "prime"
  | "rappel"
  | "remboursement"
  | "retenue";
export type LineSource =
  | "base"
  | "site"
  | "contract"
  | "employee"
  | "exception"
  | "advance"
  | "overtime"
  | "exit"
  | "poste";
export type LineUnit = SalaryUnit | "hour";

export type PayrollRubrique = {
  id: string;
  code: string;
  label_ar: string;
  label_fr: string;
  nature: SalaryNature;
  unit: SalaryUnit;
  category: SalaryCategory;
  cotisable: boolean;
  taxable: boolean;
  is_active: boolean;
};

export type PayrollAssignment = {
  rubrique_id: string;
  employee_id: string | null;
  site_id: string | null;
  contract_id: string | null;
  poste_id?: string | null;
  amount: number;
  unit?: SalaryUnit | null;
  is_active: boolean;
};

export type SalaryGridRow = {
  poste_id: string;
  grade: string;
  base_monthly: number;
  net_ref_monthly: number | null;
  effective_from: string;
};

/** Grid row in force at `asOf` for a poste and grade. */
export function gridAsOf(grid: SalaryGridRow[], posteId: string | null | undefined, grade: string | null | undefined, asOf: string) {
  if (!posteId) return null;
  const g = (grade || "A").toUpperCase();
  let best: SalaryGridRow | null = null;
  for (const row of grid) {
    if (row.poste_id !== posteId || row.grade.toUpperCase() !== g || row.effective_from > asOf) continue;
    if (!best || row.effective_from > best.effective_from) best = row;
  }
  return best;
}

export type PayrollException = {
  id: string;
  employee_id: string;
  rubrique_id: string;
  amount: number;
  period_year: number;
  period_month: number;
  duration_mode: "once" | "until";
  until_year: number | null;
  until_month: number | null;
  status_code: "DRAFT" | "APPROVED" | "CANCELLED";
  is_active: boolean;
  unit?: SalaryUnit | null;
};

export type PayrollLine = {
  rubrique_id: string | null;
  exception_id: string | null;
  advance_id?: string | null;
  source_code: LineSource;
  code: string;
  label_ar: string;
  label_fr: string;
  category: SalaryCategory;
  nature: SalaryNature;
  unit: LineUnit;
  cotisable: boolean;
  taxable: boolean;
  quantity: number;
  unit_amount: number;
  amount: number;
  sort_order: number;
};

export type PayrollSummary = {
  lines: PayrollLine[];
  days_worked: number;
  days_paid: number;
  gross_cotisable: number;
  taxable_gross: number;
  employee_ss: number;
  employer_ss: number;
  cacobatph: number;
  intemperies_employee: number;
  intemperies_employer: number;
  irg_base: number;
  irg_amount: number;
  net_payable: number;
};

export type LegalPayrollRates = {
  cnasEmployee: number;
  cnasEmployer: number;
  cnasFos: number;
  cacobatph: number;
  intemperiesEmployee: number;
  intemperiesEmployer: number;
  appliesCacobatph: boolean;
  appliesIntemperies: boolean;
  irgAmount: number;
};

export function salaryClassFlags(category: string): { cotisable: boolean; taxable: boolean } {
  if (category === "1") return { cotisable: true, taxable: true };
  if (category === "2") return { cotisable: true, taxable: false };
  if (category === "3") return { cotisable: false, taxable: true };
  return { cotisable: false, taxable: false };
}

export function roundMoney(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function ymIndex(year: number, month: number) {
  return year * 12 + month;
}

export const PAYROLL_CONTRACT_STATUSES = ["DRAFT", "ACTIVE"] as const;

/** Open contracts, plus ENDED ones whose last day falls in the period (final payslip). */
export function contractPayableInPeriod(
  c: { status: string; start_date: string; end_date: string | null },
  periodStart: string,
  periodEnd: string,
) {
  const end = c.end_date ? c.end_date.slice(0, 10) : null;
  if (c.status === "ENDED") {
    if (!end || end < periodStart || end > periodEnd) return false;
  } else if (!(PAYROLL_CONTRACT_STATUSES as readonly string[]).includes(c.status)) {
    return false;
  }
  return contractCoversPeriod(c.start_date.slice(0, 10), end, periodStart, periodEnd);
}

export function contractCoversPeriod(
  startDate: string,
  endDate: string | null | undefined,
  periodStart: string,
  periodEnd: string,
) {
  if (!startDate || startDate > periodEnd) return false;
  if (endDate && endDate < periodStart) return false;
  return true;
}

export function resolvePayrollPeriod(year?: string, month?: string) {
  const now = new Date();
  const y = Number(year);
  const m = Number(month);
  return {
    year: Number.isInteger(y) && y >= 2020 && y <= 2100 ? y : now.getFullYear(),
    month: Number.isInteger(m) && m >= 1 && m <= 12 ? m : now.getMonth() + 1,
  };
}

export function exceptionAppliesToPeriod(
  row: PayrollException,
  year: number,
  month: number,
) {
  if (!row.is_active || row.status_code !== "APPROVED") return false;
  const current = ymIndex(year, month);
  const start = ymIndex(row.period_year, row.period_month);
  if (row.duration_mode === "once") return current === start;
  if (row.until_year == null || row.until_month == null) return false;
  const until = ymIndex(row.until_year, row.until_month);
  return current >= start && current <= until;
}

const DAY_MS = 86_400_000;

function isoDayIndex(iso: string) {
  return Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS);
}

/** Days of the period covered by a contract (inclusive bounds, open end allowed). */
export function coveredDaysInPeriod(
  startDate: string,
  endDate: string | null | undefined,
  periodStart: string,
  periodEnd: string,
) {
  const from = Math.max(isoDayIndex(startDate), isoDayIndex(periodStart));
  const to = Math.min(endDate ? isoDayIndex(endDate) : Number.POSITIVE_INFINITY, isoDayIndex(periodEnd));
  return to >= from ? to - from + 1 : 0;
}

/**
 * Share of the monthly salary earned: calendar prorata of the contract's covered days,
 * minus 1/divisor per unpaid covered day. A fully paid month is exactly 1 whatever its length,
 * and split contracts (mid-month transfer) sum to 1.
 */
export function paidMonthFraction(input: {
  daysPaid: number;
  coveredDays: number;
  calendarDays: number;
  divisor: number;
}) {
  const cal = input.calendarDays > 0 ? input.calendarDays : 30;
  const den = input.divisor > 0 ? input.divisor : 30;
  const covered = Math.min(Math.max(input.coveredDays, 0), cal);
  const unpaid = Math.max(0, covered - Math.max(input.daysPaid, 0));
  const fraction = covered / cal - unpaid / den;
  return Math.min(1, Math.max(0, Math.round(fraction * 10_000) / 10_000));
}

export function quantityForUnit(
  unit: SalaryUnit,
  daysPaid: number,
  daysWorked: number,
  monthFraction: number,
) {
  if (unit === "day") return daysPaid;
  if (unit === "presence_day") return daysWorked;
  return monthFraction;
}

type ContractForPeriod = {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string | null;
};

/**
 * One slip per employee and run: several principal contracts in the same month
 * (mid-month change) are merged on the most recent one, with their covered days summed.
 */
export function groupContractsByEmployee<T extends ContractForPeriod>(
  contracts: T[],
  periodStart: string,
  periodEnd: string,
): Array<{ contract: T; coveredDays: number; contractCount: number }> {
  const byEmp = new Map<string, T[]>();
  for (const c of contracts) {
    const list = byEmp.get(c.employee_id) ?? [];
    list.push(c);
    byEmp.set(c.employee_id, list);
  }
  return [...byEmp.values()].map((list) => {
    const sorted = [...list].sort((a, b) => b.start_date.localeCompare(a.start_date));
    const coveredDays = list.reduce(
      (sum, c) => sum + coveredDaysInPeriod(c.start_date, c.end_date, periodStart, periodEnd),
      0,
    );
    return { contract: sorted[0], coveredDays, contractCount: list.length };
  });
}

export type SalaryVersion = {
  contract_id: string;
  effective_from: string;
  salaire_base_monthly: number;
  salaire_net_ref_monthly: number;
};

/** Salary of the version in force on `asOf` (latest effective_from ≤ asOf), else the contract fields. */
export function salaryAsOf(
  versions: SalaryVersion[],
  contractId: string,
  asOf: string,
  fallback: { base: number; net: number },
): { base: number; net: number } {
  let best: SalaryVersion | null = null;
  for (const v of versions) {
    if (v.contract_id !== contractId || v.effective_from.slice(0, 10) > asOf) continue;
    if (!best || v.effective_from > best.effective_from) best = v;
  }
  return best ? { base: best.salaire_base_monthly, net: best.salaire_net_ref_monthly } : fallback;
}

export type OvertimeSpec = { code: string; rate: number; label_fr: string; label_ar: string };

/** Overtime: hourly rate = base / legal monthly hours, paid hours × rate × (1 + premium). */
export function overtimeLines(input: {
  hours: Record<string, number>;
  baseMonthly: number;
  monthlyHours: number;
  specs: OvertimeSpec[];
}): PayrollLine[] {
  if (input.baseMonthly <= 0 || input.monthlyHours <= 0) return [];
  const hourly = input.baseMonthly / input.monthlyHours;
  const lines: PayrollLine[] = [];
  for (const spec of input.specs) {
    const qty = input.hours[spec.code] ?? 0;
    if (!(qty > 0)) continue;
    const unitAmount = roundMoney(hourly * (1 + spec.rate));
    lines.push({
      rubrique_id: null,
      exception_id: null,
      advance_id: null,
      source_code: "overtime",
      code: spec.code,
      label_ar: spec.label_ar,
      label_fr: spec.label_fr,
      category: "1",
      nature: "prime",
      unit: "hour",
      cotisable: true,
      taxable: true,
      quantity: roundMoney(qty),
      unit_amount: unitAmount,
      amount: roundMoney(qty * hourly * (1 + spec.rate)),
      sort_order: 0,
    });
  }
  return lines;
}

export type PayrollAdvance = {
  id: string;
  employee_id: string;
  kind: "ADVANCE" | "LOAN";
  principal_amount: number;
  installment_amount: number;
  start_year: number;
  start_month: number;
  status: "ACTIVE" | "CANCELLED";
};

/**
 * Monthly installments of active advances/loans started on or before the period, limited to
 * the remaining balance (principal − deducted in other runs) and to the net still available.
 */
export function advanceDeductionLines(input: {
  advances: PayrollAdvance[];
  deductedElsewhere: Map<string, number>;
  employeeId: string;
  year: number;
  month: number;
  availableNet: number;
  /** Exit month: the whole remaining balance is due. */
  settleAll?: boolean;
}): { lines: PayrollLine[]; capped: boolean } {
  const period = ymIndex(input.year, input.month);
  let available = Math.max(0, roundMoney(input.availableNet));
  let capped = false;
  const lines: PayrollLine[] = [];
  const due = input.advances
    .filter(
      (a) =>
        a.employee_id === input.employeeId &&
        a.status === "ACTIVE" &&
        ymIndex(a.start_year, a.start_month) <= period,
    )
    .sort((a, b) => ymIndex(a.start_year, a.start_month) - ymIndex(b.start_year, b.start_month));
  for (const adv of due) {
    const remaining = roundMoney(adv.principal_amount - (input.deductedElsewhere.get(adv.id) ?? 0));
    if (remaining <= 0) continue;
    const wanted = input.settleAll ? remaining : Math.min(adv.installment_amount, remaining);
    const amount = roundMoney(Math.min(wanted, available));
    if (amount < wanted) capped = true;
    if (amount <= 0) continue;
    available = roundMoney(available - amount);
    const loan = adv.kind === "LOAN";
    lines.push({
      rubrique_id: null,
      exception_id: null,
      advance_id: adv.id,
      source_code: "advance",
      code: loan ? "PRET" : "AVANCE",
      label_ar: loan ? "اقتطاع قرض" : "اقتطاع تسبيق",
      label_fr: loan ? "Remboursement prêt" : "Retenue avance",
      category: "4",
      nature: "retenue",
      unit: "month",
      cotisable: false,
      taxable: false,
      quantity: 1,
      unit_amount: amount,
      amount: -amount,
      sort_order: 0,
    });
  }
  return { lines, capped };
}

/** Final-settlement lines of a validated exit (positive = indemnité, negative = retenue). */
export function exitSettlementLines(
  lines: { code: string; label_fr: string; label_ar: string; category: SalaryCategory; amount: number }[],
): PayrollLine[] {
  return lines
    .filter((l) => Number.isFinite(l.amount) && l.amount !== 0)
    .map((l) => ({
      rubrique_id: null,
      exception_id: null,
      advance_id: null,
      source_code: "exit" as const,
      code: l.code,
      label_ar: l.label_ar,
      label_fr: l.label_fr,
      category: l.category,
      nature: l.amount < 0 ? ("retenue" as const) : ("indemnite" as const),
      unit: "month" as const,
      ...salaryClassFlags(l.category),
      quantity: 1,
      unit_amount: roundMoney(Math.abs(l.amount)),
      amount: roundMoney(l.amount),
      sort_order: 0,
    }));
}

export function computeLineAmount(input: {
  unit: SalaryUnit;
  unitAmount: number;
  quantity: number;
  baseMonthly: number;
  nature: SalaryNature;
}) {
  const qty = input.quantity;
  if (input.unit === "percent") {
    const signed = input.nature === "retenue" ? -Math.abs(input.unitAmount) : input.unitAmount;
    return roundMoney(input.baseMonthly * (signed / 100) * qty);
  }
  const raw = input.unitAmount * qty;
  if (input.nature === "retenue") return roundMoney(-Math.abs(raw));
  return roundMoney(raw);
}

export function resolvePermanentAssignment(
  rubriqueId: string,
  assignments: PayrollAssignment[],
  ctx: { employeeId: string; siteId: string; contractId: string; posteId?: string | null },
): { amount: number; source: "site" | "contract" | "employee" | "poste"; unit: SalaryUnit | null } | null {
  const related = assignments.filter(
    (a) => a.rubrique_id === rubriqueId && a.is_active,
  );
  const emp = related.find((a) => a.employee_id === ctx.employeeId);
  if (emp) return { amount: emp.amount, source: "employee", unit: emp.unit ?? null };
  const ctr = related.find((a) => a.contract_id === ctx.contractId);
  if (ctr) return { amount: ctr.amount, source: "contract", unit: ctr.unit ?? null };
  const poste = ctx.posteId ? related.find((a) => a.poste_id === ctx.posteId) : undefined;
  if (poste) return { amount: poste.amount, source: "poste", unit: poste.unit ?? null };
  const site = related.find((a) => a.site_id === ctx.siteId);
  if (site) return { amount: site.amount, source: "site", unit: site.unit ?? null };
  return null;
}

function toLine(
  rubrique: PayrollRubrique,
  source: LineSource,
  unitAmount: number,
  quantity: number,
  amount: number,
  sortOrder: number,
  exceptionId: string | null,
): PayrollLine {
  return {
    rubrique_id: rubrique.id,
    exception_id: exceptionId,
    source_code: source,
    code: rubrique.code,
    label_ar: rubrique.label_ar,
    label_fr: rubrique.label_fr,
    category: rubrique.category,
    nature: rubrique.nature,
    unit: rubrique.unit,
    ...salaryClassFlags(rubrique.category),
    quantity: roundMoney(quantity),
    unit_amount: unitAmount,
    amount,
    sort_order: sortOrder,
  };
}

export function buildPayrollLines(input: {
  employeeId: string;
  siteId: string;
  contractId: string;
  posteId?: string | null;
  baseMonthly: number;
  daysPaid: number;
  daysWorked: number;
  /** From paidMonthFraction: quantity of monthly and percent lines. */
  monthFraction: number;
  year: number;
  month: number;
  rubriques: PayrollRubrique[];
  assignments: PayrollAssignment[];
  exceptions: PayrollException[];
  /** Computed elsewhere (overtime, advances); sorted with the rest. */
  extraLines?: PayrollLine[];
}): PayrollLine[] {
  const lines: PayrollLine[] = [...(input.extraLines ?? [])];
  let sort = 10;
  const ctx = {
    employeeId: input.employeeId,
    siteId: input.siteId,
    contractId: input.contractId,
    posteId: input.posteId ?? null,
  };

  if (input.baseMonthly > 0) {
    const qty = quantityForUnit("month", input.daysPaid, input.daysWorked, input.monthFraction);
    const amount = computeLineAmount({
      unit: "month",
      unitAmount: input.baseMonthly,
      quantity: qty,
      baseMonthly: input.baseMonthly,
      nature: "indemnite",
    });
    lines.push({
      rubrique_id: null,
      exception_id: null,
      source_code: "base",
      code: "BASE",
      label_ar: "الأجر الأساسي",
      label_fr: "Salaire de base",
      category: "1",
      nature: "indemnite",
      unit: "month",
      cotisable: true,
      taxable: true,
      quantity: roundMoney(qty),
      unit_amount: input.baseMonthly,
      amount,
      sort_order: 1,
    });
  }

  const active = input.rubriques.filter((r) => r.is_active);
  for (const rub of active) {
    const picked = resolvePermanentAssignment(rub.id, input.assignments, ctx);
    if (!picked) continue;
    const unit = picked.unit ?? rub.unit;
    const qty = quantityForUnit(unit, input.daysPaid, input.daysWorked, input.monthFraction);
    const amount = computeLineAmount({
      unit,
      unitAmount: picked.amount,
      quantity: qty,
      baseMonthly: input.baseMonthly,
      nature: rub.nature,
    });
    lines.push(toLine({ ...rub, unit }, picked.source, picked.amount, qty, amount, sort, null));
    sort += 10;
  }

  for (const ex of input.exceptions) {
    if (ex.employee_id !== input.employeeId) continue;
    if (!exceptionAppliesToPeriod(ex, input.year, input.month)) continue;
    const rub = active.find((r) => r.id === ex.rubrique_id);
    if (!rub) continue;
    const unit = ex.unit ?? rub.unit;
    const qty = quantityForUnit(unit, input.daysPaid, input.daysWorked, input.monthFraction);
    const amount = computeLineAmount({
      unit,
      unitAmount: ex.amount,
      quantity: qty,
      baseMonthly: input.baseMonthly,
      nature: rub.nature,
    });
    lines.push(toLine({ ...rub, unit }, "exception", ex.amount, qty, amount, sort, ex.id));
    sort += 10;
  }

  return sortBySalaryClass(lines).map((line, index) => ({
    ...line,
    sort_order: (index + 1) * 10,
  }));
}

export function salaryClassRank(row: {
  category: string;
  code: string;
  source_code?: string;
}) {
  if (row.source_code === "base" || row.code === "BASE") return 0;
  const cat = Number(row.category);
  const classPart = cat >= 1 && cat <= 4 ? cat : 9;
  const digits = Number.parseInt(String(row.code).replace(/\D/g, ""), 10);
  const codePart = Number.isFinite(digits) ? digits : 9999;
  return classPart * 10000 + codePart;
}

export function sortBySalaryClass<T extends { category: string; code: string; source_code?: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const diff = salaryClassRank(a) - salaryClassRank(b);
    if (diff !== 0) return diff;
    return a.code.localeCompare(b.code, "fr", { numeric: true });
  });
}

export function summarizeLines(lines: PayrollLine[], rates: LegalPayrollRates): PayrollSummary {
  const grossCotisable = roundMoney(
    lines.filter((l) => l.cotisable).reduce((s, l) => s + l.amount, 0),
  );
  const taxableGross = roundMoney(
    lines.filter((l) => l.taxable).reduce((s, l) => s + l.amount, 0),
  );
  const gains = roundMoney(
    lines.filter((l) => l.nature !== "retenue").reduce((s, l) => s + l.amount, 0),
  );
  const retenues = roundMoney(
    lines.filter((l) => l.nature === "retenue").reduce((s, l) => s + l.amount, 0),
  );
  const baseSs = Math.max(0, grossCotisable);
  const employeeSs = roundMoney(baseSs * rates.cnasEmployee);
  const employerSs = roundMoney(baseSs * (rates.cnasEmployer + rates.cnasFos));
  const cacobatph = rates.appliesCacobatph ? roundMoney(baseSs * rates.cacobatph) : 0;
  const intemperiesEmployee = rates.appliesIntemperies
    ? roundMoney(baseSs * rates.intemperiesEmployee)
    : 0;
  const intemperiesEmployer = rates.appliesIntemperies
    ? roundMoney(baseSs * rates.intemperiesEmployer)
    : 0;
  const irgBase = roundMoney(Math.max(0, taxableGross - employeeSs));
  const irgAmount = roundMoney(Math.max(0, rates.irgAmount));
  const netPayable = roundMoney(
    gains + retenues - employeeSs - intemperiesEmployee - irgAmount,
  );
  return {
    lines,
    days_worked: 0,
    days_paid: 0,
    gross_cotisable: grossCotisable,
    taxable_gross: taxableGross,
    employee_ss: employeeSs,
    employer_ss: employerSs,
    cacobatph,
    intemperies_employee: intemperiesEmployee,
    intemperies_employer: intemperiesEmployer,
    irg_base: irgBase,
    irg_amount: irgAmount,
    net_payable: netPayable,
  };
}

export function payrollLegalWarnings(input: {
  matricule: string;
  nss: string | null | undefined;
  baseMonthly: number;
  snmg: number;
  grossCotisable: number;
}): string[] {
  const who = input.matricule.trim() || "—";
  const warnings: string[] = [];
  if (input.grossCotisable > 0 && !String(input.nss ?? "").trim()) {
    warnings.push(`${who} : NSS manquant pour la déclaration CNAS · رقم الضمان ناقص`);
  }
  if (input.snmg > 0 && input.baseMonthly > 0 && input.baseMonthly < input.snmg) {
    warnings.push(`${who} : salaire de base < SNMG · الأجر الأساسي دون الأجر الوطني الأدنى`);
  }
  return warnings;
}
