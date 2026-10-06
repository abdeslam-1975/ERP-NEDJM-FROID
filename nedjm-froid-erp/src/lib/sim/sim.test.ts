import { describe, expect, it } from "vitest";
import { DEFAULT_BULLETIN_SETTINGS } from "@/lib/hr/bulletin-settings";
import { computeLeaveBalance } from "@/lib/hr/leave";
import { LEAVE_TITLE_FIELD_KEYS, type LeaveTitleFieldKey } from "@/lib/hr/leave-title";
import { initialScenario, runScenario } from "@/lib/hr/payroll-simulator";
import { simData } from "@/lib/hr/payroll-simulator.fixture";
import { seededTemplate } from "@/lib/doc/migration-templates";
import { SEED_COMPANY, SEED_LISTS } from "@/lib/doc/hr-docs.fixtures";
import type { PrintKit } from "@/lib/doc/print-kit";
import { influenceOf, SimContext, trackedRecord, type SimOverrides, type SimVarDef } from "@/lib/sim/core";
import type { OmSimData } from "@/lib/sim/documents";
import type { LeaveSimData } from "@/lib/sim/leave";
import { leaveBalanceFromCtx } from "@/lib/sim/leave";
import { linkedVariables, runSimulation, simVariables, type SimTargetData } from "@/lib/sim/targets";

const env = { origin: "" };

const kit: PrintKit = {
  company: SEED_COMPANY,
  templates: Object.fromEntries(
    (["titre_conge", "ordre_mission"] as const).map((t) => [t, seededTemplate(t)]),
  ),
  lists: SEED_LISTS,
};

function setup(data: SimTargetData) {
  const defs = simVariables(data, env);
  const map = new Map(defs.map((d) => [d.id, d]));
  const run = (overrides: SimOverrides = {}) => runSimulation(data, map, overrides, env);
  const figure = (overrides: SimOverrides, key: string) =>
    run(overrides).output.figures.find((f) => f.key === key)?.value ?? NaN;
  return { defs, map, run, figure };
}

describe("simulation context", () => {
  it("records direct reads, reads through a derived value, and forced values", () => {
    const defs = new Map<string, SimVarDef>([
      ["a", { id: "a", label: "A", group: "g", kind: "number", base: 2 }],
      ["b", { id: "b", label: "B", group: "g", kind: "number", base: 3 }],
      ["sum", { id: "sum", label: "Somme", group: "g", kind: "number", base: 0, derived: true }],
      ["unused", { id: "unused", label: "U", group: "g", kind: "number", base: 1 }],
    ]);
    const compute = (overrides: SimOverrides) => {
      const ctx = new SimContext(defs, overrides);
      const sum = ctx.deriveNum("sum", () => ctx.num("a") + ctx.num("b"));
      return { ctx, total: sum * ctx.num("a") };
    };
    const plain = compute({});
    expect(plain.total).toBe(10);
    expect(influenceOf(plain.ctx.reads, "a").kind).toBe("direct");
    expect(influenceOf(plain.ctx.reads, "b")).toEqual({ kind: "via", via: ["sum"] });
    expect(influenceOf(plain.ctx.reads, "unused").kind).toBe("none");
    expect(plain.ctx.derivedValues.get("sum")).toBe(5);

    const forced = compute({ sum: 10 });
    expect(forced.total).toBe(20);
    expect(influenceOf(forced.ctx.reads, "b").kind).toBe("none");
  });

  it("tracks only the keys a calculation reads from a record", () => {
    const defs = new Map<string, SimVarDef>([
      ["legal.X", { id: "legal.X", label: "X", group: "g", kind: "number", base: 4 }],
      ["legal.Y", { id: "legal.Y", label: "Y", group: "g", kind: "number", base: 5 }],
    ]);
    const ctx = new SimContext(defs, { "legal.Y": 7 });
    const rec = trackedRecord(ctx, "legal.", ["X", "Y"]);
    expect(rec.X).toBe(4);
    expect(ctx.reads.has("legal.Y")).toBe(false);
    expect(rec.Y).toBe(7);
    expect(rec.Z).toBeUndefined();
  });
});

