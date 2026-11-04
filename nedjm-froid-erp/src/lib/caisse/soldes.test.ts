import { describe, expect, it } from "vitest";
import { computeSoldesBundle, recomputePeriodFromDates, sheetNameFromIso, type MoneyRow } from "@/lib/caisse/soldes";

function row(partial: Partial<MoneyRow> & Pick<MoneyRow, "type" | "date" | "buyer">): MoneyRow {
  return {
    sheetName: sheetNameFromIso(partial.date),
    isFirst: true,
    op: partial.op ?? 1,
    depenses: null,
    recettes: null,
    total: null,
    ...partial,
  };
}

describe("computeSoldesBundle", () => {
  const openings = { Said: 10000, Karim: 5000 };

  it("keeps the buyer float: opening + advances − purchases, and ignores cash funding", () => {
    const bundle = computeSoldesBundle({
      viewer: "Admin",
      seeAll: true,
      openings,
      monthFilter: "OCTOBRE 2026",
      rows: [
        row({ type: "AVANCE", date: "2026-10-02", buyer: "Karim", op: 1, recettes: 20000, total: 20000 }),
        row({ type: "ACHAT", date: "2026-10-05", buyer: "Karim", op: 2, depenses: 3400, total: 3400 }),
        row({ type: "ALIMENTATION", date: "2026-10-01", buyer: "Caisse Principale", op: 3, recettes: 200000, total: 200000 }),
        row({ type: "ACHAT", date: "2026-09-28", buyer: "Said", op: 4, depenses: 4500, total: 4500 }),
      ],
    });

    const karim = bundle.buyerBalances.find((buyer) => buyer.name === "Karim");
    expect(karim).toMatchObject({
      ouverture: 5000,
      achats: 3400,
      avances: 20000,
      mouvement: 16600,
      solde: 5000 + 20000 - 3400,
    });
    expect(bundle.periodSummary).toMatchObject({
      ouverture: 15000,
      achats: 3400,
      avances: 20000,
      alim: 200000,
      mouvement: 16600,
      soldeFin: 15000 - 4500 + 16600,
    });
    expect(bundle.buyerBalances.some((buyer) => buyer.name === "Caisse Principale")).toBe(false);
  });

  it("counts a multi-line purchase once and hides other buyers from a restricted viewer", () => {
    const bundle = computeSoldesBundle({
      viewer: "Said",
      seeAll: false,
      openings,
      buyerFilter: "TOUS",
      rows: [
        row({ type: "ACHAT", date: "2026-10-05", buyer: "Said", op: 8, depenses: 4500, total: 4500 }),
        row({ type: "ACHAT", date: "2026-10-05", buyer: "Said", op: 8, isFirst: false, depenses: 4500, total: 4500 }),
        row({ type: "ACHAT", date: "2026-10-05", buyer: "Karim", op: 9, depenses: 999, total: 999 }),
      ],
    });
    expect(bundle.buyerBalances).toEqual([
      expect.objectContaining({ name: "Said", achats: 4500, solde: 10000 - 4500 }),
    ]);
    expect(bundle.periodSummary.ouverture).toBe(10000);
  });
});

describe("recomputePeriodFromDates", () => {
  it("uses the chosen range for the movement and the cumulative balance up to the end date", () => {
    const summary = recomputePeriodFromDates({
      viewer: "Admin",
      seeAll: true,
      openings: { Said: 1000 },
      fallbackOuverture: 1000,
      from: "2026-10-01",
      to: "2026-10-31",
      buyer: "TOUS",
      rows: [
        row({ type: "ACHAT", date: "2026-09-15", buyer: "Said", op: 1, depenses: 100, total: 100 }),
        row({ type: "AVANCE", date: "2026-10-02", buyer: "Said", op: 2, recettes: 500, total: 500 }),
        row({ type: "ACHAT", date: "2026-11-01", buyer: "Said", op: 3, depenses: 50, total: 50 }),
      ],
    });
    expect(summary).toMatchObject({
      achats: 0,
      avances: 500,
      mouvement: 500,
      soldeFin: 1000 + 500 - 100,
      alim: 0,
    });
  });
});
