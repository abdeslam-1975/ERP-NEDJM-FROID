import { describe, expect, it } from "vitest";
import {
  complianceLabels,
  computeResolvedIrg,
  contractTypeAllowsFixedIrg,
  pickOverride,
  resolveCompliance,
  resolveSiteZone,
  wilayaZoneMap,
  type ComplianceOverride,
  type CnasRegime,
  type IrgZone,
} from "@/lib/hr/compliance";
import { computeMonthlyIrg } from "@/lib/hr/irg-calc";

const brackets = [
  { min_annual: 0, max_annual: 240000, rate: 0 },
  { min_annual: 240001, max_annual: 480000, rate: 0.23 },
  { min_annual: 480001, max_annual: 960000, rate: 0.27 },
  { min_annual: 960001, max_annual: 1920000, rate: 0.3 },
  { min_annual: 1920001, max_annual: 3840000, rate: 0.33 },
  { min_annual: 3840001, max_annual: null, rate: 0.35 },
];

const rulesByCategory = {
  STANDARD: [{ kind: "EXEMPTION_THRESHOLD", params: { monthly_max: 30000 }, formula: null }],
  DISABLED_OR_RETIREE: [{ kind: "EXEMPTION_THRESHOLD", params: { monthly_max: 42500 }, formula: null }],
};

const zones: IrgZone[] = [
  { code: "NORMAL", label_fr: "Barème général", label_ar: "", rate_var_key: null, applies_to: "TAX" },
  { code: "SUD", label_fr: "Sud", label_ar: "", rate_var_key: "IRG_ZONE_SUD", applies_to: "TAX" },
  { code: "GRAND_SUD", label_fr: "Extrême Sud", label_ar: "", rate_var_key: "IRG_ZONE_GRAND_SUD", applies_to: "BASE" },
];

const regimes: CnasRegime[] = [
  { code: "STANDARD", label_fr: "Standard", label_ar: "", employee_pct: null, employer_pct: null, fos_pct: null },
  { code: "R22", label_fr: "R22", label_ar: "", employee_pct: 4.5, employer_pct: 12, fos_pct: null },
];

const vars = {
  CNAS_EMPLOYEE: 0.09,
  CNAS_EMPLOYER_BASE: 0.25,
  CNAS_FOS: 0.005,
  IRG_ZONE_SUD: 0.5,
  IRG_ZONE_GRAND_SUD: 0.7,
};

function override(p: Partial<ComplianceOverride> & Pick<ComplianceOverride, "domain" | "option_code">): ComplianceOverride {
  return {
    id: p.id ?? `${p.domain}-${p.effective_from ?? "x"}`,
    contract_id: "c1",
    params: {},
    reason: "justification",
    effective_from: "2026-01-01",
    effective_to: null,
    ...p,
  };
}

function resolve(overrides: ComplianceOverride[] = [], extra: Partial<Parameters<typeof resolveCompliance>[0]> = {}) {
  return resolveCompliance({
    overrides,
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    employeeIrgCategory: "STANDARD",
    socialProfileCode: null,
    siteZoneCode: "SUD",
    activity: { cacobatph: true, intemperies: false },
    vars,
    zones,
    regimes,
    ...extra,
  });
}

describe("site zone", () => {
  const map = wilayaZoneMap([
    { kind: "irg_zone_wilaya", code: "OUARGLA", label_fr: "Ouargla", label_ar: "ورقلة", extra: { zone: "SUD" }, is_active: true },
  ]);

  it("prefers the explicit site zone, then the wilaya mapping, then NORMAL", () => {
    expect(resolveSiteZone({ irg_zone_code: "GRAND_SUD", wilaya: "Ouargla" }, map)).toEqual({ code: "GRAND_SUD", source: "site" });
    expect(resolveSiteZone({ irg_zone_code: null, wilaya: "  ouargla " }, map)).toEqual({ code: "SUD", source: "wilaya" });
    expect(resolveSiteZone({ irg_zone_code: null, wilaya: "Alger" }, map)).toEqual({ code: "NORMAL", source: "default" });
  });

  it("matches wilaya ignoring accents and case", () => {
    const m = wilayaZoneMap([
      { kind: "irg_zone_wilaya", code: "BECHAR", label_fr: "Béchar", label_ar: "", extra: { zone: "SUD" }, is_active: true },
    ]);
    expect(resolveSiteZone({ wilaya: "béchar" }, m).code).toBe("SUD");
  });
});

describe("override selection", () => {
  it("applies an override active on any day of the month, latest start wins", () => {
    const rows = [
      override({ domain: "IRG", option_code: "BAREME", id: "old", effective_from: "2026-01-01", effective_to: "2026-09-14" }),
      override({ domain: "IRG", option_code: "EXEMPT", id: "new", effective_from: "2026-09-15" }),
    ];
    expect(pickOverride(rows, "IRG", "2026-09-01", "2026-09-30")?.id).toBe("new");
    expect(pickOverride(rows, "IRG", "2026-08-01", "2026-08-31")?.id).toBe("old");
    expect(pickOverride(rows, "CNAS", "2026-09-01", "2026-09-30")).toBeNull();
  });

  it("ignores overrides that ended before the period", () => {
    const rows = [override({ domain: "IRG", option_code: "EXEMPT", effective_to: "2026-08-31" })];
    expect(pickOverride(rows, "IRG", "2026-09-01", "2026-09-30")).toBeNull();
  });
});

