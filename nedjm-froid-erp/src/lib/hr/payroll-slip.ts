import {
  advanceDeductionLines,
  buildPayrollLines,
  exitSettlementLines,
  gridAsOf,
  overtimeLines,
  paidMonthFraction,
  payrollLegalWarnings,
  sortBySalaryClass,
  summarizeLines,
  type LegalPayrollRates,
  type OvertimeSpec,
  type PayrollAdvance,
  type PayrollAssignment,
  type PayrollException,
  type PayrollLine,
  type PayrollRubrique,
  type PayrollSummary,
  type SalaryGridRow,
} from "@/lib/hr/payroll-calc";
import { computeResolvedIrg, type ResolvedCompliance } from "@/lib/hr/compliance";
import { contributionRatesFor, type ContributionDef } from "@/lib/hr/contributions";
import type { IrgBracket, IrgRule } from "@/lib/hr/irg-calc";
import type { SettlementLine } from "@/lib/hr/leave";
import { OVERTIME_COLUMNS } from "@/lib/hr/attendance-columns";

/** Period-wide inputs shared by every slip of a run. */
export type SlipEngine = {
  divisor: number;
  snmg: number;
  monthlyHours: number;
  overtimeSpecs: OvertimeSpec[];
  cacobatphRate: number;
  intemperiesEmployeeRate: number;
  intemperiesEmployerRate: number;
  contributionDefs: readonly ContributionDef[];
  legalVars: Readonly<Record<string, number>>;
  irg: { brackets: IrgBracket[]; rulesByCategory: Record<string, IrgRule[]> };
  rubriques: PayrollRubrique[];
  assignments: PayrollAssignment[];
  exceptions: PayrollException[];
  grid: SalaryGridRow[];
};

export type SlipEngineRates = Pick<
  SlipEngine,
  | "divisor"
  | "snmg"
  | "monthlyHours"
  | "overtimeSpecs"
  | "cacobatphRate"
  | "intemperiesEmployeeRate"
  | "intemperiesEmployerRate"
>;

/** Engine rates read from the legal variables of the period (decimal values). */
export function slipEngineRates(legalVars: Readonly<Record<string, number>>): SlipEngineRates {
  const legalVar = (key: string) => {
    const n = Number(legalVars[key]);
    return Number.isFinite(n) ? n : 0;
  };
  const divisor = legalVar("NJM_DIVISEUR_FIXED");
  return {
    divisor: divisor > 0 ? divisor : 30,
    snmg: legalVar("SNMG"),
    monthlyHours: legalVar("HEURES_MENSUELLES") || 173.33,
    overtimeSpecs: OVERTIME_COLUMNS.map((c) => {
      const rate = legalVars[c.rateKey] == null ? c.defaultRate : legalVar(c.rateKey);
      const pct = Math.round(rate * 100);
      return {
        code: c.code,
        rate,
        label_fr: `Heures supplémentaires ${pct} %`,
        label_ar: `ساعات إضافية ${pct}%`,
      };
    }),
    cacobatphRate: legalVar("CACOBATPH_CONGES"),
    intemperiesEmployeeRate: legalVar("CACOBATPH_INTEMPERIES_SAL"),
    intemperiesEmployerRate: legalVar("CACOBATPH_INTEMPERIES_EMP"),
  };
}

/** One employee's principal contract for the period, with its attendance and regimes. */
export type SlipSubject = {
  contract: {
    id: string;
    employee_id: string;
    site_id: string;
    poste_id: string | null;
    grade: string | null;
  };
  employee: { matricule: string; nss: string | null };
  coveredDays: number;
  contractCount: number;
  /** Paid days from attendance, before removing the leave paid by the CACOBATPH fund. */
  daysPaid: number;
  daysPresence: number;
  /** Récupération days (paid by the base and the CRP rubriques only). */
  daysCrp?: number;
  /** Part of daysPresence that is récupération, removed from the worked days. */
  daysCrpPresence?: number;
  annualLeaveDays: number;
  salary: { base: number; net: number };
  compliance: ResolvedCompliance;
  overtimeHours: Record<string, number>;
  /** Validated exit of the month (null = no exit). */
  exitLines: SettlementLine[] | null;
  advances: PayrollAdvance[];
  deductedElsewhere: ReadonlyMap<string, number>;
};

export type SlipResult = {
  lines: PayrollLine[];
  summary: PayrollSummary;
  days_paid: number;
  days_presence: number;
  month_fraction: number;
  legal: LegalPayrollRates;
  warnings: string[];
};

