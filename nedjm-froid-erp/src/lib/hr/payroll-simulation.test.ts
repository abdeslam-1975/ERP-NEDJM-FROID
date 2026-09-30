import { describe, expect, it } from "vitest";
import { parseSimulationTotals, simulationWarnings, toSimulationSlip } from "@/lib/hr/payroll-simulation";

describe("D1 simulation rows", () => {
  it("keeps the amounts and the month site of a computed slip, without any payslip field", () => {
    const row = toSimulationSlip(
      {
        employee_id: "e1",
        row: {
          run_id: null,
          hr_contract_id: "c1",
          days_paid: 30,
          gross_amount: 45000.456,
          employee_ss: 4050,
          employer_ss: 11700,
          irg_amount: 2100,
          net_payable: 38850,
          net_target: 40000,
          irg_base: 40950,
          cacobatph: 0,
          days_by_code: { P: 22, RH: 8, X: "bad" },
          status_code: "DRAFT",
          legal_snapshot: { assignment: { site_id: "s2" } },
        },
        lines: [{ code: "BASE", label_fr: "Salaire de base", category: "GAIN", quantity: 30, unit_amount: 1500, amount: 45000 }],
      },
      "M001",
    );
    expect(row).toEqual({
      employee_id: "e1",
      contract_id: "c1",
      site_id: "s2",
      days_paid: 30,
      gross_amount: 45000.46,
      employee_ss: 4050,
      employer_ss: 11700,
      irg_amount: 2100,
      net_payable: 38850,
      detail: {
        matricule: "M001",
        days_by_code: { P: 22, RH: 8 },
        net_target: 40000,
        irg_base: 40950,
        cacobatph: 0,
        lines: [{ code: "BASE", label_fr: "Salaire de base", category: "GAIN", quantity: 30, unit_amount: 1500, amount: 45000 }],
      },
    });
    expect(row).not.toHaveProperty("status_code");
    expect(row).not.toHaveProperty("run_id");
  });

  it("reads totals defensively", () => {
    expect(parseSimulationTotals({ gross: "10.5", net: 8 })).toEqual({ gross: 10.5, employee_ss: 0, employer_ss: 0, irg: 0, net: 8 });
    expect(parseSimulationTotals(null).net).toBe(0);
  });

  it("deduplicates and bounds the warnings", () => {
    expect(simulationWarnings([" a ", "a", "", "b"])).toEqual(["a", "b"]);
    expect(simulationWarnings(Array.from({ length: 900 }, (_, i) => `w${i}`))).toHaveLength(500);
    expect(simulationWarnings(["x".repeat(800)])[0]).toHaveLength(500);
  });
});
