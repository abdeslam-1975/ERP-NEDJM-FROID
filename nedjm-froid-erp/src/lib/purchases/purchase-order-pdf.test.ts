import { describe, expect, it } from "vitest";
import {
  buildPurchaseOrderPdf,
  purchaseOrderPdfFilename,
} from "@/lib/purchases/purchase-order-pdf";

describe("purchase order PDF", () => {
  it("builds a printable BC with split supply and installation prices", async () => {
    const pdf = await buildPurchaseOrderPdf({
      order_number: "BC/2026/00001",
      order_date: "2026-09-15",
      expected_delivery_date: "2026-09-30",
      delivery_address: "Hassi Messaoud",
      payment_terms: "30 jours",
      note: null,
      status: "APPROVED",
      issuer: { legal_name: "NEDJM FROID", nif: "123", rc: "456", footer: "Bon pour accord" },
      supplier: {
        legal_name: "Fournisseur Test",
        address: "Zone industrielle",
        city: "Ouargla",
        phone: null,
        nif: "789",
        rc: "101",
      },
      lines: [{
        item_code: "ART-1",
        designation: "Fourniture et pose",
        unit: "U",
        quantity: 2,
        supply_unit_price_ht: 1000,
        installation_unit_price_ht: 500,
        total_ht: 3000,
        tax_rate: 0.19,
        tax_amount: 570,
      }],
      total_ht: 3000,
      total_tva: 570,
      total_ttc: 3570,
    });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.byteLength).toBeGreaterThan(500);
  });

  it("sanitizes the order number", () => {
    expect(purchaseOrderPdfFilename("BC/2026/00001")).toBe("Bon_de_commande_BC-2026-00001.pdf");
  });
});
