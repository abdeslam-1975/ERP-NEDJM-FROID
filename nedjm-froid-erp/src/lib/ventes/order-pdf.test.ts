import { describe, expect, it } from "vitest";
import { buildSalesOrderPdf, salesOrderPdfFilename } from "@/lib/ventes/order-pdf";

describe("sales order PDF", () => {
  it("builds a non-empty PDF buffer", async () => {
    const pdf = await buildSalesOrderPdf({
      order_number: "BC/2026/00001",
      order_date: "2026-03-15",
      payment_terms: "30 jours",
      delivery_delay: "15 jours",
      buyer_name: "Acheteur test",
      established_by: "Commercial",
      contract_ref: "C-001",
      note: null,
      status: "EMIS",
      has_pose: true,
      client: {
        legal_name: "Client Demo",
        address: "Sétif",
        nif: "123",
        article: "A1",
        rc: "RC1",
        phone: "036000000",
      },
      issuer: { legal_name: "NEDJM FROID", address: null, city: null, phone: null, nif: null, rc: null },
      lines: [
        {
          item_code: "10",
          designation: "Pompe",
          unit: "U",
          quantity: 2,
          unit_price_ht: 1000,
          pose_price_ht: 200,
          line_ht: 2400,
        },
      ],
      tax_rate: 0.19,
      discount_amount: 0,
      total_ht: 2400,
      total_ht_net: 2400,
      total_tva: 456,
      total_ttc: 2856,
      retention_amount: 0,
      stamp_amount: 0,
      net_payable: 2856,
      amount_in_words: null,
    });
    expect(pdf.length).toBeGreaterThan(500);
    expect(pdf.subarray(0, 4).toString("utf8")).toBe("%PDF");
  });

  it("sanitizes filename", () => {
    expect(salesOrderPdfFilename("BC/2026/00001")).toBe("Bon_de_commande_BC-2026-00001.pdf");
  });
});
