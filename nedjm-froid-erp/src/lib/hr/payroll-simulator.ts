import type { BulletinSlipInput } from "@/components/rh/bulletin-print";
import type { AttendanceMovements } from "@/lib/hr/attendance-movements";
import {
  complianceLabels,
  DEFAULT_CNAS_REGIME,
  DEFAULT_IRG_ZONE,
  DISABLED_IRG_CATEGORY,
  type IrgManualOption,
  type ResolvedCompliance,
  type ResolvedIrg,
} from "@/lib/hr/compliance";
import type { IrgBracket, IrgRule } from "@/lib/hr/irg-calc";
import type { PayrollException, SalaryUnit } from "@/lib/hr/payroll-calc";
import { computeSlip, slipEngineRates, type SlipResult } from "@/lib/hr/payroll-slip";
import type { SimRubricLine, SimulatorData } from "@/lib/hr/payroll-simulator-load";
import { overlayRecord } from "@/lib/sim/core";

export type ScenarioRubric = SimRubricLine & { key: string; enabled: boolean };
export type ScenarioException = { id: string; rubrique_id: string; amount: number; unit: SalaryUnit | null; enabled: boolean };

/** Everything the simulator lets the user change. Rates are decimals (0.09 = 9 %). */
export type Scenario = {
  vars: Record<string, number>;
  brackets: IrgBracket[];
  rules: Record<string, IrgRule[]>;
  irg: { option: "AUTO" | IrgManualOption; category: string; zone: string; fixedRate: number };
  cnas: { regime: string; employee: number; employer: number; fos: number };
  caco: { conges: boolean; intemperies: boolean };
  contract: { base: number; netRef: number; startDate: string; endDate: string | null };
  days: { covered: number; paid: number; presence: number; annualLeave: number };
  irgCategory: string;
  rubriques: ScenarioRubric[];
  exceptions: ScenarioException[];
  overtime: Record<string, number>;
  advances: boolean;
  exit: boolean;
  /** Attendance counts printed on the bulletin (defaults to the loaded pointage). */
  movements?: AttendanceMovements;
};

