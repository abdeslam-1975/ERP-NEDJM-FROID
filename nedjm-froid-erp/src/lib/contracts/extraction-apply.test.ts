import { describe, expect, it } from "vitest";
import { elGassiDefaultAttributes } from "@/lib/contracts/attributes-schema";
import {
  applyExtraction,
  parseCautionRate,
  parseLooseNumber,
  type HeaderSnapshot,
} from "@/lib/contracts/extraction-apply";
import { extractionResultSchema, restrictToTargets } from "@/lib/contracts/extraction-schema";

const source = (document = 1, article = "Art. 20") => ({
  document,
  page: 2,
  article,
  excerpt: "extrait",
  confidence: 0.9,
});

const header: HeaderSnapshot = {
  start_date: "2024-01-01",
  end_date: "2026-12-30",
  ods_date: "2024-01-01",
  total_amount_ht: 281195650,
  caution_rate: 0.02,
  total_mode: "AUTO",
};

const result = extractionResultSchema.parse({
  header: {
    start_date: { value: "2024-02-01", source: source() },
    end_date: { value: "2023-01-01", source: source() },
    ods_date: { value: "2024-01-15", source: source() },
    total_amount_ht: { value: "281 195 650,00", source: source() },
    caution_rate: { value: "5 %", source: source() },
  },
  penalties: [
    {
      preset_code: "CHEF_ABSENCE",
      label: "Absence du chef de maintenance",
      mode: "PCT_DAILY",
      rate: 0.12,
      fixed_amount: null,
      grace_hours: 48,
      grace_days: null,
      brackets: [],
      source: source(),
    },
    {
      preset_code: null,
      label: "Non-respect des consignes HSE",
      mode: "FIXED",
      rate: null,
      fixed_amount: 50000,
      grace_hours: null,
      grace_days: null,
      brackets: [],
      source: source(2),
    },
    {
      preset_code: null,
      label: "Retard sans taux",
      mode: "PCT_DAILY",
      rate: null,
      fixed_amount: null,
      grace_hours: null,
      grace_days: null,
      brackets: [],
      source: source(),
    },
    { label: "", mode: "BAD" },
  ],
  penalty_cap: { rate: 0.1, source: source() },
  termination: {
    article_ref: null,
    notice_days: 30,
    cure_days: 8,
    client_convenience: true,
    grounds: ["Manquement grave"],
    financial_consequences: "Caution confisquée.",
    caution_effect: "CONFISQUEE",
    source: source(2, "Art. 25"),
  },
  clauses: [
    {
      category: "FORCE_MAJEURE",
      article_ref: "Art. 27",
      title: "Force majeure",
      content: "Notification sous 48 h.",
      source: source(1),
    },
  ],
  warnings: [],
});

describe("extraction schema", () => {
  it("drops malformed proposals without losing the others", () => {
    expect(result.penalties).toHaveLength(3);
  });

  it("keeps only the requested sections", () => {
    const only = restrictToTargets(result, ["TERMINATION"]);
    expect(only.header).toBeNull();
    expect(only.penalties).toEqual([]);
    expect(only.penalty_cap).toBeNull();
    expect(only.termination?.notice_days).toBe(30);
    expect(only.clauses).toEqual([]);
  });
});

describe("number parsing", () => {
  it("reads French amounts and percentages", () => {
    expect(parseLooseNumber("281 195 650,00")).toBe(281195650);
    expect(parseLooseNumber("281195650.00 DA")).toBe(281195650);
    expect(parseLooseNumber("1,234,567.50")).toBe(1234567.5);
    expect(parseCautionRate("5 %")).toBe(0.05);
    expect(parseCautionRate("0.05")).toBe(0.05);
    expect(parseCautionRate("150")).toBeNull();
  });
});

describe("applyExtraction", () => {
  let n = 0;
  const run = (selection: Parameters<typeof applyExtraction>[0]["selection"]) =>
    applyExtraction({
      attributes: { ...elGassiDefaultAttributes(), daily_rate_ht: 232600 },
      header,
      result,
      selection,
      documentIds: ["doc-a", "doc-b"],
      newId: () => `id-${++n}`,
    });

  it("updates a matching preset, adds a custom penalty and skips an incomplete one", () => {
    const out = run({ header: [], penalties: [0, 1, 2], penalty_cap: true, termination: false, clauses: [] });
    const chef = out.attributes.penalties.presets.find((p) => p.code === "CHEF_ABSENCE");
    expect(chef).toMatchObject({ rate: 0.12, grace_hours: 48, label: "Absence Chef de maintenance" });
    const hse = out.attributes.penalties.custom.find((p) => p.label === "Non-respect des consignes HSE");
    expect(hse).toMatchObject({ mode: "FIXED", fixed_amount: 50000, code: "NON_RESPECT_DES_CONSIGNES_HSE" });
    expect(out.skipped.join(" ")).toContain("Retard sans taux");
    expect(out.attributes.penalties.max_cap_rate).toBe(0.1);
    expect(out.attributes.daily_rate_ht).toBe(232600);
  });

  it("maps termination and clause sources to the uploaded documents", () => {
    const out = run({ header: [], penalties: [], penalty_cap: false, termination: true, clauses: [0] });
    expect(out.attributes.clauses.termination).toMatchObject({
      article_ref: "Art. 25",
      notice_days: 30,
      cure_days: 8,
      client_convenience: true,
      caution_effect: "CONFISQUEE",
      source_document_id: "doc-b",
      source_page: 2,
    });
    expect(out.attributes.clauses.items[0]).toMatchObject({
      category: "FORCE_MAJEURE",
      article_ref: "Art. 27",
      source_document_id: "doc-a",
    });
  });

  it("refuses inverted dates and the HT total in AUTO mode", () => {
    const out = run({
      header: ["start_date", "end_date", "ods_date", "total_amount_ht", "caution_rate"],
      penalties: [],
      penalty_cap: false,
      termination: false,
      clauses: [],
    });
    expect(out.header).toEqual({ ods_date: "2024-01-15", caution_rate: 0.05 });
    expect(out.skipped.join(" ")).toContain("mode AUTO");
    expect(out.skipped.join(" ")).toContain("date de fin");
    expect(out.attributesChanged).toBe(false);
  });
});
