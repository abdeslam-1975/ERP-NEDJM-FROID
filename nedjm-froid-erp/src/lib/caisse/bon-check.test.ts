import { describe, expect, it } from "vitest";
import {
  evaluateBonMatch,
  extractBonFields,
  textMentionsAmount,
} from "@/lib/caisse/bon-check";

const ABISCOM_LIKE = `
ABISCOM
Vente au Comptoir No : VCC26045503
Date : 31/01/2026
Mode de paiement : CASH
Désignation Quantité PU HT Total HT
25-0140 AGRAFEUSE METALLIQUE DE BUREAU 1.00 600.00 600.00
Totaux 600.00
TVA 0.00
Timbre 0.00
NET A PAYER 600,00
SIX CENTS DINARS ET ZERO CENTIMES
`;

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

  it("ignores invoice numbers like VCC26045503 and keeps 600", () => {
    const fields = extractBonFields(ABISCOM_LIKE);
    expect(fields.preferredDate).toBe("2026-01-31");
    expect(fields.preferredAmount).toBe(600);
    expect(fields.amounts).toContain(600);
    expect(fields.amounts).not.toContain(26045503);
  });

  it("falls back to largest plausible amount when no label", () => {
    const text = `Article 200,00\nAutre 3500,50\n`;
    const fields = extractBonFields(text);
    expect(fields.preferredAmount).toBe(3500.5);
  });

  it("keeps TOTAL label readable and picks DA amount", () => {
    const text = `Date : 12/01/2026\nTOTAL TTC : 1 250,00 DA\n`;
    const fields = extractBonFields(text);
    expect(fields.preferredDate).toBe("2026-01-12");
    expect(fields.preferredAmount).toBe(1250);
  });

  it("fixes OCR zero letters inside amounts only", () => {
    const text = `TOTAL\n6OO,OO DA`;
    const fields = extractBonFields(text);
    expect(fields.preferredAmount).toBe(600);
  });

  it("parses European thousands with dot then comma decimals", () => {
    const fields = extractBonFields("NET A PAYER 1.300,00 DA");
    expect(fields.preferredAmount).toBe(1300);
    expect(fields.amounts).toContain(1300);
  });
});

describe("textMentionsAmount", () => {
  it("finds 600,00 even with OCR spacing", () => {
    expect(textMentionsAmount("NET A PAYER\n600,00", 600)).toBe(true);
    expect(textMentionsAmount("total 1 250,50 DA", 1250.5)).toBe(true);
  });

  it("matches amount within 1 DA tolerance via parsed OCR totals", () => {
    expect(textMentionsAmount("TOTAL TTC 1 000,00 DA", 1000)).toBe(true);
    expect(textMentionsAmount("NET 999,50", 1000)).toBe(true);
  });
});

describe("evaluateBonMatch", () => {
  it("marks ok for ABISCOM-like bon vs operation 600 / 31-01-2026", () => {
    const fields = extractBonFields(ABISCOM_LIKE);
    const result = evaluateBonMatch({
      opDate: "2026-01-31",
      opAmount: 600,
      detectedDate: fields.preferredDate,
      detectedAmount: fields.preferredAmount,
      candidateDates: fields.dates,
      candidateAmounts: fields.amounts,
      rawText: fields.rawText,
    });
    expect(result.status).toBe("ok");
    expect(result.dateMatch).toBe(true);
    expect(result.amountMatch).toBe(true);
  });

  it("marks ok when structured parse misses amount but raw text contains it", () => {
    const result = evaluateBonMatch({
      opDate: "2026-01-31",
      opAmount: 600,
      detectedDate: "2026-01-31",
      detectedAmount: 26045503,
      candidateDates: ["2026-01-31"],
      candidateAmounts: [26045503, 1],
      rawText: "Date : 31/01/2026\nNET A PAYER 600,00",
    });
    expect(result.status).toBe("ok");
    expect(result.amountMatch).toBe(true);
  });

  it("uses orange warn when only amount differs", () => {
    const result = evaluateBonMatch({
      opDate: "2026-01-15",
      opAmount: 1000,
      detectedDate: "2026-01-15",
      detectedAmount: 1200,
      rawText: "Date 15/01/2026 total 1200,00",
    });
    expect(result.status).toBe("warn");
    expect(result.amountMatch).toBe(false);
    expect(result.dateMatch).toBe(true);
  });

  it("uses red bad when both date and amount differ", () => {
    const result = evaluateBonMatch({
      opDate: "2026-01-15",
      opAmount: 1000,
      detectedDate: "2026-01-20",
      detectedAmount: 1200,
      candidateDates: ["2026-01-20"],
      candidateAmounts: [1200],
      rawText: "Date 20/01/2026 total 1200,00",
    });
    expect(result.status).toBe("bad");
    expect(result.dateMatch).toBe(false);
    expect(result.amountMatch).toBe(false);
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
