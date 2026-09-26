import { describe, expect, it } from "vitest";
import {
  calendarDays,
  computeLeaveBalance,
  monthsWorked,
  normalizeSettlementLines,
  returnDate,
  suggestSettlement,
} from "@/lib/hr/leave";

describe("dates", () => {
  it("counts inclusive days and the return date", () => {
    expect(calendarDays("2026-07-01", "2026-07-30")).toBe(30);
    expect(calendarDays("2026-07-10", "2026-07-01")).toBe(0);
    expect(returnDate("2026-07-31")).toBe("2026-08-01");
  });
});

describe("monthsWorked", () => {
  it("counts full and partial months once", () => {
    expect(monthsWorked([{ employee_id: "e", start_date: "2026-01-01", end_date: null }], "2026-06-30")).toBe(6);
    expect(monthsWorked([{ employee_id: "e", start_date: "2026-01-16", end_date: "2026-01-31" }], "2026-12-31")).toBe(0.52);
  });

  it("merges overlapping contracts and ignores secondary ones", () => {
    const rows = [
      { employee_id: "e", start_date: "2026-01-01", end_date: "2026-03-31" },
      { employee_id: "e", start_date: "2026-03-01", end_date: "2026-04-30" },
      { employee_id: "e", start_date: "2026-01-01", end_date: "2026-12-31", affectation_principale: false },
    ];
    expect(monthsWorked(rows, "2026-12-31")).toBe(4);
  });
});

describe("computeLeaveBalance", () => {
  it("accrues 2.5 days per month minus approved annual leave", () => {
    const b = computeLeaveBalance({
      employeeId: "e",
      contracts: [{ employee_id: "e", start_date: "2026-01-01", end_date: null }],
      requests: [
        { employee_id: "e", kind: "ANNUAL", status: "APPROVED", days: 10 },
        { employee_id: "e", kind: "ANNUAL", status: "SUBMITTED", days: 3 },
        { employee_id: "e", kind: "SICK", status: "APPROVED", days: 5 },
        { employee_id: "e", kind: "ANNUAL", status: "REJECTED", days: 7 },
      ],
      adjustments: [{ employee_id: "e", days: 4 }],
      asOf: "2026-06-30",
      ratePerMonth: 2.5,
    });
    expect(b).toMatchObject({ months: 6, accrued: 15, adjustments: 4, taken: 10, pending: 3, balance: 9 });
  });
});

describe("settlement", () => {
  it("suggests the leave indemnity at base / 30", () => {
    expect(suggestSettlement({ leaveBalanceDays: 9, baseMonthly: 60000 })).toEqual([
      expect.objectContaining({ code: "ICP", category: "1", amount: 18000 }),
    ]);
    expect(suggestSettlement({ leaveBalanceDays: -2, baseMonthly: 60000 })).toEqual([]);
  });

  it("normalizes stored lines", () => {
    expect(normalizeSettlementLines([{ code: "X", amount: "100", category: "9" }, { amount: 0 }, null])).toEqual([
      { code: "X", label_fr: "", label_ar: "", category: "4", amount: 100 },
    ]);
  });
});
