import { z } from "zod";
import { cellText } from "@/lib/hr/attendance-import";

export const ARCHIVE_BUCKET = "attendance-imports";
export const ARCHIVE_SOURCE_MAX_BYTES = 10 * 1024 * 1024;
export const ARCHIVE_PIECE_MAX_BYTES = 20 * 1024 * 1024;
export const ARCHIVE_MAX_LINES = 200_000;
export const ARCHIVE_CHUNK = 1000;

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const CSV_MIME = "text/csv";
export const ARCHIVE_PIECE_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type ArchivePieceMime = (typeof ARCHIVE_PIECE_MIME)[number];
export const PIECE_EXT: Record<ArchivePieceMime, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const ARCHIVE_FORMATS = ["GRID", "ROWS"] as const;
export type ArchiveFormat = (typeof ARCHIVE_FORMATS)[number];
export const PROVENANCE_KINDS = ["PAPER_REGISTER", "SOURCE_SOFTWARE", "TRANSMITTED", "OTHER"] as const;
export type ProvenanceKind = (typeof PROVENANCE_KINDS)[number];
export const BATCH_STATUSES = [
  "DRAFT",
  "ANALYZED",
  "PENDING_DECISION",
  "IMPORTED",
  "VALIDATED",
  "REJECTED",
  "CANCELLED",
] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];
export const LINE_STATUSES = ["PENDING", "OK", "WARNING", "ERROR", "DUPLICATE", "SAME", "CONFLICT"] as const;
export type LineStatus = (typeof LINE_STATUSES)[number];

export const HOUR_CODES = ["HS50", "HS75", "HS100"] as const;

export const ARCHIVE_NOTICE =
  "Un import d'archives ne crée aucune paie et ne recalcule rien. Les présences importées restent proposées jusqu'à leur validation, faite séparément par une personne qui en a le droit. Les mois de janvier à août 2026 sont une reprise (reconstitution interne) : une présence importée n'atteste ni un paiement ni une déclaration.";

export const HOURS_NOTICE =
  "Les heures supplémentaires lues dans le fichier sont contrôlées et conservées avec le lot ; elles ne sont pas reportées sur la feuille de pointage.";

const FORMAT_LABELS: Record<ArchiveFormat, string> = {
  GRID: "Grille mensuelle (un chantier, un mois)",
  ROWS: "Une ligne par salarié et par jour",
};
const PROVENANCE_LABELS: Record<ProvenanceKind, string> = {
  PAPER_REGISTER: "Registre papier (saisi dans le fichier)",
  SOURCE_SOFTWARE: "Logiciel source",
  TRANSMITTED: "Fichier transmis par une personne ou un service",
  OTHER: "Autre provenance",
};
const STATUS_LABELS: Record<BatchStatus, string> = {
  DRAFT: "En préparation",
  ANALYZED: "Analysé",
  PENDING_DECISION: "En attente de décision (conflits)",
  IMPORTED: "Importé, à valider",
  VALIDATED: "Validé",
  REJECTED: "Rejeté",
  CANCELLED: "Annulé",
};
const LINE_STATUS_LABELS: Record<LineStatus, string> = {
  PENDING: "Non analysée",
  OK: "Acceptée",
  WARNING: "Acceptée avec avertissement",
  ERROR: "Rejetée",
  DUPLICATE: "Doublon ignoré",
  SAME: "Déjà enregistrée à l'identique",
  CONFLICT: "En conflit",
};
const NATURE_LABELS: Record<string, string> = {
  REPRISE: "Reprise : reconstitution interne (paie versée et déclarée hors application)",
  OPERATIONAL: "Période opérationnelle",
  MIXED: "Reprise et période opérationnelle",
};

