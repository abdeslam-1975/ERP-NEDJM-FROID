import { describe, expect, it } from "vitest";
import {
  proformaSchema,
  situationTypeSchema,
  stampRuleSchema,
  supplierSchema,
} from "@/lib/validations/purchases";

describe("purchasing validations", () => {
  it("normalizes a supplier code and optional fields", () => {
    const parsed = supplierSchema.parse({
      code: " four-01 ",
      legal_name: "Fournisseur Test",
      email: "",
      payment_terms_days: "30",
    });
    expect(parsed.code).toBe("FOUR-01");
    expect(parsed.email).toBeNull();
    expect(parsed.payment_terms_days).toBe(30);
  });

  it("requires a situation to contain supply or installation", () => {
    const parsed = situationTypeSchema.safeParse({
      code: "EMPTY",
      label_fr: "Vide",
      includes_supply: false,
      includes_installation: false,
    });
    expect(parsed.success).toBe(false);
  });

  it("validates configurable legal stamp brackets", () => {
    const parsed = stampRuleSchema.parse({
      code: "TIMBRE_2026",
      label_fr: "Timbre légal",
      calculation_mode: "BRACKETS",
      calculation_base: "TTC",
      brackets: [{ from: 0, to: 10000, amount: 100 }],
    });
    expect(parsed.brackets[0]?.amount).toBe(100);
  });

  it("requires split supply or installation price on each proforma line", () => {
    const parsed = proformaSchema.safeParse({
      supplier_id: "11111111-1111-4111-8111-111111111111",
      proforma_number: "",
      proforma_date: "2026-09-15",
      currency_code: "DZD",
      attachment_url: "",
      lines: [{
        item_code: "A1",
        designation: "Article",
        unit: "U",
        quantity: 1,
        supply_unit_price_ht: 0,
        installation_unit_price_ht: 0,
      }],
    });
    expect(parsed.success).toBe(false);
  });
});
