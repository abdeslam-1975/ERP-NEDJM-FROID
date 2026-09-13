import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  buildEmptyCanvaWorkbook,
  parseFullCanva,
} from "@/lib/contracts/canva-excel";

describe("buildEmptyCanvaWorkbook / parseFullCanva", () => {
  it("round-trips the empty template (2 sheets)", async () => {
    const buffer = await buildEmptyCanvaWorkbook();
    const parsed = await parseFullCanva(buffer);
    expect(parsed.labor).toHaveLength(1);
    expect(parsed.spares).toHaveLength(1);
    expect(parsed.labor[0]?.item_code).toBe("LAB-EXEMPLE");
    expect(parsed.spares[0]?.item_code).toBe("SP-EXEMPLE");
    expect(parsed.spares[0]?.total_price_ht).toBe(15_000);
  });

  it("parses French alias headers and computes missing totals", async () => {
    const wb = new ExcelJS.Workbook();
    const labor = wb.addWorksheet("Main-d'œuvre");
    labor.addRow(["code", "désignation", "effectif", "unité", "prix_unitaire"]);
    labor.addRow(["mo-1", "Agent HVAC", 2, "JOUR", 10000]);
    const spares = wb.addWorksheet("Pièces");
    spares.addRow(["référence", "libellé", "qté", "pu_ht"]);
    spares.addRow(["p-9", "Joint", 4, 250.5]);
    const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;

    const parsed = await parseFullCanva(buffer);
    expect(parsed.labor[0]).toMatchObject({
      item_code: "MO-1",
      designation: "Agent HVAC",
      quantity: 2,
      unit_price_ht: 10_000,
      total_price_ht: 20_000,
    });
    expect(parsed.spares[0]).toMatchObject({
      item_code: "P-9",
      designation: "Joint",
      quantity: 4,
      unit_price_ht: 250.5,
      total_price_ht: 1002,
    });
  });

  it("throws on incomplete labor rows", async () => {
    const wb = new ExcelJS.Workbook();
    const labor = wb.addWorksheet("Main-d'oeuvre");
    labor.addRow(["item_code", "designation", "effectif", "unit_price_ht"]);
    labor.addRow(["ONLY-CODE", "", 1, 100]);
    const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;

    await expect(parseFullCanva(buffer)).rejects.toThrow(/code et désignation/i);
  });
});
