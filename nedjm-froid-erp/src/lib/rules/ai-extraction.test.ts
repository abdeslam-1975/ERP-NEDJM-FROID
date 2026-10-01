import { describe, expect, it } from "vitest";
import {
  aiPathCanAnalyze,
  aiPathLabel,
  coherenceWarnings,
  excerptNumbers,
  foldText,
  isAiTypeAllowed,
  legalAiResultSchema,
  normalizeExcerpt,
  numberInExcerpt,
  parseAiExtraction,
  payloadInExcerpt,
  suggestionValueText,
  toSaveSuggestions,
  type AiTargets,
} from "@/lib/rules/ai-extraction";

const targets: AiTargets = {
  vars: [
    { id: "v1", key: "CNAS_EMPLOYEE", label: "CNAS salarié", fraction: true, current: 0.09 },
    { id: "v2", key: "SNMG", label: "SNMG", fraction: false, current: 20000 },
  ],
  regimes: [{ id: "r1", code: "GEN", label: "Régime général", employee_pct: 9, employer_pct: 26, fos_pct: 0.5 }],
  zones: [{ code: "SUD", label: "Sud" }],
  wilayas: [
    { code: "01", name_fr: "Adrar" },
    { code: "33", name_fr: "Illizi" },
    { code: "47", name_fr: "Ghardaïa" },
  ],
};
const wilayaNames = new Map(targets.wilayas.map((w) => [w.code, w.name_fr]));

describe("excerpt numbers (mirror of ref_ai_excerpt_numbers)", () => {
  it("normalizes Arabic-Indic digits, the Arabic decimal sign and thin spaces", () => {
    expect(normalizeExcerpt("٢٤٠٠٠ دج")).toBe("24000 دج");
    expect(normalizeExcerpt("١٢٫٢١ %")).toBe("12,21 %");
    expect(normalizeExcerpt("24\u202F000")).toBe("24 000");
  });

  it("reads grouped thousands and both readings of an ambiguous separator", () => {
    expect(excerptNumbers("24 000 DA")).toEqual([24000]);
    expect(excerptNumbers("24.000 DA")).toEqual([24000, 24]);
    expect(excerptNumbers("24,000")).toEqual([24, 24000]);
    expect(excerptNumbers("12,21 %")).toEqual([12.21]);
    expect(excerptNumbers("1 234 567,50")).toEqual([1234567.5]);
  });

  it("does not glue a year or an article number into a thousands group", () => {
    expect(excerptNumbers("1.2345")).toEqual([1.2345]);
    expect(excerptNumbers("article 12 2024")).toEqual([12, 2024]);
  });

  it("accepts a fraction written as a percentage", () => {
    expect(numberInExcerpt(0.09, "taux de 9 % à la charge du salarié")).toBe(true);
    expect(numberInExcerpt(0.1221, "fixé à 12,21 %")).toBe(true);
    expect(numberInExcerpt(24000, "est fixé à ٢٤.٠٠٠ دج")).toBe(true);
    expect(numberInExcerpt(0.09, "taux de 9,5 %")).toBe(false);
    expect(numberInExcerpt(null, "9 %")).toBe(false);
  });

  it("folds accents, apostrophes and case", () => {
    expect(foldText("  GHARDAÏA, M'Sila  ")).toBe("ghardaia, m sila");
  });
});

