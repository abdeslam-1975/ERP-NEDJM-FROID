import { describe, expect, it } from "vitest";
import { evaluateBonMatch, extractBonFields } from "@/lib/caisse/bon-check";

describe("extractBonFields", () => {
  it("reads FR date and labeled total", () => {
    const text = `
      FACTURE N° 12
      Date : 15/01/2026
      TOTAL TTC : 12 450,75
    `;
    const fields = extractBonFields(text);
    expect(fields.preferredDate).toBe("2026-01-15");
    expect(fields.preferredAmount).toBe(12450.75);
  });

  it("falls back to largest amount when no label", () => {
    const text = `Article 200,00\nAutre 3500,50\n`;
    const fields = extractBonFields(text);
    expect(fields.preferredAmount).toBe(3500.5);
  });
});

describe("evaluateBonMatch", () => {
  it("marks ok when date and amount match", () => {
    const result = evaluateBonMatch({
      opDate: "2026-01-15",
      opAmount: 12450.75,
      detectedDate: "2026-01-15",
      detectedAmount: 12450.75,
    });
    expect(result.status).toBe("ok");
  });

  it("warns on amount mismatch without blocking semantics", () => {
    const result = evaluateBonMatch({
      opDate: "2026-01-15",
      opAmount: 1000,
      detectedDate: "2026-01-15",
      detectedAmount: 1200,
    });
    expect(result.status).toBe("warn");
    expect(result.amountMatch).toBe(false);
    expect(result.dateMatch).toBe(true);
  });

  it("accepts amount among candidates", () => {
    const result = evaluateBonMatch({
      opDate: "2026-01-10",
      opAmount: 500,
      detectedDate: "2026-01-10",
      detectedAmount: 1200,
      candidateAmounts: [200, 500, 1200],
    });
    expect(result.status).toBe("ok");
  });

  it("returns unknown when nothing detected", () => {
    const result = evaluateBonMatch({
      opDate: "2026-01-15",
      opAmount: 100,
      detectedDate: null,
      detectedAmount: null,
    });
    expect(result.status).toBe("unknown");
  });
});
