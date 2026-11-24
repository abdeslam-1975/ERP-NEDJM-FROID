import { describe, expect, it } from "vitest";
import { computeInvoiceTotals, computeLineHt } from "./compute";

describe("ventes compute", () => {
  it("computes P / FP / SIT lines", () => {
    expect(computeLineHt("P", { designation: "a", qty: 2, unit_price_ht: 100, pose_price_ht: 0 })).toBe(200);
    expect(
      computeLineHt("FP", { designation: "a", qty: 2, unit_price_ht: 100, pose_price_ht: 50 }),
    ).toBe(300);
    expect(
      computeLineHt("SIT", { designation: "a", qty: 0, unit_price_ht: 1500, pose_price_ht: 0 }),
    ).toBe(1500);
  });

  it("applies TVA and retention", () => {
    const totals = computeInvoiceTotals({
      doc_kind: "F",
      tax_rate: 0.19,
      retention_rate: 0.1,
      stamp_amount: 0,
      lines: [{ designation: "x", qty: 1, unit_price_ht: 1000, pose_price_ht: 0 }],
    });
    expect(totals.total_ht).toBe(1000);
    expect(totals.total_tva).toBe(190);
    expect(totals.retention_amount).toBe(119);
    expect(totals.net_payable).toBe(1071);
  });
});
