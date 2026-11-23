import { describe, expect, it } from "vitest";
import { buildMockInvoices, invoiceTotals, lineHt } from "./types";

describe("ventes mock totals", () => {
  it("computes P lines as qty * PU", () => {
    const inv = buildMockInvoices().find((x) => x.id === "v-1");
    expect(inv).toBeTruthy();
    if (!inv) return;
    expect(lineHt(inv.lines[0], "P")).toBe(1_581_000);
    const t = invoiceTotals(inv);
    expect(t.totalHt).toBe(1_581_000 + 369_000);
    expect(t.payStatus).toBe("PAYE");
  });

  it("computes RG as sum(source * retentionRate)", () => {
    const inv = buildMockInvoices().find((x) => x.docKind === "RG");
    expect(inv).toBeTruthy();
    if (!inv) return;
    const t = invoiceTotals(inv);
    expect(t.totalHt).toBe(Math.round((50_000 + 1_125_000 + 134_500) * 0.05 * 100) / 100);
    expect(t.payStatus).toBe("IMPAYE");
  });

  it("computes FP as qty * (fourniture + pose)", () => {
    const inv = buildMockInvoices().find((x) => x.docKind === "FP");
    expect(inv).toBeTruthy();
    if (!inv) return;
    const expected =
      2 * (400_000 + 50_581.18) + 2 * (450_000 + 48_363.47);
    expect(invoiceTotals(inv).totalHt).toBe(Math.round(expected * 100) / 100);
    expect(invoiceTotals(inv).payStatus).toBe("PARTIEL");
  });
});
