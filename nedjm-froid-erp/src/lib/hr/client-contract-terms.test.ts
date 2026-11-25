import { describe, expect, it } from "vitest";
import type { ContractClause, PenaltyRule } from "@/lib/contracts/attributes-schema";
import {
  absenceRules,
  appendClientTerms,
  laborPostes,
  posteMatchesLabor,
  clientTermsKey,
  storedClientTerms,
  transferableClauses,
} from "@/lib/hr/client-contract-terms";

const penalty = (patch: Partial<PenaltyRule>): PenaltyRule => ({
  id: "p1",
  code: "TECH_ABSENCE",
  label: "Absence Techniciens",
  enabled: true,
  system: true,
  mode: "PCT_DAILY",
  rate: 0.05,
  ...patch,
});

describe("client contract terms for the work contract", () => {
  it("keeps only labor lines as postes", () => {
    const labor = laborPostes([
      { id: "a", item_type: "LABOR", designation: "Technicien froid", unit: "JOUR" },
      { id: "b", item_type: "SPARE_PART", designation: "Compresseur", unit: "U" },
    ]);
    expect(labor).toEqual([{ id: "a", designation: "Technicien froid", unit: "JOUR" }]);
    expect(posteMatchesLabor("technicien froid", labor)?.id).toBe("a");
    expect(posteMatchesLabor("Compresseur", labor)).toBeNull();
  });

  it("reads absence penalties and leaves the daily amount empty when the rule is a rate", () => {
    const rules = absenceRules([
      penalty({}),
      penalty({ id: "p2", code: "PIECES_DELAY", label: "Retard pièces", mode: "FIXED", fixed_amount: 1000 }),
    ]);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.fixedAmount).toBeNull();
    expect(rules[0]?.detail).toContain("%");
  });

  it("drops price revision and the financial guarantee, and prints only confirmed clauses", () => {
    const clauses = transferableClauses([
      { id: "c1", category: "AUTRE", article_ref: "12", title: "Discipline", content: "Ponctualité." },
      { id: "c2", category: "GARANTIE", article_ref: "4", title: "Caution", content: "10 %" },
    ] as ContractClause[]);
    expect(clauses.map((clause) => clause.id)).toEqual(["c1"]);
    const stored = storedClientTerms({
      clientContractId: "cc",
      contractNumber: "C-1",
      poste: "Technicien froid",
      rules: [],
      clauses,
      confirmedIds: [],
    });
    expect(stored.clauses).toEqual([]);
    const html = appendClientTerms("<html><body>contrat</body></html>", {
      ...stored,
      clauses: [{ id: "c1", article_ref: "12", title: "Discipline", content: "Ponctualité." }],
    });
    expect(html).toContain("Discipline");
    expect(html).toContain("contrat");
  });

  it("changes the signed-copy key when a confirmed clause changes", () => {
    const base = {
      client_contract_id: "cc",
      contract_number: "C-1",
      poste_label: "Technicien",
      penalty_text: "Absence : 500 DA",
      clauses: [{ id: "c1", article_ref: "12", title: "Discipline", content: "Ponctualité." }],
    };
    expect(clientTermsKey(base)).toBe(clientTermsKey({ ...base, clauses: [...base.clauses].reverse() }));
    expect(clientTermsKey(base)).not.toBe(clientTermsKey({ ...base, clauses: [{ ...base.clauses[0], content: "Retard." }] }));
  });
});
