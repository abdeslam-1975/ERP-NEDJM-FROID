/**
 * Dry-run: parse GESTION DES BANQUES archive xlsx.
 * Usage: npx tsx scripts/banque-archive-dry-run.ts <file.xlsx> [out.json]
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import ExcelJS from "exceljs";
import { parseArchiveWorkbookFromExcelJs } from "../src/lib/banque/archive-xlsx";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: npx tsx scripts/banque-archive-dry-run.ts <file.xlsx> [out.json]");
    process.exit(1);
  }
  const out = process.argv[3] || null;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(resolve(file));
  const parsed = await parseArchiveWorkbookFromExcelJs(wb);
  const report = {
    file: resolve(file),
    generatedAt: new Date().toISOString(),
    banks: parsed.banks.map((b) => ({
      sheetName: b.sheetName,
      accountName: b.accountName,
      ops: b.lines.length,
      labeledOpening: b.labeledOpening,
      impliedOpening: b.impliedOpening,
      openingBalance: b.openingBalance,
      openingMismatch: b.openingMismatch,
      expectedFinal: b.expectedFinal,
      sheetFinal: b.sheetFinal,
      balanceMismatches: b.balanceMismatches,
      linkCounts: b.linkCounts,
    })),
    settings: parsed.settings
      ? {
          banks: parsed.settings.banks.length,
          affectations: parsed.settings.affectations.length,
          fournisseurs: parsed.settings.fournisseurs.length,
          modes: parsed.settings.modes.length,
        }
      : null,
  };
  const json = JSON.stringify(report, null, 2);
  console.log(json);
  if (out) writeFileSync(resolve(out), json);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
