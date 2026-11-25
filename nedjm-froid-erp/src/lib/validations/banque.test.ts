import { describe, expect, it } from "vitest";
import { banqueImportSchema, banqueLineSchema, banqueVirementSchema } from "@/lib/validations/banque";

const accountId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";

describe("banque validations", () => {
  it("accepts a sheet-style debit operation", () => {
    const result = banqueLineSchema.safeParse({
      account_id: accountId,
      op_date: "2026-11-15",
      libelle: "Encaissement client",
      debit: "1500.50",
      credit: 0,
      frais: 0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts null optional labels and urls from the UI", () => {
    const result = banqueLineSchema.safeParse({
      account_id: accountId,
      op_date: "2026-11-15",
      affectation: null,
      libelle: "Encaissement client",
      debit: 100,
      credit: 0,
      frais: 0,
      bc_label: null,
      bc_url: null,
      mode_label: null,
      mode_url: null,
      fac_label: null,
      fac_url: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.affectation).toBe("");
      expect(result.data.bc_url).toBeNull();
      expect(result.data.mode_url).toBeNull();
      expect(result.data.fac_url).toBeNull();
    }
  });

  it("rejects debit and credit together", () => {
    const result = banqueLineSchema.safeParse({
      account_id: accountId,
      op_date: "2026-11-15",
      libelle: "Invalid",
      debit: 10,
      credit: 5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects identical virement accounts", () => {
    const result = banqueVirementSchema.safeParse({
      from_account_id: accountId,
      to_account_id: accountId,
      amount: 100,
      op_date: "2026-11-15",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a releve import payload", () => {
    const result = banqueImportSchema.safeParse({
      account_id: accountId,
      rows: [{ dateOp: "2026-11-01", libelle: "VIR", debit: 0, credit: 200 }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a cross-bank virement", () => {
    const result = banqueVirementSchema.safeParse({
      from_account_id: accountId,
      to_account_id: otherId,
      amount: 100,
      op_date: "2026-11-15",
    });
    expect(result.success).toBe(true);
  });
});
