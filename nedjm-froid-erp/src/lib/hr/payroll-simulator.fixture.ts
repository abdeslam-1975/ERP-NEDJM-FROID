import { emptyMovements } from "@/lib/hr/attendance-movements";
import { resolveCompliance } from "@/lib/hr/compliance";
import { resolvePermanentAssignment, type PayrollAssignment, type PayrollRubrique } from "@/lib/hr/payroll-calc";
import type { SimAttendanceCell, SimulatorData } from "@/lib/hr/payroll-simulator-load";

/** Test fixture: one employee, September 2026, three rubriques. */
const rub = (id: string, code: string, category: PayrollRubrique["category"], unit: PayrollRubrique["unit"]): PayrollRubrique => ({
  id,
  code,
  label_ar: code,
  label_fr: code,
  nature: category === "5" ? "retenue" : "prime",
  unit,
  category,
  cotisable: category === "1" || category === "2",
  taxable: category === "1" || category === "3",
  is_active: true,
});

export const rubriques = [
  rub("r1", "101", "1", "month"),
  rub("r2", "401", "4", "day"),
  rub("r3", "501", "5", "month"),
  rub("r4", "102", "1", "month"),
];
export const assignments: PayrollAssignment[] = [
  { rubrique_id: "r1", employee_id: null, site_id: "s1", contract_id: null, amount: 5000, is_active: true },
  { rubrique_id: "r2", employee_id: null, site_id: null, contract_id: "c1", amount: 200, is_active: true },
  { rubrique_id: "r3", employee_id: "e1", site_id: null, contract_id: null, amount: 1000, is_active: true },
];
export const vars = {
  CNAS_EMPLOYEE: 0.09,
  CNAS_EMPLOYER_BASE: 0.25,
  CNAS_FOS: 0.005,
  SNMG: 20000,
  CACOBATPH_CONGES: 0.1225,
  CACOBATPH_INTEMPERIES_SAL: 0.00375,
  CACOBATPH_INTEMPERIES_EMP: 0.00375,
  CONGE_JOURS_MOIS: 2.5,
};
export const brackets = [
  { min_annual: 0, max_annual: 240000, rate: 0 },
  { min_annual: 240001, max_annual: 480000, rate: 0.23 },
  { min_annual: 480001, max_annual: 960000, rate: 0.27 },
  { min_annual: 960001, max_annual: null, rate: 0.3 },
];
export const rules = {
  STANDARD: [
    { kind: "EXEMPTION_THRESHOLD", params: { monthly_max: 30000 }, formula: null },
    { kind: "ABATEMENT_ON_TAX", params: { rate: 0.4, min_monthly: 1000, max_monthly: 1500 }, formula: null },
  ],
};
export const zones = [{ code: "NORMAL", label_fr: "Normal", label_ar: "", rate_var_key: null, applies_to: "TAX" as const }];
export const regimes = [
  { code: "STANDARD", label_fr: "Standard", label_ar: "", employee_pct: null, employer_pct: null, fos_pct: null },
  { code: "REDUIT", label_fr: "Réduit", label_ar: "", employee_pct: 5, employer_pct: 10, fos_pct: 0 },
];
export const legends = [
  { code: "P", label_fr: "Présent", coefficient: 1, counts_as_presence: true },
  { code: "W", label_fr: "Week-end", coefficient: 1, counts_as_presence: false },
  { code: "AN", label_fr: "Absence non justifiée", coefficient: 0, counts_as_presence: false },
];

export const compliance = resolveCompliance({
  overrides: [],
  periodStart: "2026-09-01",
  periodEnd: "2026-09-30",
  employeeIrgCategory: "STANDARD",
  socialProfileCode: null,
  siteZoneCode: "NORMAL",
  activity: { cacobatph: true, intemperies: true },
  vars,
  zones,
  regimes,
});

/** 26 days « P » and 4 Fridays « W » (30 paid days, 26 worked). */
export const attendance: SimAttendanceCell[] = Array.from({ length: 30 }, (_, i) => {
  const date = `2026-09-${String(i + 1).padStart(2, "0")}`;
  const friday = new Date(`${date}T00:00:00Z`).getUTCDay() === 5;
  return { work_date: date, legend_code: friday ? "W" : "P", site_id: "s1" };
});

export const movements = { ...emptyMovements(), days_worked: 26, days_presence_qty: 26, days_paid: 30, days_weekend: 4 };

export function simData(withAttendance = false): SimulatorData {
  const ctx = { employeeId: "e1", siteId: "s1", contractId: "c1", posteId: null };
  return {
    year: 2026,
    month: 9,
    legal_vars: vars,
    brackets,
    rules_by_category: rules,
    contribution_defs: [],
    rubriques,
    grid: [],
    zones,
    regimes,
    legends,
    employees: [],
    notice: null,
    subject: {
      employee: {
        id: "e1",
        matricule: "M001",
        name: "TEST Salarié",
        nss: "123",
        irg_category: "STANDARD",
        birth_date: null,
        hired_at: null,
        marital_code: null,
        address_fr: null,
        commune: null,
        payment_mode_code: null,
        account_no: null,
      },
      contract: {
        id: "c1",
        site_id: "s1",
        site_name: "Site",
        poste_id: null,
        poste_fr: null,
        grade: null,
        qualification_code: null,
        start_date: "2025-01-01",
        end_date: null,
        status: "ACTIVE",
        salaire_base_monthly: 60000,
        salaire_net_ref_monthly: 55000,
        salaire_net_recup_monthly: null,
      },
      contract_fields: [],
      contract_payable: true,
      covered_days: 30,
      contract_count: 1,
      attendance_days: withAttendance ? attendance : [],
      movements,
      annual_leave_days: 0,
      salary: { base: 60000, net: 55000 },
      salary_versions: [],
      site_zone: { code: "NORMAL", source: "default" },
      social_profile_code: null,
      activity: { label: "BTP", cacobatph: true, intemperies: true },
      compliance,
      overrides: [],
      rubric_lines: rubriques.flatMap((r) => {
        const picked = resolvePermanentAssignment(r.id, assignments, ctx);
        return picked ? [{ rubrique_id: r.id, amount: picked.amount, unit: picked.unit ?? r.unit, source: picked.source }] : [];
      }),
      exceptions: [],
      overtime_hours: { HS50: 4 },
      exit_lines: null,
      advances: [],
      deducted_elsewhere: {},
      stored_slip: null,
    },
  };
}
