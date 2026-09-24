import { describe, expect, it } from "vitest";
import {
  buildPayrollLines,
  computeLineAmount,
  contractCoversPeriod,
  exceptionAppliesToPeriod,
  payrollLegalWarnings,
  quantityForUnit,
  resolvePermanentAssignment,
  summarizeLines,
  type PayrollAssignment,
  type PayrollException,
  type PayrollRubrique,
} from "@/lib/hr/payroll-calc";

const panier: PayrollRubrique = {
  id: "r-302",
  code: "302",
  label_ar: "وجبة العامل",
  label_fr: "Prime de panier",
  nature: "prime",
  unit: "day",
  category: "3",
  cotisable: false,
  taxable: true,
  is_active: true,
};

const hygiene: PayrollRubrique = {
  id: "r-303",
  code: "303",
  label_ar: "مستلزمات النظافة",
  label_fr: "Salissure",
  nature: "indemnite",
  unit: "month",
  category: "3",
  cotisable: false,
  taxable: true,
  is_active: true,
};

const bonus: PayrollRubrique = {
  id: "r-111",
  code: "111",
  label_ar: "منحة المردود الفردي",
  label_fr: "Prime de rendement",
  nature: "prime",
  unit: "month",
  category: "1",
  cotisable: true,
  taxable: true,
  is_active: true,
};

