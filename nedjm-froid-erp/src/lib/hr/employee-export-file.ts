import ExcelJS from "exceljs";
import type { EmployeeExportTable } from "@/lib/hr/employee-export";

function toArrayBuffer(data: ExcelJS.Buffer | ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  const view = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayLike<number>);
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}

/** Workbook of the chosen grid: one sheet, headers in French and Arabic, filter on the first row. */
export async function buildEmployeeWorkbook(table: EmployeeExportTable): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "NEDJM FROID";
  const sheet = wb.addWorksheet("Employés", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const header = sheet.addRow(table.columns.map((c) => (c.labelAr ? `${c.labelFr}\n${c.labelAr}` : c.labelFr)));
  header.font = { bold: true, size: 10 };
  header.alignment = { wrapText: true, vertical: "middle" };
  header.height = 30;
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7ED" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFD6D3D1" } } };
  });
  for (const row of table.rows) sheet.addRow(row);
  sheet.columns.forEach((col, i) => {
    const label = table.columns[i]?.labelFr.length ?? 12;
    col.width = Math.min(32, Math.max(12, label + 2));
  });
  if (table.columns.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: table.columns.length } };
  return toArrayBuffer(await wb.xlsx.writeBuffer());
}
