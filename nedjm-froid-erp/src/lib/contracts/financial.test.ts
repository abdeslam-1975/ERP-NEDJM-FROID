import { describe, expect, it } from "vitest";
import {
  cautionFromRate,
  cautionRateFromAmount,
  contractDurationDays,
  lineTotal,
  resolveCaution,
  resolveTotalHt,
  round2,
  sumItemsHt,
} from "@/lib/contracts/financial";

describe("contractDurationDays", () => {
  it("counts inclusive calendar days", () => {
    expect(contractDurationDays("2024-01-01", "2024-01-01")).toBe(1);
    expect(contractDurationDays("2024-01-01", "2024-01-31")).toBe(31);
  });

  it("returns 0 for inverted or invalid ranges", () => {
    expect(contractDurationDays("2024-02-01", "2024-01-01")).toBe(0);
    expect(contractDurationDays("bad", "2024-01-01")).toBe(0);
  });
});

describe("lineTotal / sumItemsHt / round2", () => {
  it("rounds line totals to 2 decimals", () => {
    expect(lineTotal(3, 10.005)).toBe(30.02);
    expect(round2(1.005)).toBe(1.01);
  });

  it("sums item HT preferring total_price_ht", () => {
    expect(
      sumItemsHt([
        { total_price_ht: 100 },
        { total_price_ht: 50.55, quantity: 999, unit_price_ht: 1 },
      ]),
    ).toBe(150.55);
  });
});

describe("resolveTotalHt", () => {
  it("AUTO = labor + spares", () => {
    expect(
      resolveTotalHt({
        mode: "AUTO",
        manualTotal: 999999,
        laborHt: 232_600,
        spareHt: 1_000,
      }),
    ).toBe(233_600);
  });

  it("MANUAL keeps manual total", () => {
    expect(
      resolveTotalHt({
        mode: "MANUAL",
        manualTotal: 500_000,
        laborHt: 1,
        spareHt: 1,
      }),
    ).toBe(500_000);
  });
});

describe("caution sync", () => {
  it("FROM_RATE recalculates DA when HT changes", () => {
    expect(cautionFromRate(1_000_000, 0.02)).toBe(20_000);
    expect(
      resolveCaution({
        sync: "FROM_RATE",
        totalHt: 233_600,
        rate: 0.02,
        amount: 0,
      }),
    ).toEqual({ rate: 0.02, amount: 4_672 });
  });

  it("FROM_AMOUNT derives rate from DA", () => {
    expect(cautionRateFromAmount(100_000, 2_500)).toBe(0.025);
    expect(
      resolveCaution({
        sync: "FROM_AMOUNT",
        totalHt: 100_000,
        rate: 0,
        amount: 2_500,
      }),
    ).toEqual({ rate: 0.025, amount: 2_500 });
  });

  it("MANUAL keeps both values", () => {
    expect(
      resolveCaution({
        sync: "MANUAL",
        totalHt: 100_000,
        rate: 0.03,
        amount: 1_111,
      }),
    ).toEqual({ rate: 0.03, amount: 1_111 });
  });
});
