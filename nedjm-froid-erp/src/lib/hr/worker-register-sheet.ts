import ExcelJS from "exceljs";
import type { WorkerRegisterRow } from "@/lib/actions/hr-worker-register";

export type WorkerRegisterWrite = {
  matricule: string;
  lastName: string;
  firstName: string;
  birthDate: string | null;
  birthPlace: string | null;
  sex: string | null;
  poste: string | null;
  hiredAt: string;
  endedAt: string | null;
  nss: string | null;
  status: "ACTIVE" | "DÉSACTIVE";
};

export type RegisterSheetIssue = { line: number; message: string };

export type RegisterColumnKey =
  | "lineNo"
  | "matricule"
  | "lastName"
  | "firstName"
  | "birthDate"
  | "birthPlace"
  | "sex"
  | "poste"
  | "hiredAt"
  | "endedAt"
  | "nss"
  | "status";

export const REGISTER_COLUMNS: { key: RegisterColumnKey; label: string }[] = [
  { key: "lineNo", label: "N°" },
  { key: "matricule", label: "Matricule" },
  { key: "lastName", label: "Nom" },
  { key: "firstName", label: "Prénom" },
  { key: "birthDate", label: "Date de naissance" },
  { key: "birthPlace", label: "Lieu de naissance" },
  { key: "sex", label: "Sexe" },
  { key: "poste", label: "Poste" },
  { key: "hiredAt", label: "Date d'entrée" },
  { key: "endedAt", label: "Date de sortie" },
  { key: "nss", label: "NSS" },
  { key: "status", label: "Statut" },
];

const FIELD_ALIASES: { field: keyof WorkerRegisterWrite; aliases: string[] }[] = [
  { field: "matricule", aliases: ["matricule", "mat"] },
  { field: "lastName", aliases: ["nom"] },
  { field: "firstName", aliases: ["prenom"] },
  { field: "birthDate", aliases: ["date de naissance", "date naissance"] },
  { field: "birthPlace", aliases: ["lieu de naissance", "lieu naissance"] },
  { field: "sex", aliases: ["sexe", "sex"] },
  { field: "poste", aliases: ["poste"] },
  { field: "hiredAt", aliases: ["date de recrutement", "date recrutement", "date d entree", "date entree"] },
  { field: "endedAt", aliases: ["date de sortie", "date sortie"] },
  { field: "nss", aliases: ["nss", "n ss", "numero de securite sociale"] },
  { field: "status", aliases: ["statut", "status"] },
];

export function foldRegisterText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function formatRegisterDate(iso: string | null) {
  if (!iso) return "";
  const [year, month, day] = iso.slice(0, 10).split("-");
  return day && month && year ? `${day}/${month}/${year}` : iso;
}

export function registerStatusLabel(status: string) {
  return status === "ACTIVE" ? "Actif" : "Inactif";
}

function cellText(value: string | undefined) {
  return (value ?? "").trim();
}

function parseDate(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  const fr = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text);
  const year = iso?.[1] ?? fr?.[3];
  const month = iso?.[2] ?? fr?.[2]?.padStart(2, "0");
  const day = iso?.[3] ?? fr?.[1]?.padStart(2, "0");
  if (!year || !month || !day) return null;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== `${year}-${month}-${day}`) return null;
  return `${year}-${month}-${day}`;
}

function parseMatricule(raw: string) {
  const match = /^(\d{1,3})\/(\d{2})$/.exec(raw.trim().replace(/\s/g, ""));
  return match ? `${match[1].padStart(3, "0")}/${match[2]}` : null;
}

function parseStatus(raw: string, endedAt: string | null): "ACTIVE" | "DÉSACTIVE" {
  const text = foldRegisterText(raw);
  if (text.startsWith("act")) return "ACTIVE";
  if (text.startsWith("inact") || text.startsWith("desact")) return "DÉSACTIVE";
  return endedAt ? "DÉSACTIVE" : "ACTIVE";
}

function parseSex(raw: string) {
  const text = foldRegisterText(raw);
  if (text === "m" || text.startsWith("hom") || text === "masculin") return "M";
  if (text === "f" || text.startsWith("fem")) return "F";
  return null;
}