describe("blocking excerpt check (mirror of ref_ai_payload_in_excerpt)", () => {
  it("legal variable: the value must be written", () => {
    expect(payloadInExcerpt("LEGAL_VAR", { value: 24000 }, "Le SNMG est fixé à 24.000 DA", wilayaNames)).toBe(true);
    expect(payloadInExcerpt("LEGAL_VAR", { value: 25000 }, "Le SNMG est fixé à 24.000 DA", wilayaNames)).toBe(false);
    expect(payloadInExcerpt("LEGAL_VAR", { value: 24000 }, "", wilayaNames)).toBe(false);
  });

  it("CNAS rates: every written rate, at least one", () => {
    const ex = "Taux : 9 % salarié, 26 % employeur.";
    expect(payloadInExcerpt("CNAS_RATES", { employee_pct: 9, employer_pct: 26, fos_pct: null }, ex, wilayaNames)).toBe(true);
    expect(payloadInExcerpt("CNAS_RATES", { employee_pct: 9, employer_pct: 25, fos_pct: null }, ex, wilayaNames)).toBe(false);
    expect(payloadInExcerpt("CNAS_RATES", { employee_pct: null, employer_pct: null, fos_pct: null }, ex, wilayaNames)).toBe(false);
  });

  it("zone: each wilaya name must appear (codes are not enough)", () => {
    const ex = "Les wilayas d'Adrar, d'Illizi et de Ghardaia.";
    expect(payloadInExcerpt("IRG_ZONE_SCOPE", { wilayas: ["01", "33", "47"] }, ex, wilayaNames)).toBe(true);
    expect(payloadInExcerpt("IRG_ZONE_SCOPE", { wilayas: ["01", "16"] }, ex, wilayaNames)).toBe(false);
    expect(payloadInExcerpt("IRG_ZONE_SCOPE", { wilayas: ["33"] }, "wilaya 33", wilayaNames)).toBe(false);
  });

  it("IRG scale: rates and bounds are all written", () => {
    const ex = "de 0 à 30 000 DA : 0 % ; de 30 001 à 120 000 : 23 % ; au-delà : 35 %";
    const brackets = [
      { from: 0, to: 30000, rate: 0 },
      { from: 30001, to: 120000, rate: 23 },
      { from: 120001, to: null, rate: 35 },
    ];
    expect(payloadInExcerpt("IRG_BAREME", { brackets }, ex, wilayaNames)).toBe(false);
    expect(payloadInExcerpt("IRG_BAREME", { brackets: brackets.slice(0, 2) }, ex, wilayaNames)).toBe(true);
  });
});

describe("entry path", () => {
  it("only official texts and the AI paths allow an analysis", () => {
    expect(isAiTypeAllowed("DECRET_EXECUTIF")).toBe(true);
    expect(isAiTypeAllowed("CONVENTION")).toBe(false);
    expect(isAiTypeAllowed("NOTE")).toBe(false);
    expect(aiPathCanAnalyze("AI_ALLOWED")).toBe(true);
    expect(aiPathCanAnalyze("D15_AI")).toBe(true);
    for (const p of ["MANUAL", "TYPE_EXCLUDED", "D15_PENDING", "D15_UNDECIDED", "D15_MANUAL", "NOT_ACTIVE", null]) {
      expect(aiPathCanAnalyze(p)).toBe(false);
    }
    expect(aiPathLabel("D15_UNDECIDED")).toMatch(/D15/);
  });
});

