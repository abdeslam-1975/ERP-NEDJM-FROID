import { describe, expect, it } from "vitest";
import {
  buildPayrollLines,
  computeLineAmount,
  contractCoversPeriod,
  coveredDaysInPeriod,
  exceptionAppliesToPeriod,
  groupContractsByEmployee,
  paidMonthFraction,
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
    expect(quantityForUnit("day", 22, 20, 1)).toBe(22);
    expect(quantityForUnit("presence_day", 22, 20, 1)).toBe(20);
    expect(quantityForUnit("month", 15, 15, 0.5)).toBe(0.5);
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
      monthFraction: 0.5,
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
      monthFraction: 1,
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
      monthFraction: 1,
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
      monthFraction: 1,
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
      monthFraction: 1,
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

  it("pays a full month as 1 whatever its length, and deducts 1/30 per unpaid day", () => {
    const full = (cal: number) =>
      paidMonthFraction({ daysPaid: cal, coveredDays: cal, calendarDays: cal, divisor: 30 });
    expect(full(31)).toBe(1);
    expect(full(28)).toBe(1);
    expect(full(30)).toBe(1);
    expect(paidMonthFraction({ daysPaid: 30, coveredDays: 31, calendarDays: 31, divisor: 30 })).toBe(0.9667);
    expect(paidMonthFraction({ daysPaid: 27, coveredDays: 28, calendarDays: 28, divisor: 30 })).toBe(0.9667);
    expect(paidMonthFraction({ daysPaid: 0, coveredDays: 31, calendarDays: 31, divisor: 30 })).toBe(0);
  });

  it("caps overpaid attendance at the covered days", () => {
    expect(paidMonthFraction({ daysPaid: 33, coveredDays: 31, calendarDays: 31, divisor: 30 })).toBe(1);
    expect(paidMonthFraction({ daysPaid: 20, coveredDays: 12, calendarDays: 31, divisor: 30 })).toBe(0.3871);
  });

  it("makes a mid-month contract change sum to one month", () => {
    const a = paidMonthFraction({ daysPaid: 15, coveredDays: 15, calendarDays: 31, divisor: 30 });
    const b = paidMonthFraction({ daysPaid: 16, coveredDays: 16, calendarDays: 31, divisor: 30 });
    expect(a + b).toBeCloseTo(1, 3);
    const f1 = paidMonthFraction({ daysPaid: 14, coveredDays: 14, calendarDays: 28, divisor: 30 });
    expect(f1 * 2).toBe(1);
  });

  it("counts covered days of a period, open-ended or partial", () => {
    expect(coveredDaysInPeriod("2026-01-01", null, "2026-09-01", "2026-09-30")).toBe(30);
    expect(coveredDaysInPeriod("2026-09-16", null, "2026-09-01", "2026-09-30")).toBe(15);
    expect(coveredDaysInPeriod("2026-01-01", "2026-09-10", "2026-09-01", "2026-09-30")).toBe(10);
    expect(coveredDaysInPeriod("2026-10-01", null, "2026-09-01", "2026-09-30")).toBe(0);
  });

  it("merges two principal contracts of the same month on the latest one", () => {
    const grouped = groupContractsByEmployee(
      [
        { id: "old", employee_id: "e1", start_date: "2025-01-01", end_date: "2026-03-15" },
        { id: "new", employee_id: "e1", start_date: "2026-03-16", end_date: null },
        { id: "x", employee_id: "e2", start_date: "2024-01-01", end_date: null },
      ],
      "2026-03-01",
      "2026-03-31",
    );
    const e1 = grouped.find((g) => g.contract.employee_id === "e1");
    expect(grouped).toHaveLength(2);
    expect(e1?.contract.id).toBe("new");
    expect(e1?.coveredDays).toBe(31);
    expect(e1?.contractCount).toBe(2);
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
