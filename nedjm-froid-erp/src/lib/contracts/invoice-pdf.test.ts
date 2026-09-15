import { describe, expect, it } from "vitest";
import {
  buildInvoicePdf,
  invoicePdfFilename,
} from "@/lib/contracts/invoice-pdf";
import { elGassiDefaultAttributes } from "@/lib/contracts/attributes-schema";

describe("invoicePdfFilename", () => {
  it("sanitizes invoice numbers for filesystem", () => {
    expect(invoicePdfFilename("FAC/I/111/HMD-DEG/2024/2026/001")).toBe(
      "Facture_FAC-I-111-HMD-DEG-2024-2026-001.pdf",
    );
  });
});

describe("buildInvoicePdf", () => {
  it("produces a non-empty PDF buffer with %PDF header", async () => {
    const attrs = elGassiDefaultAttributes();
    const pdf = await buildInvoicePdf({
      invoice_number: "FAC/TEST/2026/001",
      invoice_date: "2026-09-14",
      status: "EMISE",
      note: "Smoke PDF phase 6",
      total_ht: 10000,
      tva_rate: 0,
      tva_amount: 0,
      total_ttc: 10000,
      tax_mode: "EXEMPT",
      tax_breakdown: [{ rate: 0, base_ht: 10000, tax_amount: 0 }],
      exemption_certificate_number: "EXO-001",
      exemption_certificate_date: "2026-09-01",
      exemption_note: null,
      lines: [
        {
          item_code: "MO-01",
          designation: "Intervention technicien",
          unit: "JOUR",
          quantity: 2,
          unit_price_ht: 5000,
          total_price_ht: 10000,
          tax_rate: 0,
          tax_amount: 0,
        },
      ],
      contract_number: "I/111/HMD-DEG/2024",
      client_name: "SONATRACH - Direction El Gassi",
      site_name: "Hassi Messaoud",
      issuer: {
        ...attrs.issuer,
        legal_name: "NEDJM FROID SARL",
        address: "Zone industrielle",
        city: "Ouargla",
        nif: "000000000000000",
        rc: "00/00-0000000B00",
      },
      tva_exempt: true,
      tva_articles: ["12", "16"],
    });

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.byteLength).toBeGreaterThan(500);
    expect(pdf.subarray(0, 4).toString("utf8")).toBe("%PDF");
  });

  it("marks cancelled invoices without inventing issuer legal IDs", async () => {
    const attrs = elGassiDefaultAttributes();
    const pdf = await buildInvoicePdf({
      invoice_number: "FAC/ANN/001",
      invoice_date: "2026-01-01",
      status: "ANNULEE",
      note: null,
      total_ht: 7800,
      tva_rate: 0,
      tva_amount: 0,
      total_ttc: 7800,
      tax_mode: "EXEMPT",
      tax_breakdown: [{ rate: 0, base_ht: 7800, tax_amount: 0 }],
      exemption_certificate_number: null,
      exemption_certificate_date: null,
      exemption_note: null,
      lines: [
        {
          item_code: "SP-1",
          designation: "Filtre",
          unit: "U",
          quantity: 1,
          unit_price_ht: 7800,
          total_price_ht: 7800,
          tax_rate: 0,
          tax_amount: 0,
        },
      ],
      contract_number: "I/111/HMD-DEG/2024",
      client_name: "Client Test",
      site_name: null,
      issuer: attrs.issuer,
      tva_exempt: true,
      tva_articles: [],
    });
    const body = pdf.toString("latin1");
    expect(body.includes("%PDF")).toBe(true);
    expect(body).not.toMatch(/NIF 00/);
  });
});