export const ANOMALY_LABELS: Record<string, string> = {
  DATE_INVALID: "Date illisible",
  DAY_OUT_OF_MONTH: "Jour inexistant dans ce mois",
  HOURS_INVALID: "Heures supplémentaires illisibles",
  FIELD_TOO_LONG: "Valeur trop longue, tronquée",
  MATRICULE_MISSING: "Matricule absent",
  UNKNOWN_MATRICULE: "Matricule inconnu",
  AMBIGUOUS_MATRICULE: "Matricule ambigu (plusieurs salariés)",
  NAME_MISMATCH: "Nom ou prénom différent de la fiche salarié",
  SITE_MISSING: "Chantier absent",
  UNKNOWN_SITE: "Code chantier inconnu",
  SITE_OUTSIDE_BATCH: "Chantier hors des chantiers déclarés pour le lot",
  CODE_MISSING: "Code de présence absent",
  UNKNOWN_CODE: "Code de présence inconnu (correspondance D11 possible)",
  DATE_MISSING: "Date absente",
  DATE_OUT_OF_PERIOD: "Date hors de la période du lot",
  FUTURE_DATE: "Date future",
  MONTH_CLOSED: "Paie du mois validée ou clôturée",
  NO_CONTRACT: "Aucun contrat couvrant cette date sur ce chantier",
  AFTER_EXIT: "Date postérieure à la sortie validée",
  HOURS_OUT_OF_BOUNDS: "Heures supplémentaires hors bornes",
  HOURS_MONTH_EXCEEDED: "Plus de 300 heures supplémentaires dans le mois",
  DUPLICATE_OTHER_SITE: "Même salarié sur deux chantiers le même jour",
  DUPLICATE_DIFFERENT: "Même salarié et même jour avec deux codes différents",
  DUPLICATE_IGNORED: "Ligne répétée à l'identique",
  OTHER_SITE_CLOSED: "Présence validée sur un autre chantier dont la paie est validée (réouverture D7 nécessaire)",
};

export const CONFLICT_LABELS: Record<string, string> = {
  EXISTING_DIFFERENT: "Autre valeur déjà enregistrée",
  OTHER_SITE: "Présence déjà enregistrée sur un autre chantier",
  LEAVE: "Congé approuvé sur cette date",
};

export const BATCH_WARNING_LABELS: Record<string, string> = {
  DUPLICATE_FILE: "Fichier identique (même empreinte SHA-256) déjà déposé",
  CONTROL_LINES: "Nombre de présences différent du total de contrôle déclaré",
  CONTROL_EMPLOYEES: "Nombre de salariés différent du total de contrôle déclaré",
};

export const archiveFormatLabel = (v: string) => FORMAT_LABELS[v as ArchiveFormat] ?? v;
export const provenanceLabel = (v: string) => PROVENANCE_LABELS[v as ProvenanceKind] ?? v;
export const batchStatusLabel = (v: string) => STATUS_LABELS[v as BatchStatus] ?? v;
export const lineStatusLabel = (v: string) => LINE_STATUS_LABELS[v as LineStatus] ?? v;
export const natureLabel = (v: string) => NATURE_LABELS[v] ?? v;
export const anomalyLabel = (code: string) => ANOMALY_LABELS[code] ?? code;
export const conflictLabel = (code: string) => CONFLICT_LABELS[code] ?? code;

export function batchStatusTone(status: string): "neutral" | "brand" | "success" | "warning" | "danger" {
  if (status === "PENDING_DECISION") return "warning";
  if (status === "IMPORTED" || status === "ANALYZED") return "brand";
  if (status === "VALIDATED") return "success";
  if (status === "REJECTED" || status === "CANCELLED") return "danger";
  return "neutral";
}

export function lineStatusTone(status: string): "neutral" | "brand" | "success" | "warning" | "danger" {
  if (status === "OK") return "success";
  if (status === "WARNING" || status === "CONFLICT") return "warning";
  if (status === "ERROR") return "danger";
  return "neutral";
}

// ---------------------------------------------------------------------------
// Batch information entered with the file
// ---------------------------------------------------------------------------
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mois attendu au format AAAA-MM.");
const optDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .or(z.literal(""));
const optCount = z.union([z.number().int().min(0).max(ARCHIVE_MAX_LINES), z.null()]);

