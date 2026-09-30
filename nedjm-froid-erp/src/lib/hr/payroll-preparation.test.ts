import { describe, expect, it } from "vitest";
import { generationPath, parseMonthPreparation, preparationChecks } from "@/lib/hr/payroll-preparation";

const base = {
  period: {
    year: 2026,
    month: 10,
    label: "Octobre 2026",
    nature: "OPERATIONAL",
    site_id: null,
    site_name: "Tous les chantiers",
    closed: false,
    period_status: null,
    first_open_month: "1900-01-01",
    chain_required: false,
  },
  run: null,
  previous: { label: "Septembre 2026", nature: "OPERATIONAL", status: "VALIDATED" },
  rules: { blockers: [], legacy: { legal_vars: [], cnas_rates: [], irg_bareme: [], irg_rules: [] } },
  coefficients: { pending: [], changes: [] },
  attendance: { validated: 220, proposed: 0, imports: [], contracts_without_attendance: { count: 0, sample: [] } },
  quality: { contract_start: 0, sites_without_wilaya: [] },
  decisions: [],
  simulations: [],
  can: { request: true, read_salary: true },
};

const blocker = {
  proposal_id: "p1",
  title: "SNMG 2026",
  family: "LEGAL_VAR",
  action: "SET",
  status: "SUBMITTED",
  month: "2026-10-01",
  application_decision_id: null,
};

const level = (raw: unknown, key: string) => preparationChecks(parseMonthPreparation(raw)).find((c) => c.key === key)?.level;

describe("month preparation dashboard", () => {
  it("parses the database payload, hiding the 1900 sentinel", () => {
    const p = parseMonthPreparation({ ...base, run: { id: "r1", status: "DRAFT", slips: 3, pending_changes: "2" } });
    expect(p.period.first_open_month).toBeNull();
    expect(p.run).toEqual({ id: "r1", status: "DRAFT", slips: 3, pending_changes: 2 });
    expect(parseMonthPreparation(null).blockers).toEqual([]);
  });

  it("is all green when nothing is pending", () => {
    const checks = preparationChecks(parseMonthPreparation(base));
    expect(checks.map((c) => c.level)).toEqual(["ok", "ok", "ok", "ok", "ok", "ok"]);
    expect(generationPath(parseMonthPreparation(base)).kind).toBe("D4");
  });

  it("blocks only on pending rules and routes the request to D1", () => {
    const raw = { ...base, rules: { ...base.rules, blockers: [blocker] } };
    expect(level(raw, "rules")).toBe("blocking");
    expect(generationPath(parseMonthPreparation(raw)).kind).toBe("D1");
    const blocking = preparationChecks(parseMonthPreparation(raw)).filter((c) => c.level === "blocking");
    expect(blocking).toHaveLength(1);
  });

  it("keeps inherited unverified values as a warning that never blocks", () => {
    const raw = {
      ...base,
      rules: { ...base.rules, legacy: { ...base.rules.legacy, legal_vars: [{ code: "SNMG", label: "SNMG", from: "2024-01-01" }] } },
    };
    expect(level(raw, "rules")).toBe("warning");
    expect(generationPath(parseMonthPreparation(raw)).kind).toBe("D4");
  });

  it("flags attendance, data quality, open decisions and pending coefficients as warnings", () => {
    const raw = {
      ...base,
      attendance: { validated: 10, proposed: 4, imports: [{ id: "b", batch_no: "IMP-1", status: "IMPORTED" }], contracts_without_attendance: { count: 2, sample: ["E1 A B"] } },
      quality: { contract_start: 1, sites_without_wilaya: ["Chantier X"] },
      decisions: [{ id: "d", type_code: "D13", status: "PENDING", label: "Contrat" }],
      coefficients: { pending: [{ decision_id: "d14", code: "P", coefficient: 0.5, month: "2026-10-01" }], changes: [] },
    };
    for (const key of ["attendance", "quality", "decisions", "coefficients"]) expect(level(raw, key)).toBe("warning");
    const att = preparationChecks(parseMonthPreparation(raw)).find((c) => c.key === "attendance");
    expect(att?.detail).toContain("4 présences proposées");
    expect(att?.detail).toContain("2 contrats sans aucune présence validée");
  });

  it("never treats a reprise previous month as missing: information only", () => {
    const raw = { ...base, previous: { label: "Août 2026", nature: "EXTERNAL", status: null } };
    expect(level(raw, "previous")).toBe("info");
    expect(level({ ...base, previous: { label: "Septembre 2026", nature: "OPERATIONAL", status: null } }, "previous")).toBe("warning");
  });

  it("offers no generation for a closed month or an existing draft", () => {
    expect(generationPath(parseMonthPreparation({ ...base, period: { ...base.period, period_status: "VALIDATED" } })).kind).toBe("CLOSED");
    expect(generationPath(parseMonthPreparation({ ...base, run: { id: "r", status: "DRAFT" } })).kind).toBe("DRAFT");
  });
});
