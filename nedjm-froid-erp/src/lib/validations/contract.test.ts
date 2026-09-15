import { describe, expect, it } from "vitest";
import {
  canvaImportSchema,
  contractItemSchema,
  contractUpsertSchema,
} from "@/lib/validations/contract";

const siteId = "11111111-1111-4111-8111-111111111111";
const contractId = "22222222-2222-4222-8222-222222222222";

describe("contractUpsertSchema", () => {
  it("accepts valid AUTO contract payload", () => {
    const parsed = contractUpsertSchema.safeParse({
      contract_number: "I/111/HMD-DEG/2024",
      client_name: "SONATRACH",
      site_id: siteId,
      start_date: "2024-01-01",
      end_date: "2024-12-31",
      ods_date: "",
      total_amount_ht: 0,
      caution_rate: 0.02,
      caution_amount: 0,
      status: "BROUILLON",
      total_mode: "AUTO",
      caution_sync: "FROM_RATE",
      tva_exempt: true,
      tva_articles: "12,16",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.ods_date).toBeNull();
      expect(parsed.data.total_mode).toBe("AUTO");
    }
  });

  it("rejects end_date before start_date", () => {
    const parsed = contractUpsertSchema.safeParse({
      contract_number: "X",
      client_name: "Client",
      site_id: siteId,
      start_date: "2024-06-01",
      end_date: "2024-01-01",
      total_amount_ht: 0,
      caution_rate: 0.02,
      caution_amount: 0,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("contractItemSchema", () => {
  it("uppercases item_code", () => {
    const parsed = contractItemSchema.safeParse({
      contract_id: contractId,
      item_type: "LABOR",
      item_code: "lab-01",
      designation: "Technicien",
      unit: "JOUR",
      quantity: 1,
      unit_price_ht: 17500,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.item_code).toBe("LAB-01");
  });
});

describe("canvaImportSchema", () => {
  it("accepts REPLACE payload with labor + spares", () => {
    const parsed = canvaImportSchema.safeParse({
      contract_id: contractId,
      labor: [
        {
          item_code: "L1",
          designation: "Chef",
          unit: "JOUR",
          quantity: 1,
          unit_price_ht: 25000,
        },
      ],
      spares: [
        {
          item_code: "S1",
          designation: "Filtre",
          quantity: 2,
          unit_price_ht: 1000,
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });
});
