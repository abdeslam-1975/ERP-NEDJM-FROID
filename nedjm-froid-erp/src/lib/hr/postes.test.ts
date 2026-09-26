import { describe, expect, it } from "vitest";
import { gridAsOf, resolvePermanentAssignment, type PayrollAssignment, type SalaryGridRow } from "./payroll-calc";
import { posteCodeFromLabel } from "./postes";

describe("posteCodeFromLabel", () => {
  it("strips accents and keeps a valid code", () => {
    expect(posteCodeFromLabel("Électricien bâtiment", new Set())).toBe("ELECTRICIEN_BATI");
    expect(posteCodeFromLabel("X", new Set())).toBe("P_X");
    expect(posteCodeFromLabel("عامل", new Set())).toBe("POSTE");
  });

  it("suffixes taken codes", () => {
    expect(posteCodeFromLabel("Soudeur", new Set(["SOUDEUR"]))).toBe("SOUDEUR_2");
    expect(posteCodeFromLabel("Soudeur", new Set(["SOUDEUR", "SOUDEUR_2"]))).toBe("SOUDEUR_3");
  });
});

describe("gridAsOf", () => {
  const grid: SalaryGridRow[] = [
    { poste_id: "p1", grade: "A", base_monthly: 30000, net_ref_monthly: null, effective_from: "2025-01-01" },
    { poste_id: "p1", grade: "A", base_monthly: 32000, net_ref_monthly: 35000, effective_from: "2026-01-01" },
    { poste_id: "p1", grade: "B", base_monthly: 36000, net_ref_monthly: null, effective_from: "2025-01-01" },
    { poste_id: "p2", grade: "A", base_monthly: 50000, net_ref_monthly: null, effective_from: "2025-01-01" },
  ];

  it("picks the latest row effective at the date, grade A by default", () => {
    expect(gridAsOf(grid, "p1", null, "2025-06-30")?.base_monthly).toBe(30000);
    expect(gridAsOf(grid, "p1", "a", "2026-03-31")?.base_monthly).toBe(32000);
    expect(gridAsOf(grid, "p1", "B", "2026-03-31")?.base_monthly).toBe(36000);
  });

  it("returns null without poste or before the first row", () => {
    expect(gridAsOf(grid, null, "A", "2026-03-31")).toBeNull();
    expect(gridAsOf(grid, "p1", "A", "2024-12-31")).toBeNull();
    expect(gridAsOf(grid, "p1", "C", "2026-03-31")).toBeNull();
  });
});

describe("resolvePermanentAssignment with poste level", () => {
  const base = { rubrique_id: "r", employee_id: null, site_id: null, contract_id: null, poste_id: null, is_active: true };
  const asg: PayrollAssignment[] = [
    { ...base, site_id: "s", amount: 100 },
    { ...base, poste_id: "p", amount: 200 },
    { ...base, contract_id: "c", amount: 300 },
    { ...base, employee_id: "e", amount: 400 },
  ];
  const ctx = { employeeId: "e", siteId: "s", contractId: "c", posteId: "p" };

  it("orders employee > contract > poste > site", () => {
    expect(resolvePermanentAssignment("r", asg, ctx)?.source).toBe("employee");
    expect(resolvePermanentAssignment("r", asg.slice(0, 3), ctx)?.source).toBe("contract");
    expect(resolvePermanentAssignment("r", asg.slice(0, 2), ctx)).toMatchObject({ source: "poste", amount: 200 });
    expect(resolvePermanentAssignment("r", asg.slice(0, 2), { ...ctx, posteId: null })).toMatchObject({
      source: "site",
      amount: 100,
    });
  });
});
