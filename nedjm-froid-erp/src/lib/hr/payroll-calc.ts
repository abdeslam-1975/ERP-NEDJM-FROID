export type SalaryCategory = "1" | "2" | "3" | "4";
export type SalaryUnit = "day" | "month" | "percent" | "presence_day";
export type SalaryNature =
  | "indemnite"
  | "prime"
  | "rappel"
  | "remboursement"
  | "retenue";
export type LineSource = "base" | "site" | "contract" | "employee" | "exception";

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
  amount: number;
  unit?: SalaryUnit | null;
  is_active: boolean;
};

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
  source_code: LineSource;
  code: string;
  label_ar: string;
  label_fr: string;
  category: SalaryCategory;
  nature: SalaryNature;
  unit: SalaryUnit;
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

export function quantityForUnit(
  unit: SalaryUnit,
  daysPaid: number,
  daysWorked: number,
  divisor: number,
) {
  const den = divisor > 0 ? divisor : 30;
  if (unit === "day") return daysPaid;
  if (unit === "presence_day") return daysWorked;
  return daysPaid / den;
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
  ctx: { employeeId: string; siteId: string; contractId: string },
): { amount: number; source: Exclude<LineSource, "base" | "exception">; unit: SalaryUnit | null } | null {
  const related = assignments.filter(
    (a) => a.rubrique_id === rubriqueId && a.is_active,
  );
  const emp = related.find((a) => a.employee_id === ctx.employeeId);
  if (emp) return { amount: emp.amount, source: "employee", unit: emp.unit ?? null };
  const ctr = related.find((a) => a.contract_id === ctx.contractId);
  if (ctr) return { amount: ctr.amount, source: "contract", unit: ctr.unit ?? null };
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
  baseMonthly: number;
  daysPaid: number;
  daysWorked: number;
  divisor: number;
  year: number;
  month: number;
  rubriques: PayrollRubrique[];
  assignments: PayrollAssignment[];
  exceptions: PayrollException[];
}): PayrollLine[] {
  const lines: PayrollLine[] = [];
  let sort = 10;
  const ctx = {
    employeeId: input.employeeId,
    siteId: input.siteId,
    contractId: input.contractId,
  };

  if (input.baseMonthly > 0) {
    const qty = quantityForUnit("month", input.daysPaid, input.daysWorked, input.divisor);
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
    const qty = quantityForUnit(unit, input.daysPaid, input.daysWorked, input.divisor);
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
    const qty = quantityForUnit(unit, input.daysPaid, input.daysWorked, input.divisor);
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
