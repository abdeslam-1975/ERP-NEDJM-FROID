import ExcelJS from "exceljs";
import {
  matrixToObjects,
  parseGasStyleMatrix,
  parseRecords,
  type RubriqueDraft,
  type RubriqueParseFail,
} from "@/lib/hr/salary-rubrique-import";

export const SALARY_IMPORT_MAX_BYTES = 2_000_000;

function toArrayBuffer(data: ExcelJS.Buffer | ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  const view =
    data instanceof Uint8Array ? data : new Uint8Array(data as ArrayLike<number>);
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}

export async function buildSalaryRubriquesTemplate(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Rubriques");
  sheet.addRow([
    "code",
    "label_fr",
    "label_ar",
    "nature",
    "unit",
    "category",
    "cotisable",
    "taxable",
    "apply_scope",
    "default_amount",
    "sort_order",
    "is_active",
  ]);
  sheet.addRow([
    "302",
    "Prime de Panier des Jours Travaillés",
    "وجبة العامل",
    "prime",
    "day",
    "3",
    "non",
    "oui",
    "site",
    0,
    302,
    "oui",
  ]);
  sheet.addRow([
    "303",
    "Salissure",
    "مستلزمات النظافة",
    "indemnite",
    "month",
    "3",
    "non",
    "oui",
    "contract",
    0,
    303,
    "oui",
  ]);
  sheet.columns.forEach((col) => {
    col.width = 22;
  });
  const guide = wb.addWorksheet("Guide");
  guide.addRow(["Champ / الحقل", "Valeurs / القيم"]);
  guide.addRow(["nature", "indemnite | prime | rappel | remboursement | retenue"]);
  guide.addRow(["unit", "day | month | percent | presence_day"]);
  guide.addRow([
    "category",
    "1 CNAS+IRG · ضمان+ضريبة | 2 CNAS · ضمان | 3 IRG · ضريبة | 4 none · لا شيء",
  ]);
  guide.addRow([
    "apply_scope",
    "site chantier/ورشة | contract contrat/عقد | employee employé/عامل",
  ]);
  guide.addRow(["cotisable / taxable / is_active", "oui/non · نعم/لا"]);
  const buf = await wb.xlsx.writeBuffer();
  return toArrayBuffer(buf);
}

function sheetToMatrix(ws: ExcelJS.Worksheet): unknown[][] {
  const rows: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    rows.push(values.map((v) => (v == null ? "" : v)));
  });
  return rows;
}

export async function parseSalaryImportBuffer(
  buffer: ArrayBuffer,
  filename: string,
): Promise<{ drafts: RubriqueDraft[]; rejected: RubriqueParseFail[] }> {
  const name = filename.toLowerCase();
  const bytes = new Uint8Array(buffer);
  const head = new TextDecoder("utf-8").decode(bytes.slice(0, 80)).trimStart();
  if (head.startsWith("<!DOCTYPE") || head.startsWith("<html") || head.startsWith("<HTML")) {
    throw new Error(
      "Cette URL est une page web, pas un fichier de rubriques. Téléchargez l'Excel puis chargez-le. · الرابط صفحة ويب وليس ملف بنود. نزّل الإكسل من الموقع ثم ارفعه.",
    );
  }
  if (name.endsWith(".json") || head.startsWith("{") || head.startsWith("[")) {
    const text = new TextDecoder("utf-8").decode(bytes);
    const { parseJsonText } = await import("@/lib/hr/salary-rubrique-import");
    return parseRecords(parseJsonText(text));
  }
  if (name.endsWith(".csv") || (head.includes(",") && !name.endsWith(".xlsx"))) {
    const { parseCsvText } = await import("@/lib/hr/salary-rubrique-import");
    const text = new TextDecoder("utf-8").decode(bytes);
    if (text.includes("code") || text.includes("label")) {
      return parseRecords(parseCsvText(text));
    }
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Classeur Excel sans feuille. · ملف إكسل بلا ورقة.");
  const matrix = sheetToMatrix(ws);
  const gas = parseGasStyleMatrix(matrix);
  if (gas) return { drafts: gas, rejected: [] };
  return parseRecords(matrixToObjects(matrix));
}
