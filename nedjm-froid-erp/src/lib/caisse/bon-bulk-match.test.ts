import { describe, expect, it } from "vitest";
import { matchBonToOperations, type BonAttachTarget } from "@/lib/caisse/bon-bulk-match";

function target(partial: Partial<BonAttachTarget> & Pick<BonAttachTarget, "operationId" | "op" | "date" | "amount">): BonAttachTarget {
  return {
    buyer: "X",
    hasPhoto: false,
    ...partial,
  };
}

describe("matchBonToOperations", () => {
  const rows = [
    target({ operationId: "a", op: 14, date: "2026-01-03", amount: 1000 }),
    target({ operationId: "b", op: 20, date: "2026-01-03", amount: 500 }),
    target({ operationId: "c", op: 21, date: "2026-01-05", amount: 1000, hasPhoto: true }),
    target({ operationId: "d", op: 22, date: "2026-01-10", amount: 600 }),
    target({ operationId: "e", op: 23, date: "2026-01-10", amount: 600 }),
  ];

  it("returns unique when date+amount match one op without photo", () => {
    const result = matchBonToOperations(rows, "2026-01-03", 1000);
    expect(result.status).toBe("unique");
    expect(result.matches[0]?.op).toBe(14);
  });

  it("returns ambiguous when several ops share date+amount", () => {
    const result = matchBonToOperations(rows, "2026-01-10", 600);
    expect(result.status).toBe("ambiguous");
    expect(result.matches).toHaveLength(2);
  });

  it("returns already when only a photographed op matches", () => {
    const result = matchBonToOperations(rows, "2026-01-05", 1000);
    expect(result.status).toBe("already");
    expect(result.matches[0]?.op).toBe(21);
  });

  it("falls back to unique amount when date is missing", () => {
    const result = matchBonToOperations(rows, null, 500);
    expect(result.status).toBe("unique");
    expect(result.matches[0]?.op).toBe(20);
    expect(result.strategy).toBe("amount-only");
  });

  it("does not auto-link unique amount when OCR date contradicts the op", () => {
    const result = matchBonToOperations(rows, "2026-01-20", 500);
    expect(result.status).toBe("ambiguous");
    expect(result.matches[0]?.op).toBe(20);
    expect(result.strategy).toBe("amount-only");
  });

  it("marks amount-only ambiguous when several ops share the amount", () => {
    const result = matchBonToOperations(rows, "2026-01-01", 600);
    expect(result.status).toBe("ambiguous");
    expect(result.strategy).toBe("amount-only");
    expect(result.matches).toHaveLength(2);
  });

  it("uses candidate amounts when preferred amount is wrong", () => {
    const result = matchBonToOperations(rows, "2026-01-03", 999999, {
      candidateAmounts: [999999, 500],
      candidateDates: ["2026-01-03"],
    });
    expect(result.status).toBe("unique");
    expect(result.matches[0]?.op).toBe(20);
  });

  it("matches from raw OCR text when structured parse is weak", () => {
    const result = matchBonToOperations(rows, null, null, {
      rawText: "Facture\nDate : 03/01/2026\nNET A PAYER 500,00 DA",
    });
    expect(result.status).toBe("unique");
    expect(result.matches[0]?.op).toBe(20);
  });

  it("prefers the largest amount when several op amounts appear as line items", () => {
    const result = matchBonToOperations(rows, null, null, {
      rawText: "Ligne 500,00\nAutre 1000,00 DA\nDate 03/01/2026",
    });
    expect(result.status).toBe("unique");
    expect(result.matches[0]?.op).toBe(14);
    expect(result.strategy).toBe("text-amount+date");
  });

  it("returns unreadable when nothing usable is detected", () => {
    expect(matchBonToOperations(rows, null, null).status).toBe("unreadable");
  });
});