function headerMap(header: string[]) {
  const folded = header.map(foldRegisterText);
  const index = new Map<keyof WorkerRegisterWrite, number>();
  for (const { field, aliases } of FIELD_ALIASES) {
    const at = folded.findIndex((cell) => aliases.includes(cell));
    if (at >= 0) index.set(field, at);
  }
  return index;
}

/** Read a register sheet. The first recognized header row starts the table. */
export function parseRegisterMatrix(matrix: string[][]): { rows: WorkerRegisterWrite[]; issues: RegisterSheetIssue[] } {
  let headerAt = -1;
  let columns = new Map<keyof WorkerRegisterWrite, number>();
  for (let i = 0; i < Math.min(matrix.length, 8); i++) {
    const mapped = headerMap(matrix[i] ?? []);
    if (mapped.has("matricule") && mapped.has("lastName") && mapped.has("hiredAt")) {
      headerAt = i;
      columns = mapped;
      break;
    }
  }
  if (headerAt < 0) {
    return { rows: [], issues: [{ line: 1, message: "En-têtes introuvables (Matricule, Nom, Date d'entrée)." }] };
  }

  const rows: WorkerRegisterWrite[] = [];
  const issues: RegisterSheetIssue[] = [];
  const seen = new Map<string, number>();
  for (let i = headerAt + 1; i < matrix.length; i++) {
    const line = matrix[i] ?? [];
    const lineNo = i + 1;
    if (line.every((cell) => !cellText(cell))) continue;
    const read = (field: keyof WorkerRegisterWrite) => {
      const at = columns.get(field);
      return at === undefined ? "" : cellText(line[at]);
    };
    const matricule = parseMatricule(read("matricule"));
    const hiredAt = parseDate(read("hiredAt"));
    const lastName = read("lastName").replace(/\s+/g, " ").trim();
    if (!matricule) {
      issues.push({ line: lineNo, message: "Matricule absent ou pas au format NNN/AA." });
      continue;
    }
    if (!lastName) {
      issues.push({ line: lineNo, message: `${matricule} : nom absent.` });
      continue;
    }
    if (!hiredAt) {
      issues.push({ line: lineNo, message: `${matricule} ${lastName} : date d'entrée absente ou illisible.` });
      continue;
    }
    const birthRaw = read("birthDate");
    const birthDate = birthRaw ? parseDate(birthRaw) : null;
    if (birthRaw && !birthDate) {
      issues.push({ line: lineNo, message: `${matricule} ${lastName} : date de naissance illisible.` });
      continue;
    }
    const endRaw = read("endedAt");
    const endedAt = endRaw ? parseDate(endRaw) : null;
    if (endRaw && !endedAt) {
      issues.push({ line: lineNo, message: `${matricule} ${lastName} : date de sortie illisible.` });
      continue;
    }
    const row: WorkerRegisterWrite = {
      matricule,
      lastName: lastName.toUpperCase(),
      firstName: read("firstName").replace(/\s+/g, " ").trim().toUpperCase(),
      birthDate,
      birthPlace: read("birthPlace").replace(/\s+/g, " ").trim().toUpperCase() || null,
      sex: parseSex(read("sex")),
      poste: read("poste").replace(/\s+/g, " ").trim().toUpperCase() || null,
      hiredAt,
      endedAt,
      nss: read("nss").replace(/\D/g, "") || null,
      status: parseStatus(read("status"), endedAt),
    };
    const key = `${row.matricule}|${row.hiredAt}`;
    const previous = seen.get(key);
    if (previous !== undefined) {
      issues.push({
        line: lineNo,
        message: `${row.matricule} au ${formatRegisterDate(row.hiredAt)} remplace une ligne précédente du fichier.`,
      });
      rows[previous] = row;
      continue;
    }
    seen.set(key, rows.length);
    rows.push(row);
  }
  return { rows, issues };
}

function toArrayBuffer(data: ExcelJS.Buffer | ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  const view = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayLike<number>);
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}

function columnValue(row: WorkerRegisterRow, key: RegisterColumnKey) {
  if (key === "lineNo") return row.lineNo;
  if (key === "birthDate" || key === "hiredAt" || key === "endedAt") return formatRegisterDate(row[key]);
  if (key === "status") return registerStatusLabel(row.status);
  return row[key] ?? "";
}