export const archiveMetaSchema = z
  .object({
    format: z.enum(ARCHIVE_FORMATS),
    period_from: month,
    period_to: month,
    reference_year: z.number().int().min(2000).max(2100),
    site_ids: z.array(z.string().uuid()).min(1, "Choisissez au moins un chantier.").max(200),
    provenance_kind: z.enum(PROVENANCE_KINDS),
    provenance_detail: z
      .string()
      .trim()
      .min(2, "Précisez la provenance (registre, logiciel, personne ou service).")
      .max(300),
    source_produced_on: optDate,
    comment: z.string().trim().max(1000),
    control_lines: optCount,
    control_employees: optCount,
  })
  .superRefine((m, ctx) => {
    if (m.period_to < m.period_from) {
      ctx.addIssue({ code: "custom", message: "Le dernier mois précède le premier.", path: ["period_to"] });
    }
    if (m.format === "GRID" && (m.site_ids.length !== 1 || m.period_from !== m.period_to)) {
      ctx.addIssue({ code: "custom", message: "Grille mensuelle : un seul chantier et un seul mois.", path: ["format"] });
    }
    const fromYear = Number(m.period_from.slice(0, 4));
    const toYear = Number(m.period_to.slice(0, 4));
    if (m.reference_year < fromYear || m.reference_year > toYear) {
      ctx.addIssue({
        code: "custom",
        message: "L'année de référence doit correspondre à la période couverte.",
        path: ["reference_year"],
      });
    }
  });
export type ArchiveMeta = z.infer<typeof archiveMetaSchema>;

export function emptyArchiveMeta(): ArchiveMeta {
  const d = new Date();
  const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return {
    format: "GRID",
    period_from: m,
    period_to: m,
    reference_year: d.getFullYear(),
    site_ids: [],
    provenance_kind: "PAPER_REGISTER",
    provenance_detail: "",
    source_produced_on: "",
    comment: "",
    control_lines: null,
    control_employees: null,
  };
}

/** Reprise (January–August 2026 and earlier), operational, or both; the month status itself is never deduced. */
export function periodNature(from: string, to: string): "REPRISE" | "OPERATIONAL" | "MIXED" {
  if (to < "2026-09") return "REPRISE";
  if (from >= "2026-09") return "OPERATIONAL";
  return "MIXED";
}

// ---------------------------------------------------------------------------
// Parsing: the file is read as it is; every check happens in the database analysis
// ---------------------------------------------------------------------------
export type ArchiveLine = {
  line_no: number;
  source_ref: string;
  kind: "DAY" | "HOURS";
  matricule: string;
  last_name: string | null;
  first_name: string | null;
  raw_date: string | null;
  work_date: string | null;
  site_code: string | null;
  source_code: string | null;
  hours: Record<string, number>;
  parse_errors: string[];
};

export type ArchiveParseReport = {
  header_row: number;
  columns: string[];
  ignored_columns: string[];
  rows: number;
  day_columns?: number;
  hour_columns?: string[];
  delimiter?: string;
};

export type ArchiveParseResult =
  | { ok: true; lines: ArchiveLine[]; report: ArchiveParseReport }
  | { ok: false; error: string };

