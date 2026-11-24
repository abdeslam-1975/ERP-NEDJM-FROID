import { describe, expect, it } from "vitest";
import { salInvoiceSaveSchema } from "./ventes";

describe("salInvoiceSaveSchema", () => {
  it("accepts a P invoice draft", () => {
    const parsed = salInvoiceSaveSchema.safeParse({
      doc_kind: "P",
      issue_date: "2025-01-15",
      client_id: "11111111-1111-4111-8111-111111111111",
      client_name: "Sonatrach",
      tax_rate: 0,
      retention_rate: 0.1,
      stamp_amount: 0,
      issue: false,
      lines: [{ designation: "MO", qty: 10, unit_price_ht: 1000 }],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects RG in M3", () => {
    const parsed = salInvoiceSaveSchema.safeParse({
      doc_kind: "RG",
      issue_date: "2025-01-15",
      client_id: "11111111-1111-4111-8111-111111111111",
      client_name: "Sonatrach",
      lines: [{ designation: "RG", qty: 1, source_amount: 1000 }],
    });
    expect(parsed.success).toBe(false);
  });
});