describe("fiche de paie element", () => {
  const data: SimTargetData = {
    target: "paie",
    sim: simData(true),
    bulletin: DEFAULT_BULLETIN_SETTINGS,
    template: seededTemplate("bulletin_paie"),
  };

  it("gives the payroll run result when nothing is changed", () => {
    const { run } = setup(data);
    const sim = data.target === "paie" ? data.sim : simData();
    const ref = runScenario(sim, initialScenario(sim)).slip.summary;
    const net = run().output.figures.find((f) => f.key === "net")?.value;
    expect(net).toBeCloseTo(ref.net_payable, 2);
    expect(run().output.html).toContain("<html");
  });

  it("reflects each kind of variable and reports what affects the slip", () => {
    const { figure, run } = setup(data);
    const net = figure({}, "net");
    expect(figure({ "irg.option": "EXEMPT" }, "net")).toBeGreaterThan(net);
    expect(figure({ "cnas.regime": "REDUIT" }, "cnas")).toBeLessThan(figure({}, "cnas"));
    expect(figure({ "rubrique.r4.actif": true, "rubrique.r4.valeur": 3000 }, "gross")).toBeCloseTo(figure({}, "gross") + 3000, 2);
    expect(figure({ "contrat.c1.salaire_base": 70000 }, "gross")).toBeGreaterThan(figure({}, "gross"));

    const reads = run().ctx.reads;
    expect(influenceOf(reads, "rubrique.r4.actif").kind).toBe("direct");
    expect(influenceOf(reads, "rubrique.r4.valeur").kind).toBe("none");
    expect(influenceOf(reads, "legal.CONGE_JOURS_MOIS").kind).toBe("none");
    expect(influenceOf(reads, "legal.CNAS_EMPLOYEE").kind).toBe("via");
    expect(influenceOf(reads, "pointage.2026-09-02").kind).not.toBe("none");
  });

  it("recomputes the paid days from a pointage day (chain pointage → paie)", () => {
    const { run, figure } = setup(data);
    const absent = run({ "pointage.2026-09-02": "AN" });
    expect(absent.ctx.derivedValues.get("pointage.jours_payes")).toBe(29);
    expect(figure({ "pointage.2026-09-02": "AN" }, "gross")).toBeLessThan(figure({}, "gross"));
    expect(run({ "pointage.jours_payes": 29 }).output.figures.find((f) => f.key === "gross")?.value).toBeCloseTo(
      figure({ "pointage.2026-09-02": "AN" }, "gross"),
      2,
    );
  });

  it("gives derived variables their computed ERP value", () => {
    const { map } = setup(data);
    expect(map.get("pointage.jours_payes")?.base).toBe(30);
    expect(map.get("cnas.part_salariale")?.base).toBeCloseTo(0.09, 6);
  });

  it("links a pointage shown beside the payslip: one day cell changes both", () => {
    const pointage: SimTargetData = { target: "pointage", sim: data.target === "paie" ? data.sim : simData(true) };
    const defs = linkedVariables([data, pointage], env);
    const map = new Map(defs.map((d) => [d.id, d]));
    const figure = (target: SimTargetData, overrides: SimOverrides, key: string) =>
      runSimulation(target, map, overrides, env).output.figures.find((f) => f.key === key)?.value ?? NaN;
    const change = { "pointage.2026-09-02": "AN" };

    expect(defs.filter((d) => d.id === "pointage.2026-09-02")).toHaveLength(1);
    expect(figure(pointage, change, "paid")).toBe(figure(pointage, {}, "paid") - 1);
    expect(figure(data, change, "gross")).toBeLessThan(figure(data, {}, "gross"));
    const html = runSimulation(pointage, map, change, env).output.html ?? "";
    expect(html).toContain('data-sim-var="pointage.2026-09-02" class="chg"');
  });
});

