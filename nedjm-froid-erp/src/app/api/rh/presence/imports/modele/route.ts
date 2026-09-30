import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { XLSX_MIME } from "@/lib/hr/attendance-archive";

/** Empty workbook for archives in the "one line per employee and day" format, with the codes and sites to use. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Session requise." }, { status: 401 });
  const { data: allowed } = await supabase.rpc("hr_att_import_has", { p_screen: "hr_attendance_import", p_action: "create" });
  if (allowed !== true) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  const [legends, sites] = await Promise.all([
    supabase.from("ref_legendes").select("code, label_fr, is_active").order("code"),
    supabase.from("ref_sites").select("code, name_fr, is_active").order("code"),
  ]);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Presences");
  ws.addRow(["Matricule", "Nom", "Prénom", "Date", "Code", "Chantier", "HS50", "HS75", "HS100"]).font = { bold: true };
  ws.getColumn(1).numFmt = "@";
  ws.getColumn(4).numFmt = "dd/mm/yyyy";
  [12, 18, 16, 12, 8, 12, 7, 7, 7].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const help = wb.addWorksheet("Mode d'emploi");
  [
    ["Une ligne par salarié et par jour travaillé ou absent."],
    ["Date : JJ/MM/AAAA ou date Excel. Code : code de présence du référentiel (feuille « Codes »)."],
    ["Chantier : code du chantier (feuille « Chantiers »). HS50 / HS75 / HS100 : heures supplémentaires du jour, facultatives."],
    ["Le fichier est contrôlé à l'import ; rien n'est enregistré sans votre confirmation, ni validé sans décision."],
  ].forEach((r) => help.addRow(r));
  help.getColumn(1).width = 110;

  const codes = wb.addWorksheet("Codes");
  codes.addRow(["Code", "Libellé"]).font = { bold: true };
  for (const l of legends.data ?? []) if (l.is_active !== false) codes.addRow([l.code, l.label_fr]);

  const siteSheet = wb.addWorksheet("Chantiers");
  siteSheet.addRow(["Code", "Chantier"]).font = { bold: true };
  for (const s of sites.data ?? []) if (s.is_active !== false) siteSheet.addRow([s.code, s.name_fr]);

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": 'attachment; filename="modele_archives_presences.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
