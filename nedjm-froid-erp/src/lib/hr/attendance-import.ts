export type ImportedAttendanceCell = {
  employee_id: string;
  work_date: string;
  legend_code: string;
};

export type AttendanceImportResult = {
  cells: ImportedAttendanceCell[];
  /** Overtime hours per employee (HS50 / HS75 / HS100 columns), when present. */
  hours: Record<string, Record<string, string>>;
  errors: string[];
  rows: number;
};

const MATRICULE_HEADERS = new Set(["MATRICULE", "MAT", "MATR", "الرقم التسلسلي"]);
const MAX_ERRORS = 30;

/** exceljs cell values: plain, rich text, hyperlink, formula result. */
export function cellText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const v = value as { result?: unknown; richText?: { text: string }[]; text?: unknown };
    if (v.richText) return v.richText.map((r) => r.text).join("").trim();
    if (v.result !== undefined) return cellText(v.result);
    if (v.text !== undefined) return cellText(v.text);
    return "";
  }
  return String(value).trim();
}

/** Excel drops leading zeros of numeric matricules ("031" → 31). */
function matriculeKey(mat: string) {
  return mat.trim().toUpperCase().replace(/^0+(?=\d)/, "");
}

function dayOfHeader(value: unknown, days: number): number | null {
  const text = cellText(value);
  if (!/^\d{1,2}$/.test(text)) return null;
  const day = Number(text);
  return day >= 1 && day <= days ? day : null;
}

/**
 * Sheet layout: one header row with a "Matricule" column and day columns 1..31
 * (optional HS50 / HS75 / HS100 hour columns), then one row per employee with legend codes.
 * Empty cells leave the grid unchanged.
 */
export function parseAttendanceMatrix(
  matrix: unknown[][],
  ctx: {
    year: number;
    month: number;
    employeeByMatricule: Map<string, string>;
    allowedCodes: Set<string>;
    hourColumns?: readonly string[];
  },
): AttendanceImportResult {
  const days = new Date(ctx.year, ctx.month, 0).getDate();
  const mm = String(ctx.month).padStart(2, "0");
  const errors: string[] = [];
  const pushError = (msg: string) => {
    if (errors.length < MAX_ERRORS) errors.push(msg);
  };
  const headerIndex = matrix.findIndex((row) =>
    row.some((v) => MATRICULE_HEADERS.has(cellText(v).toUpperCase())),
  );
  if (headerIndex < 0) {
    return { cells: [], hours: {}, errors: ["Colonne « Matricule » introuvable. · عمود الرقم التسلسلي غير موجود."], rows: 0 };
  }
  const header = matrix[headerIndex];
  const matCol = header.findIndex((v) => MATRICULE_HEADERS.has(cellText(v).toUpperCase()));
  const dayCols = new Map<number, number>();
  const hourCols = new Map<number, string>();
  const hourCodes = new Set((ctx.hourColumns ?? []).map((c) => c.toUpperCase()));
  header.forEach((v, idx) => {
    if (idx === matCol) return;
    const day = dayOfHeader(v, days);
    if (day != null && !dayCols.has(day)) {
      dayCols.set(day, idx);
      return;
    }
    const code = cellText(v).toUpperCase().replace(/\s+/g, "");
    if (hourCodes.has(code)) hourCols.set(idx, code);
  });
  if (!dayCols.size && !hourCols.size) {
    return { cells: [], hours: {}, errors: ["Aucune colonne de jour (1..31) dans l'en-tête. · لا توجد أعمدة أيام."], rows: 0 };
  }

  const byKey = new Map([...ctx.employeeByMatricule].map(([mat, id]) => [matriculeKey(mat), id]));
  const cells: ImportedAttendanceCell[] = [];
  const hours: Record<string, Record<string, string>> = {};
  const seen = new Set<string>();
  let rows = 0;
  for (let r = headerIndex + 1; r < matrix.length; r += 1) {
    const row = matrix[r] ?? [];
    const mat = cellText(row[matCol]);
    if (!mat) continue;
    const line = r + 1;
    const employeeId = byKey.get(matriculeKey(mat));
    if (!employeeId) {
      pushError(`Ligne ${line} : matricule ${mat} absent de ce chantier pour ce mois.`);
      continue;
    }
    if (seen.has(employeeId)) {
      pushError(`Ligne ${line} : matricule ${mat} en double, ligne ignorée.`);
      continue;
    }
    seen.add(employeeId);
    rows += 1;
    for (const [day, col] of dayCols) {
      const code = cellText(row[col]).toUpperCase();
      if (!code) continue;
      if (!ctx.allowedCodes.has(code)) {
        pushError(`Ligne ${line}, jour ${day} : code « ${code} » inconnu.`);
        continue;
      }
      cells.push({ employee_id: employeeId, work_date: `${ctx.year}-${mm}-${String(day).padStart(2, "0")}`, legend_code: code });
    }
    for (const [col, code] of hourCols) {
      const raw = cellText(row[col]).replace(",", ".");
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 300) {
        pushError(`Ligne ${line} : ${code} « ${raw} » invalide.`);
        continue;
      }
      hours[employeeId] = { ...(hours[employeeId] ?? {}), [code]: String(n) };
    }
  }
  return { cells, hours, errors, rows };
}
