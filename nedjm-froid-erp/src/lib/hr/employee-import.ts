import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import type { HrEmployeeField } from "@/lib/actions/hr-employees";
import { missingRequiredFields } from "@/lib/hr/employee-field-utils";
import { normalizeFicheValues, validateFicheConstraints } from "@/lib/hr/employee-fiche-constraints";

/** Target of an old-base column: a fiche field code, or the row number of the old sheet. */
export const EXCEL_NO = "__excel_no";

export const EMPLOYEE_IMPORT_MAX_ROWS = 3000;

export function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f\u0640\u064b-\u0652]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Usual headers of old staff lists, by fiche field code. */
const ALIASES: Record<string, string[]> = {
  [EXCEL_NO]: ["n", "no", "nr", "num", "numero", "n ordre", "ordre", "n d ordre"],
  matricule: ["mat", "matricule", "code employe", "n matricule", "رقم التسجيل"],
  last_name: ["nom", "nom latin", "nom fr", "nom francais", "last name"],
  first_name: ["prenom", "prenom latin", "prenom fr", "prenom francais", "first name", "prenoms"],
  last_name_ar: ["nom arabe", "nom ar", "اللقب بالعربية"],
  first_name_ar: ["prenom arabe", "prenom ar", "الاسم بالعربية"],
  birth_date: ["date de naissance", "date naissance", "ne le", "nee le", "ddn", "تاريخ الازدياد"],
  birth_place_fr: ["lieu de naissance", "lieu naissance", "ne a", "nee a"],
  nss: ["nss", "n ss", "n securite sociale", "numero securite sociale", "securite sociale", "n assurance"],
  nin: ["nin", "n nin", "numero d identification nationale"],
  hired_at: [
    "date d entree",
    "date entree",
    "date embauche",
    "date d embauche",
    "date recrutement",
    "date de recrutement",
    "entree",
    "date d entree en service",
  ],
  phone: ["telephone", "tel", "mobile", "portable", "n tel", "n telephone"],
  address_fr: ["adresse", "adresse residentielle", "residence"],
  account_no: ["ccp", "rip", "compte", "rib", "n compte", "n ccp", "compte ccp"],
  poste: ["poste", "fonction", "emploi", "poste occupe", "qualification"],
  affectation: ["chantier", "affectation", "site", "lieu de travail", "lieu d affectation"],
  sex_code: ["sexe", "genre"],
  marital_code: ["situation familiale", "etat civil", "situation", "sf"],
  children_count: ["enfants", "nombre enfants", "nombre d enfants", "nbr enfants", "nb enfants"],
  father_name: ["pere", "prenom pere", "prenom du pere", "fils de"],
  mother_name: ["mere", "nom mere", "nom et prenom mere", "et de"],
  id_number: ["n piece", "cni", "n cni", "carte d identite", "n carte d identite"],
  blood_code: ["groupe sanguin", "gs", "g sanguin"],
  email: ["mail", "e mail", "courriel"],
  status: ["statut", "etat"],
};

export type ImportTarget = { code: string; label: string };

/** Fields a column can be sent to (old row number first). */
export function importTargets(fields: HrEmployeeField[]): ImportTarget[] {
  return [
    { code: EXCEL_NO, label: "N° (ancienne base)" },
    ...fields
      .filter((f) => f.is_active && f.code !== "photo_url")
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((f) => ({ code: f.code, label: f.label_fr || f.label_ar || f.code })),
  ];
}

