import ExcelJS from "exceljs";

export const EMPLOYEE_IMPORT_MAX_BYTES = 5_000_000;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Plain text of an Excel cell (dates as yyyy-mm-dd, formulas by their result). */
export function cellText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toLocaleString("fullwide", { useGrouping: false }) : String(value);
  }
  if (typeof value === "boolean") return value ? "oui" : "non";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (Array.isArray(v.richText)) {
      return (v.richText as { text?: string }[]).map((r) => r.text ?? "").join("").trim();
    }
    if ("result" in v) return cellText(v.result);
    if ("text" in v) return cellText(v.text);
    if ("error" in v) return "";
  }
  return String(value).trim();
}

/** CSV with , or ; separators and "quoted" cells. */
export function parseCsvMatrix(text: string): string[][] {
  const body = text.replace(/^\uFEFF/, "");
  const firstLine = body.split(/\r?\n/, 1)[0] ?? "";
  const sep = [";", "\t", ","].reduce((best, s) =>
    firstLine.split(s).length > firstLine.split(best).length ? s : best,
  );
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && body[i + 1] === "\n") i += 1;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

/** First sheet of an .xlsx, or a .csv, as rows of plain text cells. */
export async function readEmployeeSheet(buffer: ArrayBuffer, filename: string): Promise<string[][]> {
  return (await readSheetMatrix(buffer, filename)).matrix;
}

/** One sheet of an .xlsx (the named one, else the first non-empty one), or a .csv, with the workbook's sheet names. */
export async function readSheetMatrix(
  buffer: ArrayBuffer,
  filename: string,
  sheetName = "",
): Promise<{ sheets: string[]; sheet: string; matrix: string[][] }> {
  const name = filename.toLowerCase();
  const bytes = new Uint8Array(buffer);
  if (name.endsWith(".xls")) {
    throw new Error("Ancien format .xls : ouvrez le fichier dans Excel et enregistrez-le en .xlsx (ou .csv).");
  }
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) {
    if (name.endsWith(".xlsx")) throw new Error("Fichier Excel illisible.");
    return { sheets: [], sheet: "", matrix: parseCsvMatrix(new TextDecoder("utf-8").decode(bytes)) };
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = sheetName
    ? wb.worksheets.find((s) => s.name === sheetName)
    : (wb.worksheets.find((s) => s.actualRowCount > 0) ?? wb.worksheets[0]);
  if (!ws) throw new Error(sheetName ? `Feuille « ${sheetName} » introuvable.` : "Classeur Excel sans feuille.");
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    rows.push(Array.from({ length: values.length }, (_, i) => cellText(values[i])));
  });
  return { sheets: wb.worksheets.map((s) => s.name), sheet: ws.name, matrix: rows };
}
