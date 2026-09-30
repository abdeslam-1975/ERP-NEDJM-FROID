import { describe, expect, it } from "vitest";
import { buildSlipTrace } from "@/lib/hr/slip-trace";
import type { ResolvedCompliance } from "@/lib/hr/compliance";
import type { RuleRowTrace } from "@/lib/hr/irg-engine-load";

const row = (id: string, proposal_id: string | null = null, decision_id: string | null = null): RuleRowTrace => ({
  id,
  status: proposal_id ? "APPLIED" : "LEGACY",
  proposal_id,
  decision_id,
});

function resolved(irg: Partial<ResolvedCompliance["irg"]> = {}): ResolvedCompliance {
  return {
    irg: {
      mode: "AUTO",
      option: "AUTO",
      category: "STANDARD",
      zone_code: "SUD",
      zone_rate: 0.5,
      zone_applies_to: "TAX",
      fixed_rate: null,
      ...irg,
    },
    cnas: { mode: "AUTO", regime_code: "R22", employee: 0.045, employer: 0.12, fos: 0.005 },
    cacobatph: { mode: "AUTO", conges: false, intemperies: false },
    override_ids: [],
  };
}

const base = {
  legalVarRows: { SNMG: row("v2"), CNAS_EMPLOYEE: row("v1", "p1", "d1") },
  irg: { bareme: row("b1", "p2", "d2"), rule_sets: { STANDARD: row("rs1") } },
  siteZone: { code: "SUD", source: "scope" as const, scope_id: "sc1" },
  zoneScope: row("sc1", "p3", "d3"),
  regimeRates: row("cr1"),
  contract: { id: "c1", start_exception_decision: null },
  assignment: { id: "a1", corrected_by_decision: "d8" },
  salaryVersionId: "sv1",
  payrollDecisionId: "d4",
};

describe("buildSlipTrace", () => {
  it("records every rule row, the zone scope, the regime rates and the decisions", () => {
    const t = buildSlipTrace({ ...base, resolved: resolved() });
    expect(t.rules.map((r) => `${r.family}:${r.key}:${r.id}`)).toEqual([
      "LEGAL_VAR:CNAS_EMPLOYEE:v1",
      "LEGAL_VAR:SNMG:v2",
      "IRG_BAREME:BAREME:b1",
      "IRG_RULES:STANDARD:rs1",
      "IRG_ZONE_SCOPE:SUD:sc1",
      "CNAS_RATES:R22:cr1",
    ]);
    expect(t).toMatchObject({
      contract: { id: "c1", start_exception_decision: null },
      assignment: { id: "a1", corrected_by_decision: "d8" },
      salary_version_id: "sv1",
      payroll_decision_id: "d4",
    });
  });

  it("falls back to the STANDARD rule set when the category has none", () => {
    const t = buildSlipTrace({ ...base, resolved: resolved({ category: "DISABLED_OR_RETIREE" }) });
    expect(t.rules.find((r) => r.family === "IRG_RULES")?.key).toBe("STANDARD");
  });

  it("skips IRG rows when the slip is exempt or at a fixed rate", () => {
    for (const irg of [{ option: "EXEMPT" as const }, { option: "FIXED_RATE" as const, fixed_rate: 0.1 }]) {
      const families = buildSlipTrace({ ...base, resolved: resolved(irg) }).rules.map((r) => r.family);
      expect(families).not.toContain("IRG_BAREME");
      expect(families).not.toContain("IRG_ZONE_SCOPE");
    }
  });

  it("omits the zone scope when a manual override chose another zone", () => {
    const t = buildSlipTrace({ ...base, resolved: resolved({ zone_code: "GRAND_SUD" }) });
    expect(t.rules.some((r) => r.family === "IRG_ZONE_SCOPE")).toBe(false);
  });
});
