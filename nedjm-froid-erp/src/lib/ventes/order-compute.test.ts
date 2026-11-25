import { describe, expect, it } from "vitest";
import { computeOrderLineHt, computeOrderTotals } from "@/lib/ventes/order-compute";

describe("order-compute (Bon de commande)", () => {
  it("computes line HT with pose", () => {
    expect(computeOrderLineHt({ qty: 2, unit_price_ht: 100, pose_price_ht: 50 }, true)).toBe(300);
    expect(computeOrderLineHt({ qty: 2, unit_price_ht: 100, pose_price_ht: 50 }, false)).toBe(200);
  });

  it("applies remise then TVA then R.G then timbre like Excel Formulaire2", () => {
    const totals = computeOrderTotals({
      has_pose: false,
      tax_rate: 0.19,
      discount_amount: 1000,
      retention_rate: 0.05,
      stamp_amount: 50,
      lines: [
        { qty: 10, unit_price_ht: 1000 },
        { qty: 5, unit_price_ht: 200 },
      ],
    });
    // HT = 10000 + 1000 = 11000; remise 1000 → 10000; TVA 1900; TTC 11900
    // R.G 5% = 595; Net = 11900 - 595 + 50 = 11355
    expect(totals.total_ht).toBe(11000);
    expect(totals.discount_amount).toBe(1000);
    expect(totals.total_ht_net).toBe(10000);
    expect(totals.total_tva).toBe(1900);
    expect(totals.total_ttc).toBe(11900);
    expect(totals.retention_amount).toBe(595);
    expect(totals.stamp_amount).toBe(50);
    expect(totals.net_payable).toBe(11355);
  });

  it("caps remise at total HT", () => {
    const totals = computeOrderTotals({
      has_pose: false,
      tax_rate: 0,
      discount_amount: 99999,
      retention_rate: 0,
      stamp_amount: 0,
      lines: [{ qty: 1, unit_price_ht: 500 }],
    });
    expect(totals.discount_amount).toBe(500);
    expect(totals.total_ht_net).toBe(0);
    expect(totals.net_payable).toBe(0);
  });
});
