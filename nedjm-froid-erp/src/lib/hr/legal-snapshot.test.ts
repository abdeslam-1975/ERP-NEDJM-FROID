import { describe, expect, it } from "vitest";
import { bulletinRatesFromVars, DEFAULT_BULLETIN_SETTINGS } from "@/lib/hr/bulletin-settings";
import { parseLegalSnapshot, unverifiedRules } from "@/lib/hr/legal-vars-as-of";

describe("bulletinRatesFromVars", () => {
  it("converts decimal legal vars to bulletin percentages and keeps FOS in its own rate", () => {
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
      pat_pct: 25,
      fos_pct: 0.5,
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
      compliance: null,
      assignment: null,
      trace: null,
    });
  });

  it("keeps the assignment and the lot 2 trace, dropping unknown rule families", () => {
    const parsed = parseLegalSnapshot({
      as_of: "2026-10-01",
      vars: { SNMG: 24000 },
      assignment: { id: "a1", contract_id: "c1", site_id: "s1", zone_code: "SUD" },
      trace: {
        rules: [
          { family: "LEGAL_VAR", key: "SNMG", id: "v1", status: "LEGACY", proposal_id: null, decision_id: null },
          { family: "IRG_BAREME", key: "BAREME", id: "b1", status: "APPLIED", proposal_id: "p1", decision_id: "d1" },
          { family: "UNKNOWN", key: "X", id: "x1" },
        ],
        contract: { id: "c1", start_exception_decision: "d13" },
        assignment: { id: "a1", corrected_by_decision: null },
        salary_version_id: "sv1",
        payroll_decision_id: "d4",
      },
    });
    expect(parsed?.assignment).toEqual({ id: "a1", contract_id: "c1", site_id: "s1", zone_code: "SUD" });
    expect(parsed?.trace?.rules.map((r) => r.id)).toEqual(["v1", "b1"]);
    expect(parsed?.trace?.contract.start_exception_decision).toBe("d13");
    expect(parsed?.trace?.payroll_decision_id).toBe("d4");
    expect(unverifiedRules(parsed?.trace).map((r) => r.key)).toEqual(["SNMG"]);
  });

  it("ignores a trace without contract", () => {
    expect(parseLegalSnapshot({ as_of: "2026-10-01", vars: {}, trace: { rules: [] } })?.trace).toBeNull();
    expect(unverifiedRules(null)).toEqual([]);
  });
});
