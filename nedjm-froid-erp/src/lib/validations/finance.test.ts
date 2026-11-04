import { describe, expect, it } from "vitest";
import {
  cashAdvanceSettleSchema,
  financeAccountSchema,
  financeMovementSchema,
  financeTaxRateSchema,
} from "@/lib/validations/finance";

const accountId = "11111111-1111-4111-8111-111111111111";

describe("finance validations", () => {
  it("normalizes configurable accounts", () => {
    const result = financeAccountSchema.safeParse({
      code: "caisse-hmd",
      name: "Caisse HMD",
      account_type: "CASH",
      currency_code: "dzd",
      opening_balance: "25000.50",
      opening_date: "2026-09-15",
      allow_negative: false,
      active: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe("CAISSE-HMD");
      expect(result.data.currency_code).toBe("DZD");
      expect(result.data.opening_balance).toBe(25000.5);
    }
  });

  it("accepts multiple UI-defined TVA rates", () => {
    for (const rate of [0, 0.09, 0.19, 0.21]) {
      expect(
        financeTaxRateSchema.safeParse({
          code: `TVA${rate * 100}`,
          label_fr: `TVA ${rate * 100}%`,
          rate,
          active: true,
        }).success,
      ).toBe(true);
    }
  });

  it("rejects non-positive financial movements", () => {
    const result = financeMovementSchema.safeParse({
      account_id: accountId,
      direction: "OUT",
      amount: 0,
      movement_date: "2026-09-15",
      description: "Invalid movement",
    });
    expect(result.success).toBe(false);
  });

  it("allows an exact cash-advance return amount", () => {
    const result = cashAdvanceSettleSchema.safeParse({
      advance_id: accountId,
      return_amount: 3000,
      settlement_date: "2026-09-15",
      note: "Solde",
    });
    expect(result.success).toBe(true);
  });
});

