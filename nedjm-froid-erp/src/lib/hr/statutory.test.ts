import { describe, expect, it } from "vitest";
import {
  cnasRegimeDeviations,
  regimeRateDeviations,
  irgBracketDeviations,
  irgRuleDeviations,
  isLegalOverrideError,
  legalOverrideError,
  legalOverrideLines,
  statutoryFractionDeviation,
  statutoryPercent,
  STATUTORY_CNAS,
  STATUTORY_IRG_BRACKETS,
} from "@/lib/hr/statutory";

describe("statutory Algerian payroll rates", () => {
  it("keeps CNAS at 9 + 25 + 0.5 and CACOBATPH at 12.21 and 0.375", () => {
    expect(statutoryPercent("CNAS_EMPLOYEE")).toBe(9);
    expect(statutoryPercent("CNAS_EMPLOYER_BASE")).toBe(25);
    expect(statutoryPercent("CNAS_FOS")).toBe(0.5);
    expect(statutoryPercent("CACOBATPH_CONGES")).toBe(12.21);
    expect(statutoryPercent("CACOBATPH_INTEMPERIES_SAL")).toBe(0.375);
    expect(statutoryPercent("CACOBATPH_INTEMPERIES_EMP")).toBe(0.375);
    expect(STATUTORY_CNAS).toEqual({ employee_pct: 9, employer_pct: 25, fos_pct: 0.5 });
  });

  it("flags an employer rate that folds the FOS into the 25 % share", () => {
    expect(statutoryFractionDeviation("CNAS_EMPLOYER_BASE", 0.25)).toBeNull();
    expect(statutoryFractionDeviation("CNAS_EMPLOYER_BASE", 0.255)).toMatch(/25 %/);
    expect(cnasRegimeDeviations({ employee_pct: 9, employer_pct: 25.5, fos_pct: 0.5 })).toHaveLength(1);
    expect(cnasRegimeDeviations({ employee_pct: null, employer_pct: null, fos_pct: null })).toEqual([]);
    expect(regimeRateDeviations("R_40", { employee_pct: 9, employer_pct: 15.3, fos_pct: 0.5 })).toEqual([]);
    expect(regimeRateDeviations("R_40", { employee_pct: 9, employer_pct: 25.5, fos_pct: 0.5 })).toHaveLength(1);
  });

  it("accepts the LF 2022 scale and the two secondary rules", () => {
    expect(irgBracketDeviations(STATUTORY_IRG_BRACKETS)).toEqual([]);
    expect(irgBracketDeviations([{ min_annual: 0, max_annual: null, rate: 0.2 }])).toHaveLength(1);
    expect(
      irgRuleDeviations("STANDARD", "ABATEMENT_ON_TAX", { rate: 0.4, min_monthly: 1000, max_monthly: 1500 }, null),
    ).toEqual([]);
    expect(
      irgRuleDeviations("STANDARD", "LISSAGE", { monthly_min: 30001, monthly_max: 35000 }, "[IRG_AFTER_ABATEMENT]*(137/51)-(27925/8)"),
    ).toEqual([]);
    expect(irgRuleDeviations("DISABLED_OR_RETIREE", "LISSAGE", { monthly_min: 30001, monthly_max: 35000 }, null)).not.toEqual(
      [],
    );
  });

  it("round-trips the override marker the screen reads", () => {
    const error = legalOverrideError(["CNAS employeur hors FOS"]);
    expect(isLegalOverrideError(error)).toBe(true);
    expect(legalOverrideLines(error)).toEqual(["CNAS employeur hors FOS"]);
  });
});
