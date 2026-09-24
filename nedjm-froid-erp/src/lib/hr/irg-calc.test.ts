import { describe, expect, it } from "vitest";
import { computeMonthlyIrg, progressiveAnnualTax } from "@/lib/hr/irg-calc";

const lf2022 = [
  { min_annual: 0, max_annual: 240000, rate: 0 },
  { min_annual: 240001, max_annual: 480000, rate: 0.23 },
  { min_annual: 480001, max_annual: 960000, rate: 0.27 },
  { min_annual: 960001, max_annual: 1920000, rate: 0.3 },
  { min_annual: 1920001, max_annual: 3840000, rate: 0.33 },
  { min_annual: 3840001, max_annual: null, rate: 0.35 },
];

const standardRules = [
  { kind: "EXEMPTION_THRESHOLD", params: { monthly_max: 30000 }, formula: null },
  {
    kind: "ABATEMENT_ON_TAX",
    params: { rate: 0.4, min_monthly: 1000, max_monthly: 1500 },
    formula: null,
  },
  {
    kind: "LISSAGE",
    params: { monthly_min: 30001, monthly_max: 35000 },
    formula: "[IRG_AFTER_ABATEMENT] * (137/51) - (27925/8)",
  },
];

describe("IRG from barème + rules", () => {
  it("applies LF 2022 progressive slices", () => {
    expect(progressiveAnnualTax(240000, lf2022)).toBe(0);
    expect(progressiveAnnualTax(480000, lf2022)).toBeCloseTo(55200, 0);
  });

  it("exempts monthly base at or below the rule threshold", () => {
    expect(
      computeMonthlyIrg({ irgBaseMonthly: 30000, brackets: lf2022, rules: standardRules }),
    ).toBe(0);
  });

  it("applies 40% abatement with min/max from rules, not hardcoded", () => {
    const tax = computeMonthlyIrg({
      irgBaseMonthly: 40000,
      brackets: lf2022,
      rules: standardRules,
    });
    const annual = progressiveAnnualTax(480000, lf2022) / 12;
    const expected = Math.max(0, annual - 1500);
    expect(tax).toBeCloseTo(expected, 0);
    expect(tax).toBeGreaterThan(0);
  });
});
