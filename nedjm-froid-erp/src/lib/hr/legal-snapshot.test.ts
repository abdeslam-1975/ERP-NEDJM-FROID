import { describe, expect, it } from "vitest";
import { bulletinRatesFromVars, DEFAULT_BULLETIN_SETTINGS } from "@/lib/hr/bulletin-settings";
import { parseLegalSnapshot } from "@/lib/hr/legal-vars-as-of";

describe("bulletinRatesFromVars", () => {
  it("converts decimal legal vars to bulletin percentages (employer = base + FOS)", () => {
    const rates = bulletinRatesFromVars(
      {
        CNAS_EMPLOYEE: 0.09,
        CNAS_EMPLOYER_BASE: 0.25,
        CNAS_FOS: 0.005,
        CACOBATPH_CONGES: 0.1221,
        CACOBATPH_INTEMPERIES_SAL: 0.0075,
        CACOBATPH_INTEMPERIES_EMP: 0.0075,
      },
      DEFAULT_BULLETIN_SETTINGS,
    );
    expect(rates).toEqual({
      ss_pct: 9,
      pat_pct: 25.5,
      caco_pct: 12.21,
      intemp_sal_pct: 0.75,
      intemp_pat_pct: 0.75,
    });
  });

  it("returns null for missing vars instead of 0", () => {
    const rates = bulletinRatesFromVars({ CNAS_EMPLOYEE: 0.09 }, DEFAULT_BULLETIN_SETTINGS);
    expect(rates.ss_pct).toBe(9);
    expect(rates.pat_pct).toBeNull();
    expect(rates.caco_pct).toBeNull();
  });

  it("uses the frozen snapshot rates, not the current ones", () => {
    const frozen = parseLegalSnapshot({
      as_of: "2025-01-01",
      vars: { CNAS_EMPLOYEE: "0.085" },
      irg_category: "STANDARD",
    });
    expect(frozen?.vars.CNAS_EMPLOYEE).toBe(0.085);
    expect(bulletinRatesFromVars(frozen!.vars, DEFAULT_BULLETIN_SETTINGS).ss_pct).toBe(8.5);
  });
});

describe("parseLegalSnapshot", () => {
  it("rejects malformed snapshots", () => {
    expect(parseLegalSnapshot(null)).toBeNull();
    expect(parseLegalSnapshot({ vars: {} })).toBeNull();
    expect(parseLegalSnapshot("x")).toBeNull();
  });

  it("drops non-numeric values and defaults the IRG category", () => {
    expect(parseLegalSnapshot({ as_of: "2026-09-01", vars: { A: 1, B: "abc" } })).toEqual({
      as_of: "2026-09-01",
      vars: { A: 1 },
      irg_category: "STANDARD",
    });
  });
});
