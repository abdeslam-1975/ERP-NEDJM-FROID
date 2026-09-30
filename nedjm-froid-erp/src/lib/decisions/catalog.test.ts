import { describe, expect, it } from "vitest";
import {
  assignmentZoneNotice,
  DECISION_TYPE_CODES,
  decideBlocker,
  isDecisionTypeCode,
  payrollSourceLabel,
  decisionStatusLabel,
  parseDecisionOptions,
  parsePayrollChainContext,
  parsePayrollReopenContext,
  parsePayrollSignal,
  parseRuleApplicationContext,
  reopenRiskNotices,
  payrollRunStatusLabel,
  payrollSignalNotice,
  periodLabel,
  ruleApplicationSlipNotice,
  periodNatureText,
  validateJustification,
  decisionFollowUp,
  declarationRiskNotices,
  parseDeclarationDecisionContext,
  parseTransferDecisionContext,
  transferRiskNotices,
  attendanceConflictNotices,
  parseAttendanceConflictContext,
  parseCodeMappingContext,
  parseImportPolicyContext,
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
    expect(parseRuleApplicationContext(null)).toMatchObject({
      proposal_id: "",
      slips: [],
      first_open_month: null,
      chain_mode: "UNDECIDED",
      bounded_to: null,
    });
    expect(parseRuleApplicationContext({ chain_mode: "SEPARATE", bounded_to: "2026-08-31" })).toMatchObject({
      chain_mode: "SEPARATE",
      bounded_to: "2026-08-31",
      citations: [],
      citation_warnings: [],
    });
  });

  it("carries the cited documents and their warnings to the D2 decider", () => {
    const c = parseRuleApplicationContext({
      citations: [
        { id: "c1", document_id: "d1", version_no: 1, latest_version_no: 2, status: "SUPERSEDED", article: "art. 3", page: "4" },
        { document_id: "d2" },
      ],
      citation_warnings: ["Document cité retiré du registre : LF 2026.", 12, ""],
    });
    expect(c.citations).toEqual([
      expect.objectContaining({ id: "c1", document_id: "d1", latest_version_no: 2, status: "SUPERSEDED", page: 4 }),
    ]);
    expect(c.citation_warnings).toEqual(["Document cité retiré du registre : LF 2026."]);
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

describe("lot 3a decision types", () => {
  it("knows D6 and D7 and labels their sources", () => {
    expect(isDecisionTypeCode("D6")).toBe(true);
    expect(isDecisionTypeCode("D7")).toBe(true);
    expect(payrollSourceLabel("PAYROLL_REOPEN")).toMatch(/réouverture/);
    expect(payrollSourceLabel("PAYROLL_VALIDATION")).toMatch(/Validation/);
  });
});

describe("D7 context", () => {
  const raw = {
    run_id: "r1",
    period: "09/2026",
    period_nature: "OPERATIONAL",
    status: "LOCKED",
    reason: "Erreur de pointage constatée",
    slip_count: "12",
    net_total: 250000.5,
    transfers: [{ batch_no: "VIR-1", status: "EXECUTED", lines: 12, amount: "250000.50" }, "x"],
    transfer_executed: true,
    certificates: [{ number: "ATT-1", type: "ATTEST", issued_at: "2026-10-03", employee: "M01 A B" }],
    later_runs: [{ period: "10/2026", status: "VALIDATED", site_name: "Oran" }],
    prior_decisions: [{ id: "d", type: "D3", status: "EXECUTED" }],
    versions: 3,
  };

  it("parses the context defensively", () => {
    const c = parsePayrollReopenContext(raw);
    expect(c).toMatchObject({ run_id: "r1", status: "LOCKED", slip_count: 12, net_total: 250000.5, versions: 3 });
    expect(c.transfers).toEqual([
      { batch_no: "VIR-1", status: "EXECUTED", mode: "", lines: 12, amount: 250000.5, executed_at: null, deposit_date: null },
    ]);
    expect(parsePayrollReopenContext(null)).toMatchObject({ run_id: "", transfers: [], transfer_executed: false });
  });

  it("shows the double-payment risk and never treats a missing declaration trace as a proof", () => {
    const notices = reopenRiskNotices(parsePayrollReopenContext(raw));
    expect(notices[0]).toMatch(/double paiement/);
    expect(notices.join(" ")).toMatch(/1 attestation/);
    expect(notices.join(" ")).toMatch(/1 paie\(s\) de mois suivants/);
    expect(notices.join(" ")).toMatch(/absence de trace ici ne prouve pas/);
    const quiet = reopenRiskNotices(parsePayrollReopenContext({ period_nature: "EXTERNAL" }));
    expect(quiet.some((n) => /double paiement/.test(n))).toBe(false);
    expect(quiet.join(" ")).toMatch(/hors de l'application/);
  });

  it("uses the exports register and the external operations once they exist (lot 3b)", () => {
    const withRegisters = reopenRiskNotices(
      parsePayrollReopenContext({
        ...raw,
        declarations_registry: true,
        declaration_exports: [{ id: "e1", kind: "monthly", nature: "OFFICIAL", period_year: 2026, period_month: 9, months: [9] }],
        external_operations: [{ id: "o1", kind: "PAYMENT", subtype: "SALARY", period_from: "2026-09-01", period_to: "2026-09-01" }],
      }),
    ).join(" ");
    expect(withRegisters).toMatch(/1 fichier\(s\) officiel\(s\)/);
    expect(withRegisters).toMatch(/1 paiement\(s\) externe\(s\)/);
    expect(withRegisters).not.toMatch(/antérieure au registre/);
    const empty = reopenRiskNotices(parsePayrollReopenContext({ declarations_registry: true })).join(" ");
    expect(empty).toMatch(/cela ne prouve pas qu'aucun paiement ou aucune déclaration n'a eu lieu/);
  });
});

describe("D9 / D10 contexts", () => {
  it("parses the transfer context and warns even when the registers are empty", () => {
    const c = parseTransferDecisionContext({
      period: "03/2026",
      period_nature: "EXTERNAL",
      mode: "CCP",
      slip_count: 1,
      net_total: "42000",
      slips: [{ slip_id: "s1", matricule: "M1", employee: "A B", net_payable: "42000", reasons: ["EXTERNAL_PERIOD"] }],
      internal_transfers: [],
      external_operations: [],
    });
    expect(c.slips[0]).toMatchObject({ slip_id: "s1", net_payable: 42000, reasons: ["EXTERNAL_PERIOD"] });
    const notices = transferRiskNotices(c).join(" ");
    expect(notices).toMatch(/payés hors de l'application/);
    expect(notices).toMatch(/cela ne prouve pas/);
  });

  it("flags executed batches and external payments as double-payment risks", () => {
    const c = parseTransferDecisionContext({
      period_nature: "OPERATIONAL",
      internal_transfers: [{ batch_no: "VIR-1", status: "EXECUTED", double_payment_risk: true }],
      external_operations: [{ id: "o1", kind: "PAYMENT", status: "WITHDRAWN" }],
    });
    expect(c.internal_transfers[0].double_payment_risk).toBe(true);
    const notices = transferRiskNotices(c).join(" ");
    expect(notices).toMatch(/1 lot\(s\) de virement déjà exécuté/);
    expect(notices).toMatch(/y compris retirées/);
    expect(notices).not.toMatch(/cela ne prouve pas/);
  });

  it("parses the declaration context with its month reasons", () => {
    const c = parseDeclarationDecisionContext({
      kind: "das",
      covered_months: [1, 2, 3],
      required_months: [1, 3],
      month_reasons: { "1": ["EXTERNAL_PERIOD"], "3": ["EXTERNAL_PERIOD", "EXTERNAL_DECLARATION"] },
      prior_exports: [{ id: "e", nature: "OFFICIAL", months: [2], period_year: 2026 }],
    });
    expect(c.required_months).toEqual([1, 3]);
    expect(c.month_reasons["3"]).toEqual(["EXTERNAL_PERIOD", "EXTERNAL_DECLARATION"]);
    const notices = declarationRiskNotices(c).join(" ");
    expect(notices).toMatch(/2 mois de reprise/);
    expect(notices).toMatch(/1 mois avec une déclaration externe/);
    expect(notices).toMatch(/1 fichier\(s\) officiel\(s\)/);
  });

  it("sends D9 / D10 to their operational screen, never to the decision executor", () => {
    expect(decisionFollowUp("D9", "x")?.href).toBe("/rh/paie/virements?decision=x");
    expect(decisionFollowUp("D10", "x")?.href).toBe("/rh/paie/declarations?decision=x");
    expect(decisionFollowUp("D4", "x")).toBeNull();
    expect(isDecisionTypeCode("D9")).toBe(true);
    expect(isDecisionTypeCode("D10")).toBe(true);
    expect(payrollSourceLabel("TRANSFER_PREPARATION")).toMatch(/Virements/);
    expect(payrollSourceLabel("DECLARATION_EXPORT")).toMatch(/déclaration/);
  });
});

describe("attendance import decisions (D5, D11, D12)", () => {
  it("sends only a D5 decided line by line to the imports screen", () => {
    expect(decisionFollowUp("D5", "x", "LINE_BY_LINE")?.href).toBe("/rh/presence/imports?decision=x");
    expect(decisionFollowUp("D5", "x", "KEEP_EXISTING")).toBeNull();
    expect(decisionFollowUp("D5", "x")).toBeNull();
    expect(decisionFollowUp("D11", "x", "POLICY")).toBeNull();
    expect(["D5", "D11", "D12"].every(isDecisionTypeCode)).toBe(true);
    expect(payrollSourceLabel("ATTENDANCE_IMPORT")).toMatch(/import/);
  });

  it("parses the D5 conflicts and warns about validated values and leave", () => {
    const c = parseAttendanceConflictContext({
      batch_id: "b1",
      batch_no: "IMP-2026-0001",
      period: "Mars 2026",
      reference_year: 2026,
      nature: "REPRISE",
      counts: { read: 10, ok: "7" },
      conflict_total: 3,
      conflicts: [
        {
          line_id: "l1",
          work_date: "2026-03-02",
          imported_code: "P",
          kinds: ["EXISTING_DIFFERENT"],
          existing: [{ site_name: "A", legend_code: "AB", status_code: "VALIDATED", source_code: "MANUAL" }],
        },
        { line_id: "l2", work_date: "2026-03-03", imported_code: "P", kinds: ["LEAVE"], existing: [] },
      ],
    });
    expect(c).toMatchObject({ batch_no: "IMP-2026-0001", reference_year: 2026, conflict_total: 3 });
    expect(c.counts).toEqual({ read: 10, ok: 7 });
    expect(c.conflicts[0].existing[0]).toEqual({ site_name: "A", legend_code: "AB", status_code: "VALIDATED", source_code: "MANUAL" });
    const notices = attendanceConflictNotices(c).join(" ");
    expect(notices).toMatch(/Rien n'a été remplacé/);
    expect(notices).toMatch(/1 présence\(s\) existante\(s\) déjà validée\(s\)/);
    expect(notices).toMatch(/congé approuvé/);
    expect(notices).toMatch(/reprise/);
    expect(notices).toMatch(/2 premières lignes sur 3/);
  });

  it("parses the D11 pairs and the D12 policy state", () => {
    const m = parseCodeMappingContext({
      batch_no: "IMP-2026-0002",
      reason: "Ancien logiciel",
      pairs: [{ source_code: "PR", legend_code: "P", legend_label: "Présent", lines: "12", policy: null }],
    });
    expect(m.pairs[0]).toEqual({ source_code: "PR", legend_code: "P", legend_label: "Présent", lines: 12, policy: null });
    expect(parseImportPolicyContext({ current: null, batches_to_validate: 2 })).toMatchObject({ current: null, batches_to_validate: 2 });
    expect(parseImportPolicyContext({ current: true }).current).toBe(true);
  });
});

describe("D6 context", () => {
  it("parses the reprise months and hides the 1900 sentinel", () => {
    const c = parsePayrollChainContext({
      run_period: "09/2026",
      global_open: "1900-01-01",
      reprise_months: [{ month: "2026-01-01", period: "01/2026", open: true, runs: 1, validated: 0, slips: "8" }],
      pending_rules: 2,
    });
    expect(c).toMatchObject({ run_period: "09/2026", global_open: null, pending_rules: 2 });
    expect(c.reprise_months[0]).toEqual({ month: "2026-01-01", period: "01/2026", open: true, runs: 1, validated: 0, slips: 8 });
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
