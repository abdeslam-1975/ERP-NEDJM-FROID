"use server";

import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { listAttendanceRoster } from "@/lib/actions/hr-ops";
import { contractsForMonth, OVERTIME_COLUMNS } from "@/lib/hr/attendance-columns";
import { parseAttendanceMatrix, type AttendanceImportResult } from "@/lib/hr/attendance-import";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const MAX_BYTES = 2_000_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sheetToMatrix(ws: ExcelJS.Worksheet): unknown[][] {
  const rows: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    rows[rowNumber - 1] = values;
  });
  return Array.from(rows, (r) => r ?? []);
}

/** Parses an attendance workbook against the month's roster; nothing is saved here. */
export async function parseAttendanceImport(
  formData: FormData,
): Promise<ActionResult<AttendanceImportResult>> {
  const file = formData.get("file");
  const siteId = String(formData.get("site_id") ?? "");
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choisissez un fichier Excel. · اختر ملف إكسل." };
  }
  if (file.size > MAX_BYTES) return { ok: false, error: "Fichier trop volumineux (2 Mo max)." };
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return { ok: false, error: "Format attendu : .xlsx · الصيغة المطلوبة xlsx." };
  }
  if (!UUID_RE.test(siteId) || !Number.isInteger(year) || month < 1 || month > 12) {
    return { ok: false, error: "Chantier ou période invalide." };
  }

  const supabase = await createClient();
  const [roster, legends] = await Promise.all([
    listAttendanceRoster(),
    supabase.from("ref_legendes").select("code, is_active"),
  ]);
  if (!roster.ok) return roster;
  if (legends.error) return { ok: false, error: legends.error.message };

  const employeeByMatricule = new Map(
    contractsForMonth(roster.data.filter((r) => r.site_id === siteId), year, month)
      .filter((r) => r.matricule)
      .map((r) => [r.matricule, r.employee_id] as const),
  );
  const allowedCodes = new Set(
    (legends.data ?? []).filter((l) => l.is_active !== false).map((l) => String(l.code).toUpperCase()),
  );

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    return { ok: false, error: "Fichier Excel illisible. · ملف إكسل غير مقروء." };
  }
  const ws = wb.worksheets[0];
  if (!ws) return { ok: false, error: "Classeur sans feuille. · ملف بلا ورقة." };

  return {
    ok: true,
    data: parseAttendanceMatrix(sheetToMatrix(ws), {
      year,
      month,
      employeeByMatricule,
      allowedCodes,
      hourColumns: OVERTIME_COLUMNS.map((c) => c.code),
    }),
  };
}