export async function buildRegisterWorkbook(rows: WorkerRegisterRow[], keys: RegisterColumnKey[]) {
  const columns = REGISTER_COLUMNS.filter((column) => keys.includes(column.key));
  const wb = new ExcelJS.Workbook();
  wb.creator = "NEDJM FROID";
  const sheet = wb.addWorksheet("Registre", { views: [{ state: "frozen", ySplit: 1 }] });
  const header = sheet.addRow(columns.map((column) => column.label));
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7ED" } };
  });
  for (const row of rows) sheet.addRow(columns.map((column) => columnValue(row, column.key)));
  columns.forEach((column, index) => {
    const excelColumn = sheet.getColumn(index + 1);
    excelColumn.width = Math.min(28, Math.max(12, column.label.length + 2));
    if (column.key === "nss" || column.key === "matricule") excelColumn.numFmt = "@";
  });
  if (columns.length) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  }
  return toArrayBuffer(await wb.xlsx.writeBuffer());
}

export async function readRegisterWorkbook(buffer: ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.worksheets[0];
  if (!sheet) return { rows: [], issues: [{ line: 1, message: "Fichier sans feuille." }] };
  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col - 1] = cell.text?.trim() ?? "";
    });
    matrix.push(cells);
  });
  return parseRegisterMatrix(matrix);
}

export type RegisterReport = {
  periods: number;
  matricules: number;
  active: number;
  years: { year: string; periods: number; active: number }[];
  missingNss: number;
  shortNss: { matricule: string; name: string; nss: string; hiredAt: string }[];
  noExit: number;
  activeWithExit: { matricule: string; name: string; hiredAt: string; endedAt: string }[];
  sharedNss: { nss: string; people: string[] }[];
  splitNss: { matricule: string; name: string; values: string[] }[];
};

function personLabel(row: WorkerRegisterRow) {
  return `${row.lastName} ${row.firstName}`.trim();
}

/** Quality report of the worker register. One person keeps one matricule and one NSS. */
export function buildRegisterReport(rows: WorkerRegisterRow[]): RegisterReport {
  const matricules = new Set(rows.map((row) => row.matricule));
  const years = new Map<string, { periods: number; active: number }>();
  const nssPeople = new Map<string, Map<string, string>>();
  const matNss = new Map<string, { name: string; values: Set<string> }>();
  const shortNss: RegisterReport["shortNss"] = [];
  const activeWithExit: RegisterReport["activeWithExit"] = [];
  let missingNss = 0;
  let noExit = 0;
  for (const row of rows) {
    const year = row.hiredAt.slice(0, 4);
    const bucket = years.get(year) ?? { periods: 0, active: 0 };
    bucket.periods += 1;
    if (row.status === "ACTIVE") bucket.active += 1;
    years.set(year, bucket);
    if (!row.nss) missingNss += 1;
    else if (row.nss.length < 12) {
      shortNss.push({ matricule: row.matricule, name: personLabel(row), nss: row.nss, hiredAt: row.hiredAt });
    }
    if (!row.endedAt && row.status !== "ACTIVE") noExit += 1;
    if (row.endedAt && row.status === "ACTIVE") {
      activeWithExit.push({
        matricule: row.matricule,
        name: personLabel(row),
        hiredAt: row.hiredAt,
        endedAt: row.endedAt,
      });
    }
    if (row.nss) {
      const people = nssPeople.get(row.nss) ?? new Map<string, string>();
      people.set(row.matricule, personLabel(row));
      nssPeople.set(row.nss, people);
      const held = matNss.get(row.matricule) ?? { name: personLabel(row), values: new Set<string>() };
      held.values.add(row.nss);
      matNss.set(row.matricule, held);
    }
  }
  return {
    periods: rows.length,
    matricules: matricules.size,
    active: rows.filter((row) => row.status === "ACTIVE").length,
    years: [...years.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([year, counts]) => ({ year, ...counts })),
    missingNss,
    shortNss,
    noExit,
    activeWithExit,
    sharedNss: [...nssPeople.entries()]
      .filter(([, people]) => people.size > 1)
      .map(([nss, people]) => ({ nss, people: [...people.values()] })),
    splitNss: [...matNss.entries()]
      .filter(([, held]) => held.values.size > 1)
      .map(([matricule, held]) => ({ matricule, name: held.name, values: [...held.values] })),
  };
}
