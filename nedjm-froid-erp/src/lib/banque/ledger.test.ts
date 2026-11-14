import { describe, expect, it } from "vitest";
import {
  buildBcLabel,
  buildCautionLibelle,
  buildModeLabel,
  canAffordOutflow,
  cautionAlertsFromLibelles,
  excelSerialToIso,
  nextRunningBalance,
  parseDocField,
  roundMoney,
  sumCautionCredits,
  withRunningBalances,
} from "@/lib/banque/ledger";

describe("banque ledger helpers", () => {
  it("rounds money to centimes", () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(10.004)).toBe(10);
  });

  it("applies the sheet running-balance formula", () => {
    expect(nextRunningBalance(1000, { debit: 200, credit: 50, frais: 10 })).toBe(1140);
  });

  it("checks outflow against sheet balance like the Apps Script", () => {
    expect(canAffordOutflow(100, 120).ok).toBe(false);
    expect(canAffordOutflow(100, 120, 50).ok).toBe(true);
  });

  it("builds document labels", () => {
    expect(buildBcLabel("12", "2026-03-01")).toBe("BC N° 12 du 01/03/2026");
    expect(buildModeLabel("CHEQUE", "88")).toBe("CHEQUE N° 88");
    expect(buildCautionLibelle("S-CAUTION", "2026-12-31")).toBe("S-CAUTION [EXP: 31/12/2026]");
  });

  it("parses document cells", () => {
    expect(parseDocField("BC N° 12 du 01/03/2026", "BC")).toEqual({
      num: "12",
      date: "01/03/2026",
      mode: "",
    });
    expect(parseDocField("VIREMENT N° 9", "MODE")).toEqual({
      num: "9",
      date: "",
      mode: "VIREMENT",
    });
  });

  it("sums caution credits and builds alerts", () => {
    const rows = [
      { libelle: "S-CAUTION [EXP: 01/01/2020]", credit: 100 },
      { libelle: "B-CAUTION [EXP: 20/11/2026]", credit: 250 },
      { libelle: "Achat", credit: 10 },
    ];
    expect(sumCautionCredits(rows, "S-CAUTION")).toBe(100);
    expect(sumCautionCredits(rows, "B-CAUTION")).toBe(250);
    const alerts = cautionAlertsFromLibelles(rows, "2026-11-15");
    expect(alerts.some((a) => a.expired)).toBe(true);
    expect(alerts.some((a) => !a.expired && a.days <= 7)).toBe(true);
  });

  it("assigns ascending running balances", () => {
    const withSolde = withRunningBalances(1000, [
      { debit: 100, credit: 0, frais: 0 },
      { debit: 0, credit: 40, frais: 5 },
    ]);
    expect(withSolde.map((r) => r.solde)).toEqual([1100, 1055]);
  });

  it("converts excel serials without UTC day shift for Algiers", () => {
    // 46023 ≈ 2026-01-01 in Excel 1900 system
    const iso = excelSerialToIso(46023);
    expect(iso).toMatch(/^2026-01-0[12]$/);
  });
});
