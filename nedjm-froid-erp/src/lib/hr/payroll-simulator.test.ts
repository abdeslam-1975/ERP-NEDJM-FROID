import { describe, expect, it } from "vitest";
import { computeSlip, slipEngineRates } from "@/lib/hr/payroll-slip";
import { initialScenario, runScenario, scenarioFigures } from "@/lib/hr/payroll-simulator";
import { assignments, brackets, compliance, rubriques, rules, simData, vars } from "@/lib/hr/payroll-simulator.fixture";

describe("payroll simulator", () => {
  it("reproduces the payroll run when nothing is changed", () => {
    const data = simData();
    const real = computeSlip({
      year: 2026,
      month: 9,
      engine: {
        ...slipEngineRates(vars),
        contributionDefs: [],
        legalVars: vars,
        irg: { brackets, rulesByCategory: rules },
        rubriques,
        assignments,
        exceptions: [],
        grid: [],
      },
      subject: {
        contract: { id: "c1", employee_id: "e1", site_id: "s1", poste_id: null, grade: null },
        employee: { matricule: "M001", nss: "123" },
        coveredDays: 30,
        contractCount: 1,
        daysPaid: 30,
        daysPresence: 26,
        annualLeaveDays: 0,
        salary: { base: 60000, net: 55000 },
        compliance,
        overtimeHours: { HS50: 4 },
        exitLines: null,
        advances: [],
        deductedElsewhere: new Map(),
      },
    });
    const sim = runScenario(data, initialScenario(data)).slip;
    expect(sim.summary).toEqual(real.summary);
    expect(sim.lines.map((l) => [l.code, l.amount])).toEqual(real.lines.map((l) => [l.code, l.amount]));
    expect(real.summary.irg_amount).toBeGreaterThan(0);
  });

  it("reacts to a CNAS rate, an IRG option and a disabled rubrique", () => {
    const data = simData();
    const base = initialScenario(data);
    const ref = scenarioFigures(runScenario(data, base));

    const lowerCnas = scenarioFigures(runScenario(data, { ...base, cnas: { ...base.cnas, employee: 0.05 } }));
    expect(lowerCnas.cnas).toBeLessThan(ref.cnas);
    expect(lowerCnas.net).toBeGreaterThan(ref.net);

    const exempt = scenarioFigures(runScenario(data, { ...base, irg: { ...base.irg, option: "EXEMPT" } }));
    expect(exempt.irg).toBe(0);
    expect(exempt.net).toBeCloseTo(ref.net + ref.irg, 2);

    const noRetenue = scenarioFigures(
      runScenario(data, {
        ...base,
        rubriques: base.rubriques.map((r) => (r.rubrique_id === "r3" ? { ...r, enabled: false } : r)),
      }),
    );
    expect(noRetenue.net).toBeCloseTo(ref.net + 1000, 2);
  });

  it("builds a blank scenario from the SNMG", () => {
    const data = { ...simData(), subject: null };
    const out = runScenario(data, initialScenario(data));
    expect(out.slip.summary.gross_cotisable).toBe(20000);
    expect(out.bulletin.employee_name).toBe("Simulation");
  });
});
