import { describe, expect, it } from "vitest";
import {
  assignmentZoneNotice,
  DECISION_TYPE_CODES,
  decideBlocker,
  isDecisionTypeCode,
  payrollSourceLabel,
  decisionStatusLabel,
  parseDecisionOptions,
  parsePayrollSignal,
  parseRuleApplicationContext,
  payrollRunStatusLabel,
  payrollSignalNotice,
  periodLabel,
  ruleApplicationSlipNotice,
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

  it("D2: refuses a rule contributor, except the SUPER_ADMIN", () => {
    expect(decideBlocker({ ...base, isRuleContributor: true })).toMatch(/contribué à cette règle/);
    expect(decideBlocker({ ...base, isRuleContributor: true, isSuperAdmin: true })).toBeNull();
  });
});

describe("D2 context", () => {
  it("parses the application context and hides the 1900 sentinel", () => {
    const c = parseRuleApplicationContext({
      proposal_id: "p1",
      family: "LEGAL_VAR",
      requested_month: "2026-11-01",
      application_month: "2026-11-01T00:00:00",
      first_open_month: "1900-01-01",
      self_approved: true,
      contributors: ["Ali", 3],
      slips: [{ period_key: "2026-11", status: "DRAFT", runs: "2", slips: "14", affected: true }, null],
    });
    expect(c).toMatchObject({
      proposal_id: "p1",
      application_month: "2026-11-01",
      first_open_month: null,
      self_approved: true,
      contributors: ["Ali", "3"],
      slips: [{ period_key: "2026-11", period: "2026-11", status: "DRAFT", runs: 2, slips: 14, affected: true }],
    });
    expect(parseRuleApplicationContext(null)).toMatchObject({ proposal_id: "", slips: [], first_open_month: null });
  });

  it("summarises flagged drafts and frozen payslips without modifying them", () => {
    const notice = ruleApplicationSlipNotice([
      { period_key: "2026-10", period: "10/2026", status: "VALIDATED", runs: 1, slips: 5, affected: false },
      { period_key: "2026-11", period: "11/2026", status: "DRAFT", runs: 1, slips: 7, affected: true },
    ]);
    expect(notice).toMatch(/^7 bulletin\(s\) brouillon/);
    expect(notice).toMatch(/5 bulletin\(s\) validé\(s\).*jamais modifiés/);
    expect(ruleApplicationSlipNotice([])).toBe("Aucun bulletin brouillon concerné.");
    expect(payrollRunStatusLabel("LOCKED")).toBe("Verrouillée");
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

describe("lot 1 decision types", () => {
  it("knows D8 and D13 and rejects unknown codes", () => {
    expect(DECISION_TYPE_CODES).toEqual(expect.arrayContaining(["D3", "D4", "D8", "D13"]));
    expect(isDecisionTypeCode("D13")).toBe(true);
    expect(isDecisionTypeCode("D99")).toBe(false);
  });

  it("labels the new payroll input sources", () => {
    expect(payrollSourceLabel("ASSIGNMENT")).not.toBe("ASSIGNMENT");
    expect(payrollSourceLabel("SITE_WILAYA")).not.toBe("SITE_WILAYA");
  });
});

describe("assignmentZoneNotice", () => {
  it("says when the IRG zone does not change", () => {
    expect(assignmentZoneNotice({ oldZone: "Z1", newZone: "Z1", draftSlips: 2 })).toMatch(/Même zone IRG/);
  });

  it("announces the zone change and the draft slips to recalculate through D3", () => {
    const text = assignmentZoneNotice({ oldZone: "Z1", newZone: "Z2", draftSlips: 2 });
    expect(text).toMatch(/Z1 → Z2/);
    expect(text).toMatch(/2 bulletin\(s\)/);
    expect(text).toMatch(/D3/);
    expect(assignmentZoneNotice({ oldZone: "Z1", newZone: "Z2", draftSlips: 0 })).toMatch(/Aucun bulletin/);
  });

  it("does not pretend to know an undetermined zone", () => {
    expect(assignmentZoneNotice({ oldZone: null, newZone: "Z2", draftSlips: 0 })).toMatch(/non déterminée/);
  });
});