function headerTarget(header: string, fields: HrEmployeeField[]): string | null {
  const norm = normalizeHeader(header);
  if (!norm) return null;
  const active = fields.filter((f) => f.is_active && f.code !== "photo_url");
  const byLabel = (value: string) =>
    active.find(
      (f) =>
        normalizeHeader(f.code) === value ||
        normalizeHeader(f.label_fr) === value ||
        normalizeHeader(f.label_ar) === value,
    )?.code ?? null;
  const byAlias = (value: string) =>
    Object.entries(ALIASES).find(
      ([code, names]) => (code === EXCEL_NO || active.some((f) => f.code === code)) && names.includes(value),
    )?.[0] ?? null;
  const direct = byLabel(norm) ?? byAlias(norm);
  if (direct) return direct;
  for (const part of header.split(/[\n/|·—–]|\s-\s/)) {
    const p = normalizeHeader(part);
    if (!p || p === norm) continue;
    const hit = byLabel(p) ?? byAlias(p);
    if (hit) return hit;
  }
  return null;
}

/** Column → target code, each target used once (the first column wins). */
export function guessMapping(headers: string[], fields: HrEmployeeField[]): (string | null)[] {
  const used = new Set<string>();
  return headers.map((h) => {
    const target = headerTarget(h, fields);
    if (!target || used.has(target)) return null;
    used.add(target);
    return target;
  });
}