describe("payroll calc", () => {
  it("computes day and month quantities from attendance", () => {
    expect(quantityForUnit("day", 22, 20, 30)).toBe(22);
    expect(quantityForUnit("presence_day", 22, 20, 30)).toBe(20);
    expect(quantityForUnit("month", 15, 15, 30)).toBe(0.5);
    expect(computeLineAmount({
      unit: "day",
      unitAmount: 400,
      quantity: 22,
      baseMonthly: 40000,
      nature: "prime",
    })).toBe(8800);
    expect(computeLineAmount({
      unit: "percent",
      unitAmount: 10,
      quantity: 0.5,
      baseMonthly: 40000,
      nature: "prime",
    })).toBe(2000);
  });

  it("lets assignment unit override the dictionary unit", () => {
    const lines = buildPayrollLines({
      employeeId: "e1",
      siteId: "s1",
      contractId: "c1",
      baseMonthly: 40000,
      daysPaid: 15,
      daysWorked: 15,
      divisor: 30,
      year: 2026,
      month: 9,
      rubriques: [hygiene],
      assignments: [
        {
          rubrique_id: "r-303",
          employee_id: null,
          site_id: null,
          contract_id: "c1",
          amount: 10,
          unit: "percent",
          is_active: true,
        },
      ],
      exceptions: [],
    });
    const row = lines.find((l) => l.code === "303");
    expect(row?.unit).toBe("percent");
    expect(row?.amount).toBe(2000);
  });

  it("keeps a contract in payroll while it covers the month, including open-ended", () => {
    expect(contractCoversPeriod("2026-09-01", null, "2026-09-01", "2026-09-30")).toBe(true);
    expect(contractCoversPeriod("2026-08-01", "2026-08-31", "2026-09-01", "2026-09-30")).toBe(false);
    expect(contractCoversPeriod("2026-09-15", null, "2026-09-01", "2026-09-30")).toBe(true);
  });

  it("orders lines by salary class 1 then 2 then 3 then 4", () => {
    const class2: PayrollRubrique = { ...hygiene, id: "r-201", code: "201", category: "2" };
    const class1: PayrollRubrique = { ...hygiene, id: "r-111", code: "111", category: "1" };
    const class4: PayrollRubrique = { ...hygiene, id: "r-400", code: "400", category: "4" };
    const asg: PayrollAssignment[] = [
      { rubrique_id: "r-201", employee_id: null, site_id: null, contract_id: "c1", amount: 1, is_active: true },
      { rubrique_id: "r-400", employee_id: null, site_id: null, contract_id: "c1", amount: 1, is_active: true },
      { rubrique_id: "r-111", employee_id: null, site_id: null, contract_id: "c1", amount: 1, is_active: true },
      { rubrique_id: "r-302", employee_id: null, site_id: null, contract_id: "c1", amount: 1, is_active: true },
    ];
    const lines = buildPayrollLines({
      employeeId: "e1",
      siteId: "s1",
      contractId: "c1",
      baseMonthly: 40000,
      daysPaid: 30,
      daysWorked: 26,
      divisor: 30,
      year: 2026,
      month: 9,
      rubriques: [panier, class2, class4, class1],
      assignments: asg,
      exceptions: [],
    });
    const codes = lines.map((l) => l.code);
    expect(codes[0]).toBe("BASE");
    expect(codes.indexOf("111")).toBeLessThan(codes.indexOf("201"));
    expect(codes.indexOf("201")).toBeLessThan(codes.indexOf("302"));
    expect(codes.indexOf("302")).toBeLessThan(codes.indexOf("400"));
  });

  it("lets employee override contract override site", () => {
    const asg: PayrollAssignment[] = [
      { rubrique_id: "r-303", employee_id: null, site_id: "s1", contract_id: null, amount: 1000, is_active: true },
      { rubrique_id: "r-303", employee_id: null, site_id: null, contract_id: "c1", amount: 1500, is_active: true },
      { rubrique_id: "r-303", employee_id: "e1", site_id: null, contract_id: null, amount: 1800, is_active: true },
    ];
    expect(
      resolvePermanentAssignment("r-303", asg, { employeeId: "e1", siteId: "s1", contractId: "c1" })?.amount,
    ).toBe(1800);
    expect(
      resolvePermanentAssignment("r-303", asg, { employeeId: "e2", siteId: "s1", contractId: "c1" })?.source,
    ).toBe("contract");
    expect(
      resolvePermanentAssignment("r-303", asg, { employeeId: "e2", siteId: "s1", contractId: "c2" })?.source,
    ).toBe("site");
  });

  it("adds approved exceptions without replacing site/contract lines", () => {
    const asg: PayrollAssignment[] = [
      { rubrique_id: "r-302", employee_id: null, site_id: "s1", contract_id: null, amount: 400, is_active: true },
    ];
    const exceptions: PayrollException[] = [
      {
        id: "x1",
        employee_id: "e1",
        rubrique_id: "r-111",
        amount: 5000,
        period_year: 2026,
        period_month: 9,
        duration_mode: "once",
        until_year: null,
        until_month: null,
        status_code: "APPROVED",
        is_active: true,
      },
    ];
    const lines = buildPayrollLines({
      employeeId: "e1",
      siteId: "s1",
      contractId: "c1",
      baseMonthly: 30000,
      daysPaid: 30,
      daysWorked: 26,
      divisor: 30,
      year: 2026,
      month: 9,
      rubriques: [panier, hygiene, bonus],
      assignments: asg,
      exceptions,
    });
    expect(lines.some((l) => l.code === "BASE" && l.amount === 30000)).toBe(true);
    expect(lines.some((l) => l.code === "302" && l.source_code === "site" && l.amount === 12000)).toBe(true);
    expect(lines.some((l) => l.code === "111" && l.source_code === "exception" && l.amount === 5000)).toBe(true);
  });

  it("rejects draft exceptions and out-of-range until", () => {
    const draft: PayrollException = {
      id: "x",
      employee_id: "e1",
      rubrique_id: "r-111",
      amount: 1,
      period_year: 2026,
      period_month: 1,
      duration_mode: "until",
      until_year: 2026,
      until_month: 3,
      status_code: "DRAFT",
      is_active: true,
    };
    expect(exceptionAppliesToPeriod(draft, 2026, 2)).toBe(false);
    expect(exceptionAppliesToPeriod({ ...draft, status_code: "APPROVED" }, 2026, 2)).toBe(true);
    expect(exceptionAppliesToPeriod({ ...draft, status_code: "APPROVED" }, 2026, 4)).toBe(false);
  });

  it("splits CNAS / IRG bases by category flags", () => {
    const lines = buildPayrollLines({
      employeeId: "e1",
      siteId: "s1",
      contractId: "c1",
      baseMonthly: 40000,
      daysPaid: 30,
      daysWorked: 26,
      divisor: 30,
      year: 2026,
      month: 9,
      rubriques: [panier],
      assignments: [
        { rubrique_id: "r-302", employee_id: null, site_id: "s1", contract_id: null, amount: 300, is_active: true },
      ],
      exceptions: [],
    });
    const sum = summarizeLines(lines, {
      cnasEmployee: 0.09,
      cnasEmployer: 0.25,
      cnasFos: 0.005,
      cacobatph: 0.1221,
      intemperiesEmployee: 0.00375,
      intemperiesEmployer: 0.00375,
      appliesCacobatph: true,
      appliesIntemperies: false,
      irgAmount: 1000,
    });
    expect(sum.gross_cotisable).toBe(40000);
    expect(sum.taxable_gross).toBe(49000);
    expect(sum.employee_ss).toBe(3600);
    expect(sum.irg_base).toBe(45400);
    expect(sum.net_payable).toBe(44400);
    expect(sum.cacobatph).toBe(4884);
    expect(sum.intemperies_employee).toBe(0);
  });

  it("applies CACOBATPH intempéries on the CNAS base when the activity is flagged", () => {
    const lines = buildPayrollLines({
      employeeId: "e1",
      siteId: "s1",
      contractId: "c1",
      baseMonthly: 40000,
      daysPaid: 30,
      daysWorked: 26,
      divisor: 30,
      year: 2026,
      month: 9,
      rubriques: [],
      assignments: [],
      exceptions: [],
    });
    const sum = summarizeLines(lines, {
      cnasEmployee: 0.09,
      cnasEmployer: 0.25,
      cnasFos: 0.005,
      cacobatph: 0.1221,
      intemperiesEmployee: 0.00375,
      intemperiesEmployer: 0.00375,
      appliesCacobatph: true,
      appliesIntemperies: true,
      irgAmount: 0,
    });
    expect(sum.employee_ss).toBe(3600);
    expect(sum.intemperies_employee).toBe(150);
    expect(sum.intemperies_employer).toBe(150);
    expect(sum.cacobatph).toBe(4884);
    expect(sum.net_payable).toBe(36250);
  });

  it("warns when NSS is missing or base salary is below SNMG", () => {
    expect(
      payrollLegalWarnings({
        matricule: "031",
        nss: "",
        baseMonthly: 18000,
        snmg: 20000,
        grossCotisable: 18000,
      }),
    ).toHaveLength(2);
    expect(
      payrollLegalWarnings({
        matricule: "031",
        nss: "914379002240",
        baseMonthly: 40000,
        snmg: 20000,
        grossCotisable: 40000,
      }),
    ).toEqual([]);
  });
});