function headerKey(v: unknown): string {
  return cellText(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[\s_.'-]+/g, " ")
    .trim();
}

const MATRICULE_KEYS = new Set(["MATRICULE", "MAT", "MATR", "الرقم التسلسلي"]);
const LAST_NAME_KEYS = new Set(["NOM", "NOM DE FAMILLE", "اللقب"]);
const FIRST_NAME_KEYS = new Set(["PRENOM", "PRENOMS", "الاسم"]);
const DATE_KEYS = new Set(["DATE", "JOUR", "DATE DU JOUR", "التاريخ"]);
const CODE_KEYS = new Set(["CODE", "CODE PRESENCE", "LEGENDE", "POINTAGE", "الرمز"]);
const SITE_KEYS = new Set(["CHANTIER", "CODE CHANTIER", "SITE", "الورشة"]);
const HOUR_KEYS = new Map(HOUR_CODES.map((c) => [c, c]));

function hourKey(v: unknown): string | null {
  const k = headerKey(v).replace(/\s+/g, "");
  return HOUR_KEYS.get(k as (typeof HOUR_CODES)[number]) ?? null;
}

function clip(value: string, max: number, errors: string[]): string {
  if (value.length <= max) return value;
  if (!errors.includes("FIELD_TOO_LONG")) errors.push("FIELD_TOO_LONG");
  return value.slice(0, max);
}

function iso(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > new Date(y, m, 0).getDate()) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Date cell: Excel date, Excel serial number, AAAA-MM-JJ, JJ/MM/AAAA (also - or .). */
export function parseArchiveDate(value: unknown): string | null {
  if (value && typeof value === "object" && !(value instanceof Date) && "result" in value) {
    return parseArchiveDate((value as { result: unknown }).result);
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : iso(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 20000 && value < 80000) {
    const ms = Math.round((Math.floor(value) - 25569) * 86400000);
    const d = new Date(ms);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const text = cellText(value);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

function parseHours(value: unknown): number | null | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = cellText(value).replace(",", ".");
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function findHeader(matrix: unknown[][], required: Set<string>[]): number {
  return matrix.findIndex((row) => required.every((keys) => (row ?? []).some((v) => keys.has(headerKey(v)))));
}

function rowIsEmpty(row: unknown[]): boolean {
  return row.every((v) => cellText(v) === "");
}

/**
 * Monthly grid (same layout as the pointage template): a header row with "Matricule", optional "Nom" /
 * "Prénom", day columns 1..31 and optional HS50 / HS75 / HS100 columns; one row per employee. Every
 * non-empty day cell is one line; the overtime of a row is one extra line.
 */
export function parseGridArchive(matrix: unknown[][], period: { year: number; month: number }): ArchiveParseResult {
  const headerIndex = findHeader(matrix, [MATRICULE_KEYS]);
  if (headerIndex < 0) return { ok: false, error: "Colonne « Matricule » introuvable dans la première feuille." };
  const header = matrix[headerIndex] ?? [];
  const days = new Date(period.year, period.month, 0).getDate();
  const mm = String(period.month).padStart(2, "0");
  let matCol = -1;
  let lastCol = -1;
  let firstCol = -1;
  const dayCols = new Map<number, number>();
  const hourCols = new Map<number, string>();
  const columns: string[] = [];
  const ignored: string[] = [];
  header.forEach((v, idx) => {
    const key = headerKey(v);
    if (!key) return;
    const text = cellText(v);
    if (matCol < 0 && MATRICULE_KEYS.has(key)) {
      matCol = idx;
    } else if (lastCol < 0 && LAST_NAME_KEYS.has(key)) {
      lastCol = idx;
    } else if (firstCol < 0 && FIRST_NAME_KEYS.has(key)) {
      firstCol = idx;
    } else if (/^\d{1,2}$/.test(text) && Number(text) >= 1 && Number(text) <= 31 && ![...dayCols.keys()].includes(Number(text))) {
      dayCols.set(Number(text), idx);
    } else if (hourKey(v)) {
      hourCols.set(idx, hourKey(v)!);
    } else {
      ignored.push(text);
      return;
    }
    columns.push(text);
  });
  if (!dayCols.size && !hourCols.size) {
    return { ok: false, error: "Aucune colonne de jour (1 à 31) ni d'heures supplémentaires dans l'en-tête." };
  }

  const lines: ArchiveLine[] = [];
  let rows = 0;
  for (let r = headerIndex + 1; r < matrix.length; r += 1) {
    const row = matrix[r] ?? [];
    if (rowIsEmpty(row)) continue;
    const lineNo = r + 1;
    const rowErrors: string[] = [];
    const matricule = clip(cellText(row[matCol]), 40, rowErrors);
    const lastName = lastCol >= 0 ? clip(cellText(row[lastCol]), 120, rowErrors) || null : null;
    const firstName = firstCol >= 0 ? clip(cellText(row[firstCol]), 120, rowErrors) || null : null;
    let used = false;
    for (const [day, col] of [...dayCols].sort((a, b) => a[0] - b[0])) {
      const code = cellText(row[col]).toUpperCase();
      if (!code) continue;
      used = true;
      const errors = [...rowErrors];
      const workDate = day <= days ? `${period.year}-${mm}-${String(day).padStart(2, "0")}` : null;
      if (!workDate) errors.push("DAY_OUT_OF_MONTH");
      lines.push({
        line_no: lineNo,
        source_ref: `L${lineNo}-J${day}`,
        kind: "DAY",
        matricule,
        last_name: lastName,
        first_name: firstName,
        raw_date: `${String(day).padStart(2, "0")}/${mm}/${period.year}`,
        work_date: workDate,
        site_code: null,
        source_code: clip(code, 16, errors),
        hours: {},
        parse_errors: errors,
      });
    }
    const hours: Record<string, number> = {};
    const hourErrors = [...rowErrors];
    for (const [col, code] of hourCols) {
      const n = parseHours(row[col]);
      if (n === undefined) continue;
      if (n === null) {
        if (!hourErrors.includes("HOURS_INVALID")) hourErrors.push("HOURS_INVALID");
        continue;
      }
      hours[code] = n;
    }
    if (Object.keys(hours).length || hourErrors.includes("HOURS_INVALID")) {
      used = true;
      lines.push({
        line_no: lineNo,
        source_ref: `L${lineNo}-HS`,
        kind: "HOURS",
        matricule,
        last_name: lastName,
        first_name: firstName,
        raw_date: `${period.year}-${mm}`,
        work_date: `${period.year}-${mm}-01`,
        site_code: null,
        source_code: null,
        hours,
        parse_errors: hourErrors,
      });
    }
    if (used) rows += 1;
    if (lines.length > ARCHIVE_MAX_LINES) return { ok: false, error: `Fichier trop long (plus de ${ARCHIVE_MAX_LINES} présences).` };
  }
  return {
    ok: true,
    lines,
    report: {
      header_row: headerIndex + 1,
      columns,
      ignored_columns: ignored,
      rows,
      day_columns: dayCols.size,
      hour_columns: [...hourCols.values()],
    },
  };
}

/**
 * One line per employee and day: columns Matricule, Nom, Prénom, Date, Code, Chantier (site code), and
 * optional HS50 / HS75 / HS100 hours of that day.
 */
export function parseRowsArchive(matrix: unknown[][]): ArchiveParseResult {
  const headerIndex = findHeader(matrix, [MATRICULE_KEYS, DATE_KEYS]);
  if (headerIndex < 0) return { ok: false, error: "En-tête introuvable : colonnes « Matricule » et « Date » attendues." };
  const header = matrix[headerIndex] ?? [];
  const cols: Record<"mat" | "last" | "first" | "date" | "code" | "site", number> = {
    mat: -1,
    last: -1,
    first: -1,
    date: -1,
    code: -1,
    site: -1,
  };
  const hourCols = new Map<number, string>();
  const columns: string[] = [];
  const ignored: string[] = [];
  header.forEach((v, idx) => {
    const key = headerKey(v);
    if (!key) return;
    const text = cellText(v);
    const slot = MATRICULE_KEYS.has(key)
      ? "mat"
      : LAST_NAME_KEYS.has(key)
        ? "last"
        : FIRST_NAME_KEYS.has(key)
          ? "first"
          : DATE_KEYS.has(key)
            ? "date"
            : CODE_KEYS.has(key)
              ? "code"
              : SITE_KEYS.has(key)
                ? "site"
                : null;
    if (slot && cols[slot] < 0) {
      cols[slot] = idx;
      columns.push(text);
    } else if (hourKey(v) && ![...hourCols.values()].includes(hourKey(v)!)) {
      hourCols.set(idx, hourKey(v)!);
      columns.push(text);
    } else {
      ignored.push(text);
    }
  });
  const missing = [
    cols.code < 0 ? "Code" : null,
    cols.site < 0 ? "Chantier" : null,
  ].filter(Boolean);
  if (missing.length) return { ok: false, error: `Colonne(s) obligatoire(s) absente(s) : ${missing.join(", ")}.` };

  const lines: ArchiveLine[] = [];
  let rows = 0;
  for (let r = headerIndex + 1; r < matrix.length; r += 1) {
    const row = matrix[r] ?? [];
    if (rowIsEmpty(row)) continue;
    rows += 1;
    const lineNo = r + 1;
    const errors: string[] = [];
    const rawDateValue = row[cols.date];
    const rawDate = clip(cellText(rawDateValue), 40, errors) || null;
    const workDate = parseArchiveDate(rawDateValue);
    if (rawDate && !workDate) errors.push("DATE_INVALID");
    const hours: Record<string, number> = {};
    for (const [col, code] of hourCols) {
      const n = parseHours(row[col]);
      if (n === undefined) continue;
      if (n === null) {
        if (!errors.includes("HOURS_INVALID")) errors.push("HOURS_INVALID");
        continue;
      }
      hours[code] = n;
    }
    lines.push({
      line_no: lineNo,
      source_ref: `L${lineNo}`,
      kind: "DAY",
      matricule: clip(cellText(row[cols.mat]), 40, errors),
      last_name: cols.last >= 0 ? clip(cellText(row[cols.last]), 120, errors) || null : null,
      first_name: cols.first >= 0 ? clip(cellText(row[cols.first]), 120, errors) || null : null,
      raw_date: rawDate,
      work_date: workDate,
      site_code: clip(cellText(row[cols.site]), 40, errors) || null,
      source_code: clip(cellText(row[cols.code]).toUpperCase(), 16, errors) || null,
      hours,
      parse_errors: errors,
    });
    if (lines.length > ARCHIVE_MAX_LINES) return { ok: false, error: `Fichier trop long (plus de ${ARCHIVE_MAX_LINES} lignes).` };
  }
  return {
    ok: true,
    lines,
    report: { header_row: headerIndex + 1, columns, ignored_columns: ignored, rows, hour_columns: [...hourCols.values()] },
  };
}

// ---------------------------------------------------------------------------
// CSV (UTF-8 only; separator ; , or tab detected on the first line)
// ---------------------------------------------------------------------------
export function decodeCsv(bytes: Uint8Array): { ok: true; text: string } | { ok: false; error: string } {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, text: text.replace(/^\uFEFF/, "") };
  } catch {
    return {
      ok: false,
      error: "Encodage du fichier CSV non reconnu : enregistrez-le en « CSV UTF-8 » puis déposez-le à nouveau.",
    };
  }
}

export function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = [";", ",", "\t"].map((d) => [d, first.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ";";
}

export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Views read from the database
// ---------------------------------------------------------------------------
export type ArchiveCounts = {
  read: number;
  ok: number;
  warning: number;
  error: number;
  duplicate: number;
  same: number;
  conflict: number;
  unresolved: number;
  take_import: number;
  keep_existing: number;
  hours_lines: number;
  importable: number;
};

export type ArchiveBatchWarning = { code: string; expected?: number; actual?: number; batch_no?: string; status?: string };

export type ArchiveAnalysis = {
  counts: ArchiveCounts;
  warnings: ArchiveBatchWarning[];
  errors_by_code: Record<string, number>;
  warnings_by_code: Record<string, number>;
  conflicts_by_kind: Record<string, number>;
  day_lines: number;
  employees: number;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v ?? 0) || 0);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const numMap = (v: unknown) => Object.fromEntries(Object.entries(rec(v)).map(([k, n]) => [k, num(n)]));

export function parseArchiveAnalysis(raw: unknown): ArchiveAnalysis {
  const a = rec(raw);
  const c = rec(a.counts);
  return {
    counts: {
      read: num(c.read),
      ok: num(c.ok),
      warning: num(c.warning),
      error: num(c.error),
      duplicate: num(c.duplicate),
      same: num(c.same),
      conflict: num(c.conflict),
      unresolved: num(c.unresolved),
      take_import: num(c.take_import),
      keep_existing: num(c.keep_existing),
      hours_lines: num(c.hours_lines),
      importable: num(c.importable),
    },
    warnings: (Array.isArray(a.warnings) ? a.warnings : []).map((w) => {
      const x = rec(w);
      return {
        code: String(x.code ?? ""),
        expected: x.expected == null ? undefined : num(x.expected),
        actual: x.actual == null ? undefined : num(x.actual),
        batch_no: typeof x.batch_no === "string" ? x.batch_no : undefined,
        status: typeof x.status === "string" ? x.status : undefined,
      };
    }),
    errors_by_code: numMap(a.errors_by_code),
    warnings_by_code: numMap(a.warnings_by_code),
    conflicts_by_kind: numMap(a.conflicts_by_kind),
    day_lines: num(a.day_lines),
    employees: num(a.employees),
  };
}

export function batchWarningText(w: ArchiveBatchWarning): string {
  const label = BATCH_WARNING_LABELS[w.code] ?? w.code;
  if (w.code === "DUPLICATE_FILE") return `${label} : lot ${w.batch_no ?? "?"} (${batchStatusLabel(w.status ?? "")}).`;
  return `${label} : ${w.actual ?? "?"} lu(s) pour ${w.expected ?? "?"} déclaré(s).`;
}

export type ExistingValue = { site_id: string; legend_code: string; status_code: string; source_code: string };

export function parseExisting(raw: unknown): ExistingValue[] {
  return (Array.isArray(raw) ? raw : []).map((v) => {
    const x = rec(v);
    return {
      site_id: String(x.site_id ?? ""),
      legend_code: String(x.legend_code ?? ""),
      status_code: String(x.status_code ?? ""),
      source_code: String(x.source_code ?? ""),
    };
  });
}

export const ATTENDANCE_SOURCE_LABELS: Record<string, string> = {
  MANUAL: "saisie",
  OM: "ordre de mission",
  AUTO: "automatique",
  IMPORT: "import",
};

/** Text of a value already recorded, as shown next to the imported one. */
export function existingValueText(v: { legend_code: string; status_code: string; source_code: string }, siteName?: string) {
  const status = v.status_code === "VALIDATED" ? "validée" : "proposée";
  return `${v.legend_code} (${ATTENDANCE_SOURCE_LABELS[v.source_code] ?? v.source_code}, ${status}${siteName ? `, ${siteName}` : ""})`;
}

/** Actions the batch status allows (the database checks them again). */
export function batchActions(status: string, sealed: boolean) {
  return {
    analyze: sealed && (status === "DRAFT" || status === "ANALYZED" || status === "PENDING_DECISION"),
    mapping: status === "ANALYZED" || status === "PENDING_DECISION",
    commit: status === "ANALYZED",
    validate: status === "IMPORTED",
    reject: status === "DRAFT" || status === "ANALYZED" || status === "PENDING_DECISION",
    cancel: status === "IMPORTED" || status === "VALIDATED",
    pieces: status !== "REJECTED" && status !== "CANCELLED",
  };
}

/** Why the author may not validate the batch (null when allowed). Mirrors hr_attendance_import_validate. */
export function selfValidationBlocker(input: {
  createdBy: string;
  userId: string;
  isSuperAdmin: boolean;
  importerMayValidate: boolean | null;
}): string | null {
  if (input.isSuperAdmin || input.createdBy !== input.userId || input.importerMayValidate === true) return null;
  return "Séparation des tâches : vous avez importé ce lot, sa validation revient à une autre personne (politique D12).";
}

export function archivePathOf(folder: string, ext: "xlsx" | "csv") {
  return `${folder}/source.${ext}`;
}

export function sourceExtOf(fileName: string): "xlsx" | "csv" | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx")) return "xlsx";
  if (lower.endsWith(".csv")) return "csv";
  return null;
}

export function chunk<T>(items: T[], size = ARCHIVE_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
