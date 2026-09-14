import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";

/** Build a small 2-sheet canva fixture for REPLACE import tests. */
export async function writeCanvaFixture(filePath: string) {
  const wb = new ExcelJS.Workbook();
  const labor = wb.addWorksheet("Main-d'oeuvre");
  labor.addRow([
    "item_code",
    "designation",
    "effectif",
    "unit",
    "unit_price_ht",
    "total_price_ht",
  ]);
  labor.addRow(["E2E-LAB-1", "Technicien E2E", 1, "JOUR", 15000, 15000]);
  labor.addRow(["E2E-LAB-2", "Aide E2E", 1, "JOUR", 8000, 8000]);
  const spares = wb.addWorksheet("Pieces-detachees");
  spares.addRow([
    "item_code",
    "designation",
    "unit",
    "quantity",
    "unit_price_ht",
    "total_price_ht",
  ]);
  spares.addRow(["E2E-SP-1", "Filtre E2E", "U", 5, 1000, 5000]);

  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  await wb.xlsx.writeFile(filePath);
}