const leave: LeaveSimData = {
  employee: { id: "e1", matricule: "M001", name: "TEST" },
  kinds: SEED_LISTS.leaveKinds,
  as_of: "2026-09-28",
  rate: 2.5,
  contracts: [
    { id: "c1", number: "C-1", start_date: "2025-09-01", end_date: null, affectation_principale: true, status: "ACTIVE" },
  ],
  requests: [
    { id: "q1", kind: "ANNUAL", status: "APPROVED", days: 10, start_date: "2026-03-01", end_date: "2026-03-10" },
    { id: "q2", kind: "ANNUAL", status: "SUBMITTED", days: 5, start_date: "2026-06-01", end_date: "2026-06-05" },
  ],
  adjustments: [{ id: "a1", days: 2, as_of: "2026-01-15", reason: "Reprise" }],
};

describe("congés", () => {
  it("computes the balance exactly like the leave module", () => {
    const { run, figure } = setup({ target: "solde_conge", leave });
    const expected = computeLeaveBalance({
      employeeId: "e1",
      contracts: leave.contracts.map((c) => ({ ...c, employee_id: "e1" })),
      requests: leave.requests.map((r) => ({ ...r, employee_id: "e1" })),
      adjustments: leave.adjustments.map((a) => ({ ...a, employee_id: "e1" })),
      asOf: "2026-09-28",
      ratePerMonth: 2.5,
      annualKinds: ["ANNUAL"],
    });
    expect(figure({}, "balance")).toBe(expected.balance);
    expect(figure({ "conge.demande.q2.statut": "APPROVED" }, "balance")).toBe(expected.balance - 5);
    expect(figure({ "legal.CONGE_JOURS_MOIS": 3 }, "balance")).toBeGreaterThan(expected.balance);
    expect(run().output.html).toContain("Solde de congé annuel");
  });

  it("titre de congé: days, return date and balance follow the dates", () => {
    const data: SimTargetData = {
      target: "titre_conge",
      leave,
      fields: {
        ...(Object.fromEntries(LEAVE_TITLE_FIELD_KEYS.map((k) => [k, ""])) as Record<LeaveTitleFieldKey, string>),
        matricule: "M001",
        nom: "TEST",
      },
      numero: "000005/26",
      letterhead_url: null,
      kit,
      request: { id: "q1", kind: "ANNUAL", start_date: "2026-03-01", end_date: "2026-03-10", days: 10 },
    };
    const { run, map } = setup(data);
    expect(map.get("titre.jours")?.base).toBe(10);
    expect(map.get("titre.reprise")?.base).toBe("2026-03-11");
    const longer = run({ "titre.au": "2026-03-15" });
    expect(longer.ctx.derivedValues.get("titre.jours")).toBe(15);
    expect(longer.ctx.derivedValues.get("titre.reprise")).toBe("2026-03-16");
    const ctx = new SimContext(map, {});
    const atEnd = leaveBalanceFromCtx(ctx, leave, "2026-03-10").balance;
    expect(map.get("titre.solde")?.base).toBe(atEnd);
    expect(longer.output.html).toContain("NF/CNG/0005/26");
    expect(longer.output.html).toContain("15/03/2026");
  });
});

describe("ordre de mission", () => {
  it("applies the ERP date rules against the chosen date of the day", () => {
    const fields = Object.fromEntries(
      ["matricule", "nom", "dateDepart", "dateRetour"].map((k) => [k, ""]),
    ) as OmSimData["fields"];
    const om: OmSimData = {
      fields: { ...fields, matricule: "M001", nom: "TEST", dateDepart: "2026-10-01", dateRetour: "2026-10-05" },
      numero: "",
      letterhead_url: null,
      kit,
      today: "2026-09-28",
      original: null,
    };
    const { figure, run } = setup({ target: "ordre_mission", om });
    expect(figure({}, "issues")).toBe(0);
    expect(figure({}, "duration")).toBe(4);
    expect(figure({ "om.aujourdhui": "2026-10-02" }, "issues")).toBe(1);
    expect(run({ "om.dateRetour": "2026-09-30" }).output.warnings.length).toBeGreaterThan(0);
  });
});