/** Full computation of one payslip, shared by the payroll run and the simulator. */
export function computeSlip(input: {
  year: number;
  month: number;
  engine: SlipEngine;
  subject: SlipSubject;
}): SlipResult {
  const { year, month, engine, subject } = input;
  const mm = String(month).padStart(2, "0");
  const calendarDays = new Date(year, month, 0).getDate();
  const end = `${year}-${mm}-${String(calendarDays).padStart(2, "0")}`;
  const who = subject.employee.matricule || "—";
  const resolved = subject.compliance;
  const warnings: string[] = [];

  const fundLeave = resolved.cacobatph.conges ? subject.annualLeaveDays : 0;
  if (fundLeave > 0) {
    warnings.push(
      `${who} : ${fundLeave} j de congé annuel payés par la CACOBATPH, exclus du bulletin · أيام العطلة يدفعها الصندوق`,
    );
  }
  const paid = Math.min(Math.max(0, subject.daysPaid - fundLeave), subject.coveredDays);
  const worked = Math.min(
    Math.max(0, subject.daysPresence - (subject.daysCrpPresence ?? 0)),
    subject.coveredDays,
  );
  const daysCrp = Math.min(Math.max(0, subject.daysCrp ?? 0), subject.coveredDays);
  const monthFraction = paidMonthFraction({
    daysPaid: paid,
    coveredDays: subject.coveredDays,
    calendarDays,
    divisor: engine.divisor,
  });
  if (subject.contractCount > 1) {
    warnings.push(
      `${who} : ${subject.contractCount} contrats principaux ce mois, bulletin sur le plus récent · عقدان رئيسيان في نفس الشهر`,
    );
  }
  if (subject.daysPaid > subject.coveredDays) {
    warnings.push(
      `${who} : ${subject.daysPaid} jours pointés > ${subject.coveredDays} jours de contrat, plafonnés · أيام الحضور تتجاوز مدة العقد`,
    );
  }
  const salary = subject.salary;
  const gridRow = gridAsOf(engine.grid, subject.contract.poste_id, subject.contract.grade, end);
  if (gridRow && salary.base > 0 && salary.base < gridRow.base_monthly) {
    warnings.push(
      `${who} : salaire de base ${salary.base.toFixed(2)} < grille ${gridRow.base_monthly.toFixed(2)} (grade ${gridRow.grade}) · الأجر أقل من الشبكة`,
    );
  }

  let lines = buildPayrollLines({
    employeeId: subject.contract.employee_id,
    siteId: subject.contract.site_id,
    contractId: subject.contract.id,
    posteId: subject.contract.poste_id,
    baseMonthly: salary.base,
    daysPaid: paid,
    daysWorked: worked,
    daysCrp,
    monthFraction,
    year,
    month,
    rubriques: engine.rubriques,
    assignments: engine.assignments,
    exceptions: engine.exceptions,
    extraLines: [
      ...overtimeLines({
        hours: subject.overtimeHours,
        baseMonthly: salary.base,
        monthlyHours: engine.monthlyHours,
        specs: engine.overtimeSpecs,
      }),
      ...exitSettlementLines(subject.exitLines ?? []),
    ],
  });
  const legal: Omit<LegalPayrollRates, "irgAmount"> = {
    cnasEmployee: resolved.cnas.employee,
    cnasEmployer: resolved.cnas.employer,
    cnasFos: resolved.cnas.fos,
    cacobatph: engine.cacobatphRate,
    intemperiesEmployee: engine.intemperiesEmployeeRate,
    intemperiesEmployer: engine.intemperiesEmployerRate,
    appliesCacobatph: resolved.cacobatph.conges,
    appliesIntemperies: resolved.cacobatph.intemperies,
    extraContributions: contributionRatesFor({
      defs: engine.contributionDefs,
      vars: engine.legalVars,
      cacobatph: resolved.cacobatph,
    }),
  };
  const pre = summarizeLines(lines, { ...legal, irgAmount: 0 });
  const irgAmount = computeResolvedIrg({
    irgBase: pre.irg_base,
    irg: resolved.irg,
    brackets: engine.irg.brackets,
    rulesByCategory: engine.irg.rulesByCategory,
  });
  let summary = summarizeLines(lines, { ...legal, irgAmount });
  const advance = advanceDeductionLines({
    advances: subject.advances,
    deductedElsewhere: subject.deductedElsewhere,
    employeeId: subject.contract.employee_id,
    year,
    month,
    availableNet: summary.net_payable,
    settleAll: subject.exitLines != null,
  });
  if (advance.lines.length) {
    lines = sortBySalaryClass([...lines, ...advance.lines]).map((line, index) => ({
      ...line,
      sort_order: (index + 1) * 10,
    }));
    summary = summarizeLines(lines, { ...legal, irgAmount });
  }
  if (advance.capped) {
    warnings.push(`${who} : retenue d'avance réduite pour garder un net ≥ 0 · اقتطاع التسبيق مخفّض`);
  }
  warnings.push(
    ...payrollLegalWarnings({
      matricule: subject.employee.matricule,
      nss: subject.employee.nss,
      baseMonthly: salary.base,
      snmg: engine.snmg,
      grossCotisable: summary.gross_cotisable,
    }),
  );

  return {
    lines,
    summary,
    days_paid: paid,
    days_presence: worked,
    month_fraction: monthFraction,
    legal: { ...legal, irgAmount },
    warnings,
  };
}
