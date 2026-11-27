import { describe, expect, it } from "vitest";
import type { ContractClause, PenaltyRule } from "@/lib/contracts/attributes-schema";
import {
  absenceForPoste,
  absenceRules,
  appendClientTerms,
  laborPostes,
  absenceEquivalentAmount,
  retenueFromAbsence,
  posteMatchesLabor,
  citePenaltyRules,
  clientTermsKey,
  storedClientTerms,
  storedFromWorkerTerms,
  transferableClauses,
  workerTerms,
  describedPenalties,
} from "@/lib/hr/client-contract-terms";

const penalty = (patch: Partial<PenaltyRule>): PenaltyRule => ({
  id: "p1",
  code: "TECH_ABSENCE",
  label: "Absence Techniciens",
  enabled: true,
  system: true,
  mode: "PCT_DAILY",
  rate: 0.05,
  article_ref: "",
  statement: "",
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
      penalties: [],
      clauses: [{ id: "c1", article_ref: "12", title: "Discipline", content: "Ponctualité." }],
    };
    expect(clientTermsKey(base)).toBe(clientTermsKey({ ...base, clauses: [...base.clauses].reverse() }));
    expect(clientTermsKey(base)).not.toBe(clientTermsKey({ ...base, clauses: [{ ...base.clauses[0], content: "Retard." }] }));
  });

  it("reads the absence clause from the words of whichever contract is open", () => {
    const example = absenceRules([
      penalty({ id: "chef", code: "CHEF_ABSENCE", label: "Absence Chef de maintenance", rate: 0.1 }),
      penalty({ id: "tech", code: "TECH_ABSENCE", label: "Absence Techniciens", rate: 0.05 }),
    ]);
    expect(retenueFromAbsence(absenceForPoste("Technicien HVAC", example))).toBe("5 % par jour");
    expect(retenueFromAbsence(absenceForPoste("Chef de maintenance HVAC", example))).toBe("10 % par jour");
    expect(absenceForPoste("Factotum", example)).toBeNull();

    const other = absenceRules([
      penalty({ id: "weld", code: "WELD_ABS", label: "Absence soudeur", rate: 0.08 }),
      penalty({
        id: "drive",
        code: "DRIVE_ABS",
        label: "غياب السائق",
        mode: "FIXED",
        fixed_amount: 1500,
        rate: undefined,
      }),
    ]);
    expect(retenueFromAbsence(absenceForPoste("Soudeur pipeline", other))).toBe("8 % par jour");
    expect(retenueFromAbsence(absenceForPoste("سائق", other))).toBe("1500");
    expect(retenueFromAbsence(absenceForPoste("Manœuvre", [other[0]]))).toBe("8 % par jour");
  });

  it("writes each worker clause of the selected contract, including a day scale", () => {
    const labor = [
      { id: "w", designation: "Soudeur", unit: "JOUR" },
      { id: "d", designation: "Chauffeur", unit: "JOUR" },
    ];
    const penalties = describedPenalties([
      penalty({
        id: "weld",
        code: "WELD_ABS",
        label: "Absence soudeur",
        mode: "PROGRESSIVE",
        rate: undefined,
        brackets: [
          { from_day: 1, rate: 0.02 },
          { from_day: 3, rate: 0.05 },
        ],
      }),
      penalty({ id: "parts", code: "PIECES_DELAY", label: "Retard pièces", mode: "FIXED", fixed_amount: 1000, rate: undefined }),
    ]);
    const terms = workerTerms({
      poste: "Soudeur",
      labor,
      penalties,
      clauses: [
        { id: "hse", article_ref: "8", title: "Hygiène", content: "Port des EPI." },
        { id: "drive", article_ref: "9", title: "Obligations du chauffeur", content: "Permis en cours." },
      ],
    });
    expect(terms.flatMap((term) => term.penalties.map((row) => row.value))).toContain(
      "Absence soudeur : اليوم 1: 2 % · اليوم 3: 5 %",
    );
    expect(terms.map((term) => term.title)).toContain("البند 8 — Hygiène");
    expect(terms.map((term) => term.id)).not.toContain("drive");
    expect(terms.map((term) => term.id)).not.toContain("parts");
  });

  it("writes the adopted clause with its article number and the contract's own sentence", () => {
    const wording =
      "L'absence d'un technicien sera sanctionnée par une retenue de cinq pour cent (5%) par journée d'absence.";
    const penalties = describedPenalties([
      penalty({ article_ref: "Art. 17.2", statement: wording, grace_hours: 72 }),
    ]);
    const terms = workerTerms({
      poste: "Technicien HVAC",
      labor: [{ id: "t", designation: "Technicien HVAC", unit: "JOUR" }],
      penalties,
      clauses: [],
    });
    expect(terms).toEqual([
      {
        id: "p1",
        title: "البند Art. 17.2 — Absence Techniciens",
        value: wording,
        articleRef: "Art. 17.2",
        penalties: [
          {
            id: "p1-penalty",
            name: "الغياب",
            value: "Absence Techniciens · بعد 72 ساعة : 5 % par jour",
            amount: "",
          },
        ],
      },
    ]);
    const withExtra = terms.map((term) => ({
      ...term,
      penalties: [
        ...term.penalties,
        { id: "empty", name: "", value: "", amount: "" },
        { id: "fault", name: "ارتكاب خطأ", value: "5 %", amount: "4 500 دج" },
      ],
    }));
    const stored = storedFromWorkerTerms({
      clientContractId: "cc",
      contractNumber: "I/111/HMD-DEG/2024",
      poste: "Technicien HVAC",
      terms: withExtra,
      absenceIds: new Set(["p1"]),
    });
    const html = appendClientTerms("<html><body>contrat</body></html>", stored);
    expect(html).toContain("البند Art. 17.2 — Absence Techniciens");
    expect(html).toContain(wording);
    expect(html).toContain("عقوبة الغياب: Absence Techniciens · بعد 72 ساعة : 5 % par jour");
    expect(html).toContain("عقوبة ارتكاب خطأ: 5 %، أي ما يعادل 4 500 دج");
    expect(stored.penalties.map((row) => row.id)).toEqual(["p1-penalty", "fault"]);
    expect(
      absenceEquivalentAmount([
        { name: "ارتكاب خطأ", amount: "9 000 دج" },
        { name: "الغياب", amount: "4 500 دج" },
      ]),
    ).toBe("4 500 دج");
    expect(absenceEquivalentAmount([{ name: "الغياب", amount: "" }])).toBe("");
    const cited = citePenaltyRules(
      [penalty({ id: "tech", code: "TECH_ABSENCE", label: "Absence Techniciens" })],
      [
        {
          code: "",
          label: "Absence technicien supérieur, technicien ou agent frigorifique",
          article: "Art. 17.2",
          statement: wording,
        },
      ],
    );
    expect(cited[0]).toMatchObject({ article_ref: "Art. 17.2", statement: wording });
  });
});