export function calendarDaysOf(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export function periodBounds(year: number, month: number) {
  const mm = String(month).padStart(2, "0");
  const days = calendarDaysOf(year, month);
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(days).padStart(2, "0")}`, days };
}

function regimeRates(data: SimulatorData, vars: Record<string, number>, code: string) {
  const regime = data.regimes.find((r) => r.code === code);
  const legal = (key: string) => Number(vars[key] ?? 0) || 0;
  return {
    employee: regime?.employee_pct != null ? regime.employee_pct / 100 : legal("CNAS_EMPLOYEE"),
    employer: regime?.employer_pct != null ? regime.employer_pct / 100 : legal("CNAS_EMPLOYER_BASE"),
    fos: regime?.fos_pct != null ? regime.fos_pct / 100 : legal("CNAS_FOS"),
  };
}

export function cnasForRegime(data: SimulatorData, vars: Record<string, number>, code: string): Scenario["cnas"] {
  return { regime: code, ...regimeRates(data, vars, code) };
}

let keySeq = 0;
export function newRubricKey() {
  keySeq += 1;
  return `r${keySeq}`;
}

export function initialScenario(data: SimulatorData): Scenario {
  const s = data.subject;
  const vars = { ...data.legal_vars };
  const { start, days } = periodBounds(data.year, data.month);
  if (!s) {
    return {
      vars,
      brackets: data.brackets.map((b) => ({ ...b })),
      rules: structuredClone(data.rules_by_category),
      irg: { option: "AUTO", category: "STANDARD", zone: DEFAULT_IRG_ZONE, fixedRate: 0.1 },
      cnas: cnasForRegime(data, vars, DEFAULT_CNAS_REGIME),
      caco: { conges: false, intemperies: false },
      contract: { base: Number(vars.SNMG ?? 0) || 0, netRef: 0, startDate: start, endDate: null },
      days: { covered: days, paid: days, presence: days, annualLeave: 0 },
      irgCategory: "STANDARD",
      rubriques: [],
      exceptions: [],
      overtime: {},
      advances: false,
      exit: false,
    };
  }
  const c = s.compliance;
  return {
    vars,
    brackets: data.brackets.map((b) => ({ ...b })),
    rules: structuredClone(data.rules_by_category),
    irg: {
      option: c.irg.option,
      category: c.irg.category,
      zone: c.irg.zone_code ?? s.site_zone.code,
      fixedRate: c.irg.fixed_rate ?? 0.1,
    },
    cnas: { regime: c.cnas.regime_code, employee: c.cnas.employee, employer: c.cnas.employer, fos: c.cnas.fos },
    caco: { conges: c.cacobatph.conges, intemperies: c.cacobatph.intemperies },
    contract: {
      base: s.salary.base,
      netRef: s.salary.net,
      startDate: s.contract.start_date,
      endDate: s.contract.end_date,
    },
    days: {
      covered: s.covered_days,
      paid: s.movements.days_paid,
      presence: s.movements.days_presence_qty,
      annualLeave: s.annual_leave_days,
    },
    irgCategory: s.employee.irg_category,
    rubriques: s.rubric_lines.map((r) => ({ ...r, key: newRubricKey(), enabled: true })),
    exceptions: s.exceptions.map((e) => ({ ...e, enabled: true })),
    overtime: { ...s.overtime_hours },
    advances: s.advances.length > 0,
    exit: s.exit_lines != null,
  };
}

function zoneRate(data: SimulatorData, vars: Record<string, number>, code: string | null) {
  const zone = code ? data.zones.find((z) => z.code === code) : undefined;
  const raw = zone?.rate_var_key ? Number(vars[zone.rate_var_key] ?? 0) : 0;
  return {
    rate: Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0,
    applies_to: zone?.applies_to ?? ("TAX" as const),
  };
}

/** Same shapes as resolveCompliance, built from the scenario choices. */
export function scenarioCompliance(data: SimulatorData, s: Scenario): ResolvedCompliance {
  const base: ResolvedIrg = {
    mode: "MANUAL",
    option: s.irg.option,
    category: "STANDARD",
    zone_code: null,
    zone_rate: 0,
    zone_applies_to: "TAX",
    fixed_rate: null,
  };
  let irg: ResolvedIrg;
  if (s.irg.option === "AUTO" || s.irg.option === "ZONE") {
    const z = zoneRate(data, s.vars, s.irg.zone);
    irg = {
      ...base,
      mode: s.irg.option === "AUTO" ? "AUTO" : "MANUAL",
      category: s.irgCategory,
      zone_code: s.irg.zone,
      zone_rate: z.rate,
      zone_applies_to: z.applies_to,
    };
  } else if (s.irg.option === "HANDICAP") {
    irg = { ...base, category: DISABLED_IRG_CATEGORY };
  } else if (s.irg.option === "FIXED_RATE") {
    irg = { ...base, fixed_rate: s.irg.fixedRate > 0 && s.irg.fixedRate < 1 ? s.irg.fixedRate : 0.1 };
  } else {
    irg = base;
  }
  const initial = data.subject?.compliance;
  return {
    irg,
    cnas: {
      mode: initial?.cnas.mode ?? "AUTO",
      regime_code: s.cnas.regime,
      employee: s.cnas.employee,
      employer: s.cnas.employer,
      fos: s.cnas.fos,
    },
    cacobatph: { mode: initial?.cacobatph.mode ?? "AUTO", ...s.caco },
    override_ids: initial?.override_ids ?? [],
  };
}

const SIM_IDS = { employee: "sim-employee", contract: "sim-contract", site: "sim-site" };

export type ScenarioOutput = {
  slip: SlipResult;
  compliance: ResolvedCompliance;
  bulletin: BulletinSlipInput;
  /** Legal variables as printed on the bulletin (CNAS rates of the regime folded in). */
  bulletinVars: Record<string, number>;
};

export function runScenario(data: SimulatorData, s: Scenario): ScenarioOutput {
  const subject = data.subject;
  const compliance = scenarioCompliance(data, s);
  const employeeId = subject?.employee.id ?? SIM_IDS.employee;
  const contractId = subject?.contract.id ?? SIM_IDS.contract;
  const siteId = subject?.contract.site_id ?? SIM_IDS.site;
  const posteId = subject?.contract.poste_id ?? null;
  const rubriqueIds = new Set(data.rubriques.map((r) => r.id));
  const exceptions: PayrollException[] = s.exceptions
    .filter((e) => e.enabled)
    .map((e) => ({
      id: e.id,
      employee_id: employeeId,
      rubrique_id: e.rubrique_id,
      amount: e.amount,
      unit: e.unit,
      period_year: data.year,
      period_month: data.month,
      duration_mode: "once",
      until_year: null,
      until_month: null,
      status_code: "APPROVED",
      is_active: true,
    }));

  const slip = computeSlip({
    year: data.year,
    month: data.month,
    engine: {
      ...slipEngineRates(s.vars),
      contributionDefs: data.contribution_defs,
      legalVars: s.vars,
      irg: { brackets: s.brackets, rulesByCategory: s.rules },
      rubriques: data.rubriques,
      assignments: s.rubriques
        .filter((r) => r.enabled && rubriqueIds.has(r.rubrique_id))
        .map((r) => ({
          rubrique_id: r.rubrique_id,
          employee_id: r.source === "employee" || r.source === "added" ? employeeId : null,
          site_id: r.source === "site" ? siteId : null,
          contract_id: r.source === "contract" ? contractId : null,
          poste_id: r.source === "poste" ? posteId : null,
          amount: r.amount,
          unit: r.unit,
          is_active: true,
        })),
      exceptions,
      grid: data.grid,
    },
    subject: {
      contract: {
        id: contractId,
        employee_id: employeeId,
        site_id: siteId,
        poste_id: posteId,
        grade: subject?.contract.grade ?? null,
      },
      employee: { matricule: subject?.employee.matricule ?? "SIMULATION", nss: subject?.employee.nss ?? null },
      coveredDays: s.days.covered,
      contractCount: subject?.contract_count ?? 1,
      daysPaid: s.days.paid,
      daysPresence: s.days.presence,
      annualLeaveDays: s.days.annualLeave,
      salary: { base: s.contract.base, net: s.contract.netRef },
      compliance,
      overtimeHours: s.overtime,
      exitLines: s.exit ? (subject?.exit_lines ?? null) : null,
      advances: s.advances ? (subject?.advances ?? []) : [],
      deductedElsewhere: new Map(Object.entries(subject?.deducted_elsewhere ?? {})),
    },
  });

  const bulletinVars = overlayRecord(s.vars, {
    CNAS_EMPLOYEE: compliance.cnas.employee,
    CNAS_EMPLOYER_BASE: compliance.cnas.employer,
    CNAS_FOS: compliance.cnas.fos,
  });
  const sum = slip.summary;
  const mov = s.movements ?? subject?.movements;
  const bulletin: BulletinSlipInput = {
    employee_name: subject?.employee.name ?? "Simulation",
    poste_fr: subject?.contract.poste_fr ?? null,
    site_name: subject?.contract.site_name ?? null,
    hired_at: subject?.employee.hired_at ?? null,
    birth_date: subject?.employee.birth_date ?? null,
    marital_code: subject?.employee.marital_code ?? null,
    address_fr: subject?.employee.address_fr ?? null,
    commune: subject?.employee.commune ?? null,
    nss: subject?.employee.nss ?? null,
    qualification_code: subject?.contract.qualification_code ?? null,
    matricule: subject?.employee.matricule ?? "SIM",
    period_year: data.year,
    period_month: data.month,
    days_worked: mov?.days_worked ?? slip.days_presence,
    days_paid: slip.days_paid,
    days_leave: mov?.days_leave ?? 0,
    days_absence: mov?.days_absence ?? 0,
    days_weekend: mov?.days_weekend ?? 0,
    days_abandon: mov?.days_abandon ?? 0,
    days_rappel: mov?.days_rappel ?? 0,
    gross_amount: sum.gross_cotisable,
    employee_ss: sum.employee_ss,
    employer_ss: sum.employer_ss,
    cacobatph: sum.cacobatph,
    intemperies_employee: sum.intemperies_employee,
    intemperies_employer: sum.intemperies_employer,
    extra_employee: sum.extra_employee,
    extra_employer: sum.extra_employer,
    extra_contributions: sum.extra_contributions,
    irg_base: sum.irg_base,
    irg_amount: sum.irg_amount,
    net_payable: sum.net_payable,
    payment_mode_code: subject?.employee.payment_mode_code ?? null,
    account_no: subject?.employee.account_no ?? null,
    compliance: { labels: complianceLabels(compliance, data.zones, data.regimes), irg: compliance.irg },
    lines: slip.lines,
  };
  return { slip, compliance, bulletin, bulletinVars };
}

/** Key figures shown above the payslip and compared with the reference. */
export function scenarioFigures(out: ScenarioOutput) {
  const s = out.slip.summary;
  const chargesEmployee = s.employee_ss + s.intemperies_employee + s.extra_employee;
  const chargesEmployer = s.employer_ss + s.cacobatph + s.intemperies_employer + s.extra_employer;
  return {
    gross: s.gross_cotisable,
    taxable: s.taxable_gross,
    cnas: s.employee_ss,
    irgBase: s.irg_base,
    irg: s.irg_amount,
    net: s.net_payable,
    cost: s.net_payable + chargesEmployee + chargesEmployer,
  };
}

export type ScenarioFigures = ReturnType<typeof scenarioFigures>;
