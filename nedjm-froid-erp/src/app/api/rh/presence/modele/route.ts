import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listAttendanceRoster } from "@/lib/actions/hr-ops";
import { loadAttendanceSheet } from "@/lib/actions/hr-attendance-sheet";
import { contractsForMonth, OVERTIME_COLUMNS } from "@/lib/hr/attendance-columns";
import { resolvePayrollPeriod } from "@/lib/hr/payroll-calc";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pre-filled attendance workbook for a site and month (template for Excel import). */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const siteId = params.get("site") ?? "";
  if (!UUID_RE.test(siteId)) return NextResponse.json({ error: "Chantier invalide." }, { status: 400 });
  const { year, month } = resolvePayrollPeriod(params.get("year") ?? undefined, params.get("month") ?? undefined);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Session requise." }, { status: 401 });

  const [roster, sheet, legends] = await Promise.all([
    listAttendanceRoster(),
    loadAttendanceSheet({ site_id: siteId, year, month }),
    supabase.from("ref_legendes").select("code, label_fr, is_active").order("code"),
  ]);
  if (!roster.ok) return NextResponse.json({ error: roster.error }, { status: 403 });
  if (!sheet.ok) return NextResponse.json({ error: sheet.error }, { status: 403 });

  const people = contractsForMonth(roster.data.filter((r) => r.site_id === siteId), year, month).sort((a, b) =>
    a.last_name.localeCompare(b.last_name, "fr"),
  );
  const days = new Date(year, month, 0).getDate();
  const codeAt = new Map(sheet.data.cells.map((c) => [`${c.employee_id}|${Number(c.work_date.slice(8, 10))}`, c.legend_code]));
  const rowValues = new Map(sheet.data.rows.map((r) => [r.employee_id, r.values]));
  const siteName = people[0]?.site_name ?? "";

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Pointage");
  ws.addRow([`POINTAGE ${String(month).padStart(2, "0")}/${year}`, siteName]);
  const header = ["Matricule", "Nom", "Prénom", ...Array.from({ length: days }, (_, i) => i + 1), ...OVERTIME_COLUMNS.map((c) => c.code)];
  ws.addRow(header).font = { bold: true };
  for (const p of people) {
    const values = rowValues.get(p.employee_id) ?? {};
    ws.addRow([
      p.matricule,
      p.last_name,
      p.first_name,
      ...Array.from({ length: days }, (_, i) => codeAt.get(`${p.employee_id}|${i + 1}`) ?? ""),
      ...OVERTIME_COLUMNS.map((c) => (values[c.code] ? Number(values[c.code]) : "")),
    ]);
  }
  ws.getColumn(1).numFmt = "@";
  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 16;
  for (let i = 4; i < 4 + days; i += 1) ws.getColumn(i).width = 5;
  ws.views = [{ state: "frozen", xSplit: 3, ySplit: 2 }];

  const codes = wb.addWorksheet("Codes");
  codes.addRow(["Code", "Libellé"]).font = { bold: true };
  for (const l of legends.data ?? []) {
    if (l.is_active !== false) codes.addRow([l.code, l.label_fr]);
  }
  codes.addRow([]);
  codes.addRow(["HS50 / HS75 / HS100", "Heures supplémentaires du mois (nombre d'heures)"]);

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `pointage_${year}_${String(month).padStart(2, "0")}.xlsx`;
  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