/** Index of the header row: the one, among the first rows, whose cells match the most fields. */
export function findHeaderRow(matrix: string[][], fields: HrEmployeeField[]): number {
  let best = 0;
  let bestHits = -1;
  for (let i = 0; i < Math.min(matrix.length, 15); i += 1) {
    const hits = guessMapping(matrix[i], fields).filter(Boolean).length;
    if (hits > bestHits) {
      best = i;
      bestHits = hits;
    }
  }
  return best;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function validDate(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** yyyy-mm-dd, dd/mm/yyyy (also - or .), two-digit years, or an Excel serial day. */
export function toIsoDate(raw: string): string | null {
  const v = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(v);
  if (m) {
    let y = Number(m[3]);
    if (m[3].length === 2) y += y > 30 ? 1900 : 2000;
    return validDate(y, Number(m[2]), Number(m[1]));
  }
  if (/^\d{4,5}(\.\d+)?$/.test(v)) {
    const serial = Math.floor(Number(v));
    if (serial < 2000 || serial > 80000) return null;
    const date = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
    return validDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  return null;
}

function catalogCode(raw: string, kind: string, catalogs: CatalogItem[]): string | null {
  const norm = normalizeHeader(raw);
  const items = catalogs.filter((c) => c.kind === kind);
  const exact = items.find(
    (c) =>
      normalizeHeader(c.code) === norm ||
      normalizeHeader(c.label_fr) === norm ||
      normalizeHeader(c.label_ar) === norm,
  );
  if (exact) return exact.code;
  const prefixed = items.find((c) => norm.startsWith(`${normalizeHeader(c.code)} `));
  return prefixed?.code ?? null;
}

const STATUS_WORDS: [string, string[]][] = [
  ["ACTIVE", ["active", "actif", "en poste", "en activite", "نشط", "يعمل"]],
  ["INACTIVE", ["inactive", "inactif", "sorti", "parti", "demission", "licencie", "fin de contrat", "غير نشط"]],
  ["SUSPENDED", ["suspendu", "suspended", "موقوف"]],
];

function statusCode(raw: string): string | null {
  const norm = normalizeHeader(raw);
  const upper = raw.trim().toUpperCase();
  if (["ACTIVE", "INACTIVE", "SUSPENDED", "DISABLED", "INVITED"].includes(upper)) return upper;
  return STATUS_WORDS.find(([, words]) => words.includes(norm))?.[0] ?? null;
}

export type ImportRowStatus = "new" | "exists" | "duplicate" | "invalid";

export type ImportRow = {
  /** Line number in the sheet (1 = first line). */
  line: number;
  status: ImportRowStatus;
  name: string;
  matricule: string;
  values: Record<string, string>;
  excelNo: number | null;
  issues: string[];
  warnings: string[];
};

export type ExistingEmployee = { matricule: string; nin?: string | null };

/** Rows of the old base turned into fiche values, with what blocks or alters each one. */
export function buildImportRows(input: {
  matrix: string[][];
  headerRow: number;
  mapping: (string | null)[];
  fields: HrEmployeeField[];
  catalogs: CatalogItem[];
  existing: ExistingEmployee[];
}): ImportRow[] {
  const { matrix, headerRow, mapping, fields, catalogs } = input;
  const byCode = new Map(fields.map((f) => [f.code, f]));
  const headers = matrix[headerRow] ?? [];
  const takenMat = new Set(input.existing.map((e) => e.matricule.trim().toUpperCase()));
  const takenNin = new Set(input.existing.map((e) => (e.nin ?? "").trim()).filter(Boolean));
  const seenMat = new Set<string>();
  const seenNin = new Set<string>();
  const rows: ImportRow[] = [];

  matrix.slice(headerRow + 1, headerRow + 1 + EMPLOYEE_IMPORT_MAX_ROWS).forEach((cells, index) => {
    if (!cells.some((c) => c.trim())) return;
    const values: Record<string, string> = { status: "ACTIVE", irg_category: "STANDARD" };
    const warnings: string[] = [];
    let excelNo: number | null = null;

    mapping.forEach((code, col) => {
      const raw = (cells[col] ?? "").trim();
      if (!code || !raw) return;
      const header = headers[col] || `colonne ${col + 1}`;
      if (code === EXCEL_NO) {
        const n = Number(raw);
        excelNo = Number.isFinite(n) ? n : null;
        return;
      }
      const field = byCode.get(code);
      if (!field) return;
      if (code === "status") {
        const s = statusCode(raw);
        if (s) values.status = s;
        else warnings.push(`${header} : « ${raw} » non reconnu, statut Actif`);
        return;
      }
      if (field.value_type === "date") {
        const iso = toIsoDate(raw);
        if (iso) values[code] = iso;
        else warnings.push(`${header} : date illisible « ${raw} »`);
        return;
      }
      if (field.value_type === "number") {
        const n = Number(raw.replace(",", "."));
        if (Number.isFinite(n)) values[code] = String(Math.round(n));
        else warnings.push(`${header} : nombre illisible « ${raw} »`);
        return;
      }
      if (field.value_type === "catalog" && field.catalog_kind) {
        const c = catalogCode(raw, field.catalog_kind, catalogs);
        if (c) values[code] = c;
        else if (field.storage_group === "extra") {
          values[code] = raw;
          warnings.push(`${header} : « ${raw} » hors liste, gardé tel quel`);
        } else warnings.push(`${header} : « ${raw} » hors liste, ignoré`);
        return;
      }
      values[code] = raw;
    });

    const normalized = normalizeFicheValues(values) as Record<string, string>;
    for (const issue of validateFicheConstraints(normalized)) {
      warnings.push(`${issue.message} Valeur ignorée.`);
      normalized[issue.code] = "";
    }

    const matricule = (normalized.matricule ?? "").trim();
    const nin = (normalized.nin ?? "").trim();
    const issues = missingRequiredFields(
      { ...normalized, matricule: matricule || "auto" },
      fields,
    ).map((f) => f.label_fr || f.label_ar || f.code);
    if (!matricule) warnings.push("Matricule absent : attribué automatiquement");

    let status: ImportRowStatus = "new";
    const matKey = matricule.toUpperCase();
    if ((matricule && takenMat.has(matKey)) || (nin && takenNin.has(nin))) status = "exists";
    else if ((matricule && seenMat.has(matKey)) || (nin && seenNin.has(nin))) status = "duplicate";
    else if (issues.length) status = "invalid";
    if (matricule) seenMat.add(matKey);
    if (nin) seenNin.add(nin);

    rows.push({
      line: headerRow + index + 2,
      status,
      name: [normalized.last_name, normalized.first_name].filter(Boolean).join(" ") ||
        [normalized.last_name_ar, normalized.first_name_ar].filter(Boolean).join(" "),
      matricule,
      values: normalized,
      excelNo,
      issues: issues.length ? [`Champs obligatoires manquants : ${issues.join(", ")}`] : [],
      warnings,
    });
  });
  return rows;
}