describe("Gemini answer", () => {
  const raw = {
    document: { reference: "LF 2026", title: null, publication_date: null, effective_date: "2026-01-01", readable: true, quality_notes: null },
    issues: [{ kind: "OCR", text: "Page 3 floue" }, { kind: "WEIRD", text: "x" }, { kind: "OTHER", text: "" }],
    suggestions: [
      { kind: "LEGAL_VAR", target_code: "snmg", value: 24000, excerpt: " Le SNMG est fixé à 24.000 DA ", confidence: "HIGH", effective_date: "2026-01-01", page: 4 },
      { kind: "IRG_ZONE_SCOPE", target_code: "SUD", wilayas: ["1", "33", "99"], excerpt: "Adrar, Illizi", confidence: "SURE" },
      { kind: "FORMULA", value: 1 },
      { kind: "IRG_BAREME", brackets: [{ from: 0, to: 30000, rate: 0 }, { from: 30001, to: null, rate: 23 }], excerpt: "..." },
    ],
  };

  it("parses leniently and drops unknown kinds", () => {
    const r = legalAiResultSchema.parse(raw);
    expect(r.issues).toEqual([
      { kind: "OCR", text: "Page 3 floue" },
      { kind: "OTHER", text: "x" },
    ]);
    expect(r.suggestions.map((s) => s.kind)).toEqual(["LEGAL_VAR", "IRG_ZONE_SCOPE", "IRG_BAREME"]);
    expect(r.suggestions[1].confidence).toBe("LOW");
    expect(legalAiResultSchema.parse({}).suggestions).toEqual([]);
  });

  it("maps to stored suggestions: payload per kind, known wilayas only, uppercase variable key", () => {
    const s = toSaveSuggestions(legalAiResultSchema.parse(raw), { targets, appliesFrom: "2026-01-01" });
    expect(s[0]).toMatchObject({ kind: "LEGAL_VAR", target_code: "SNMG", payload: { value: 24000 }, page: 4, excerpt: "Le SNMG est fixé à 24.000 DA" });
    expect(s[1].payload).toEqual({ wilayas: ["01", "33"] });
    expect(s[1].warnings.join(" ")).toMatch(/Date d'effet non indiquée/);
    expect(s[2].payload).toEqual({ brackets: [{ from: 0, to: 30000, rate: 0 }, { from: 30001, to: null, rate: 23 }] });
  });
});

describe("coherence warnings (never blocking)", () => {
  const ctx = { targets, appliesFrom: "2026-01-01" };

  it("flags a percentage entered for a fraction variable", () => {
    const w = coherenceWarnings({ kind: "LEGAL_VAR", target_code: "CNAS_EMPLOYEE", payload: { value: 9 }, effective_date: "2026-01-01" }, ctx);
    expect(w.join(" ")).toMatch(/fraction/);
  });

  it("flags an unchanged value and a large gap", () => {
    expect(
      coherenceWarnings({ kind: "LEGAL_VAR", target_code: "SNMG", payload: { value: 20000 }, effective_date: "2026-01-01" }, ctx),
    ).toContain("Identique à la valeur en vigueur.");
    expect(
      coherenceWarnings({ kind: "LEGAL_VAR", target_code: "SNMG", payload: { value: 40000 }, effective_date: "2026-01-01" }, ctx).join(" "),
    ).toMatch(/Écart important/);
  });

  it("flags a date before the document's application", () => {
    const w = coherenceWarnings({ kind: "LEGAL_VAR", target_code: "SNMG", payload: { value: 24000 }, effective_date: "2025-06-01" }, ctx);
    expect(w.join(" ")).toMatch(/antérieure/);
  });

  it("checks the continuity of an IRG scale", () => {
    const w = coherenceWarnings(
      {
        kind: "IRG_BAREME",
        target_code: null,
        payload: { brackets: [{ from: 0, to: 30000, rate: 23 }, { from: 50000, to: 80000, rate: 10 }] },
        effective_date: "2026-01-01",
      },
      ctx,
    ).join(" ");
    expect(w).toMatch(/non contiguës/);
    expect(w).toMatch(/inférieur/);
    expect(w).toMatch(/tranche ouverte/);
  });
});

describe("stored rows", () => {
  it("parses an extraction and its suggestions, sorted", () => {
    const e = parseAiExtraction(
      { id: "e1", document_id: "d1", root_id: "d1", model: "m", status: "OPEN", issues: [{ kind: "MISSING", text: "date" }], creator: [{ full_name: "SA" }] },
      [
        { id: "s2", seq: 2, kind: "CNAS_RATES", payload: { employee_pct: 9 }, confidence: "MEDIUM", excerpt_match: true },
        { id: "s1", seq: 1, kind: "LEGAL_VAR", payload: { value: 0.09 }, confidence: "HIGH", status: "CONVERTED", proposal_id: "p1" },
        { seq: 3 },
      ],
    );
    expect(e?.created_by_name).toBe("SA");
    expect(e?.issues).toEqual([{ kind: "MISSING", text: "date" }]);
    expect(e?.suggestions.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(e?.suggestions[0]).toMatchObject({ status: "CONVERTED", proposal_id: "p1", excerpt_match: false });
    expect(parseAiExtraction(null, [])).toBeNull();
  });

  it("shows values in the screen's unit", () => {
    expect(suggestionValueText({ kind: "LEGAL_VAR", payload: { value: 0.09 } }, true)).toBe("9 % (0,09)");
    expect(suggestionValueText({ kind: "CNAS_RATES", payload: { employee_pct: 9, fos_pct: null } }, false)).toBe(
      "salarié 9 % · employeur non écrit · FOS non écrit",
    );
  });
});
