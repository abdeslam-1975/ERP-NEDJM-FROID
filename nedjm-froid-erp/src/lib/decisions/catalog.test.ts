import { describe, expect, it } from "vitest";
import {
  decideBlocker,
  decisionStatusLabel,
  parseDecisionOptions,
  parsePayrollSignal,
  payrollSignalNotice,
  periodLabel,
  periodNatureText,
  validateJustification,
} from "@/lib/decisions/catalog";

const base = { status: "PENDING", isSuperAdmin: false, hasDecisionRight: true, requestedBy: "a", userId: "b" };

describe("decideBlocker", () => {
  it("lets a holder of the decision right decide someone else's request", () => {
    expect(decideBlocker(base)).toBeNull();
  });

  it("refuses without the decision right", () => {
    expect(decideBlocker({ ...base, hasDecisionRight: false })).toMatch(/pas le droit/);
  });

  it("enforces separation of duties for the requester", () => {
    expect(decideBlocker({ ...base, requestedBy: "b" })).toMatch(/Séparation des tâches/);
  });

  it("exempts SUPER_ADMIN from the right and from separation", () => {
    expect(decideBlocker({ ...base, isSuperAdmin: true, hasDecisionRight: false, requestedBy: "b" })).toBeNull();
  });

  it("refuses any decision that is no longer pending, even for SUPER_ADMIN", () => {
    for (const status of ["DECIDED", "EXECUTED", "INVALIDATED", "SUPERSEDED"]) {
      expect(decideBlocker({ ...base, status, isSuperAdmin: true })).toMatch(/plus en attente/);
    }
  });
});

describe("validateJustification", () => {
  it("requires at least 10 meaningful characters", () => {
    expect(validateJustification("   ok      ")).toMatch(/obligatoire/);
    expect(validateJustification("Présences corrigées")).toBeNull();
  });

  it("caps the length", () => {
    expect(validateJustification("x".repeat(2001))).toMatch(/trop longue/);
  });
});

describe("parseDecisionOptions", () => {
  it("keeps well-formed options and only treats executes=true as executing", () => {
    const opts = parseDecisionOptions([
      { code: "GENERATE", label_fr: "Générer", consequence_fr: "Crée la paie", executes: true },
      { code: "NOT_NOW", label_fr: "Pas maintenant", consequence_fr: "Rien", executes: "true" },
      { label_fr: "sans code" },
      null,
    ]);
    expect(opts.map((o) => [o.code, o.executes])).toEqual([
      ["GENERATE", true],
      ["NOT_NOW", false],
    ]);
  });

  it("returns nothing for a non-array snapshot", () => {
    expect(parseDecisionOptions({ code: "X" })).toEqual([]);
  });
});

describe("payroll signal", () => {
  it("parses the RPC payload defensively", () => {
    expect(parsePayrollSignal(null)).toEqual({ flagged_runs: 0, generation_decision: null });
    expect(parsePayrollSignal({ flagged_runs: 2, generation_decision: "id" })).toEqual({
      flagged_runs: 2,
      generation_decision: "id",
    });
  });

  it("never announces a recalculation", () => {
    const flagged = payrollSignalNotice({ flagged_runs: 1, generation_decision: null });
    expect(flagged).toMatch(/aucun recalcul automatique/);
    expect(payrollSignalNotice({ flagged_runs: 0, generation_decision: "id" })).toMatch(/Aucune paie n'a été créée/);
    expect(payrollSignalNotice({ flagged_runs: 0, generation_decision: null })).toBeNull();
  });
});

describe("labels", () => {
  it("formats periods and statuses", () => {
    expect(periodLabel(2026, 9)).toBe("09/2026");
    expect(periodLabel(null, 9)).toBe("—");
    expect(decisionStatusLabel("DECIDED")).toBe("Décidée, à exécuter");
    expect(decisionStatusLabel("UNKNOWN")).toBe("UNKNOWN");
  });

  it("warns that external months are paid and declared outside the app", () => {
    expect(periodNatureText("EXTERNAL")).toMatch(/hors de l'application/);
    expect(periodNatureText("OPERATIONAL")).toMatch(/opérationnelle/);
  });
});