describe("automatic mode", () => {
  it("takes the site zone rate, the employee category and the site activity", () => {
    const r = resolve();
    expect(r.irg).toMatchObject({ mode: "AUTO", zone_code: "SUD", zone_rate: 0.5, category: "STANDARD" });
    expect(r.cnas).toMatchObject({ mode: "AUTO", regime_code: "STANDARD", employee: 0.09, employer: 0.25, fos: 0.005 });
    expect(r.cacobatph).toEqual({ mode: "AUTO", conges: true, intemperies: false });
    expect(r.override_ids).toEqual([]);
  });

  it("keeps rate 0 when the zone variable is not set (no silent abatement)", () => {
    const r = resolve([], { vars: { CNAS_EMPLOYEE: 0.09 } });
    expect(r.irg.zone_rate).toBe(0);
  });

  it("uses the employee CNAS regime rates when defined", () => {
    const r = resolve([], { socialProfileCode: "R22" });
    expect(r.cnas).toMatchObject({ regime_code: "R22", employee: 0.045, employer: 0.12, fos: 0.005 });
  });
});

describe("manual overrides", () => {
  it("BAREME drops the zone abatement and the special category", () => {
    const r = resolve([override({ domain: "IRG", option_code: "BAREME" })], { employeeIrgCategory: "DISABLED_OR_RETIREE" });
    expect(r.irg).toMatchObject({ mode: "MANUAL", option: "BAREME", category: "STANDARD", zone_rate: 0 });
  });

  it("ZONE forces the chosen zone", () => {
    const r = resolve([override({ domain: "IRG", option_code: "ZONE", params: { zone_code: "GRAND_SUD" } })]);
    expect(r.irg).toMatchObject({ zone_code: "GRAND_SUD", zone_rate: 0.7, zone_applies_to: "BASE" });
  });

  it("HANDICAP uses the disabled/retiree rule set", () => {
    const r = resolve([override({ domain: "IRG", option_code: "HANDICAP" })]);
    expect(r.irg.category).toBe("DISABLED_OR_RETIREE");
  });

  it("CNAS and CACOBATPH overrides replace the automatic values", () => {
    const r = resolve([
      override({ domain: "CNAS", option_code: "REGIME", params: { regime_code: "R22" } }),
      override({ domain: "CACOBATPH", option_code: "CUSTOM", params: { conges: false, intemperies: true } }),
    ]);
    expect(r.cnas).toMatchObject({ mode: "MANUAL", regime_code: "R22", employee: 0.045 });
    expect(r.cacobatph).toEqual({ mode: "MANUAL", conges: false, intemperies: true });
    expect(r.override_ids).toHaveLength(2);
  });
});

describe("IRG amount", () => {
  const base = 60000;
  const standard = computeMonthlyIrg({ irgBaseMonthly: base, brackets, rules: rulesByCategory.STANDARD });

  it("abates the tax for a TAX zone", () => {
    const irg = resolve().irg;
    expect(computeResolvedIrg({ irgBase: base, irg, brackets, rulesByCategory })).toBeCloseTo(standard * 0.5, 2);
  });

  it("abates the base for a BASE zone", () => {
    const irg = resolve([override({ domain: "IRG", option_code: "ZONE", params: { zone_code: "GRAND_SUD" } })]).irg;
    const expected = computeMonthlyIrg({ irgBaseMonthly: base * 0.3, brackets, rules: rulesByCategory.STANDARD });
    expect(computeResolvedIrg({ irgBase: base, irg, brackets, rulesByCategory })).toBeCloseTo(expected, 2);
  });

  it("exempts and applies the fixed rate on the taxable base", () => {
    const exempt = resolve([override({ domain: "IRG", option_code: "EXEMPT" })]).irg;
    expect(computeResolvedIrg({ irgBase: base, irg: exempt, brackets, rulesByCategory })).toBe(0);
    const fixed = resolve([override({ domain: "IRG", option_code: "FIXED_RATE", params: { rate: 0.15 } })]).irg;
    expect(computeResolvedIrg({ irgBase: base, irg: fixed, brackets, rulesByCategory })).toBe(9000);
  });

  it("uses the extended threshold for disabled/retiree", () => {
    const irg = resolve([override({ domain: "IRG", option_code: "HANDICAP" })]).irg;
    expect(computeResolvedIrg({ irgBase: 40000, irg, brackets, rulesByCategory })).toBe(0);
  });
});

describe("labels and contract type gate", () => {
  it("describes the applied regime for the payslip", () => {
    const labels = complianceLabels(
      resolve([override({ domain: "IRG", option_code: "FIXED_RATE", params: { rate: 0.1 } })]),
      zones,
      regimes,
    );
    expect(labels.irg).toBe("Taux libératoire 10 % · manuel");
    expect(labels.cnas).toBe("Standard (9 % / 25.5 %)");
    expect(labels.cacobatph).toBe("congés");
  });

  it("allows the fixed rate only for flagged contract types", () => {
    const items = [
      { kind: "contract_type", code: "CDI", label_fr: "", label_ar: "", extra: {}, is_active: true },
      { kind: "contract_type", code: "EXPERT", label_fr: "", label_ar: "", extra: { allows_fixed_irg: true }, is_active: true },
    ];
    expect(contractTypeAllowsFixedIrg(items, "CDI")).toBe(false);
    expect(contractTypeAllowsFixedIrg(items, "EXPERT")).toBe(true);
    expect(contractTypeAllowsFixedIrg(items, null)).toBe(false);
  });
});
