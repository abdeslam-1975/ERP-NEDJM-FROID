import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  XLSX_MIME,
  anomalyLabel,
  archiveFormatLabel,
  batchStatusLabel,
  conflictLabel,
  lineStatusLabel,
  natureLabel,
  parseArchiveAnalysis,
  parseExisting,
  provenanceLabel,
  existingValueText,
} from "@/lib/hr/attendance-archive";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 1000;

/** Full control report of a batch: summary and every line with its anomalies and the values already recorded. */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("lot") ?? "";
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Lot invalide." }, { status: 400 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Session requise." }, { status: 401 });

  const { data: batch } = await supabase
    .from("hr_attendance_import_batches")
    .select(
      `batch_no, format, period_from, period_to, reference_year, site_ids, nature, provenance_kind, provenance_detail,
       source_produced_on, comment, control_lines, control_employees, file_name, sha256, status, analysis, created_at,
       creator:sys_users!created_by ( full_name )`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!batch) return NextResponse.json({ error: "Lot introuvable ou non visible avec vos droits." }, { status: 404 });

  const { data: siteRows } = await supabase.from("ref_sites").select("id, name_fr").in("id", batch.site_ids ?? []);
  const lines: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("hr_attendance_import_lines")
      .select(
        `line_no, source_ref, kind, matricule, last_name, first_name, raw_date, work_date, site_code, source_code, hours,
         legend_code, code_origin, status, errors, warnings, conflict_kinds, existing, resolution,
         employee:hr_employees ( last_name, first_name ), site:ref_sites ( name_fr )`,
      )
      .eq("batch_id", id)
      .order("line_no")
      .order("source_ref")
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    lines.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  const allSiteIds = new Set<string>();
  for (const l of lines) for (const e of parseExisting(l.existing)) allSiteIds.add(e.site_id);
  const { data: otherSites } = allSiteIds.size
    ? await supabase.from("ref_sites").select("id, name_fr").in("id", [...allSiteIds])
    : { data: [] as { id: string; name_fr: string }[] };
  const siteName = new Map((otherSites ?? []).map((s) => [s.id as string, s.name_fr as string]));

  const analysis = parseArchiveAnalysis(batch.analysis);
  const creator = Array.isArray(batch.creator) ? batch.creator[0] : batch.creator;
  const wb = new ExcelJS.Workbook();
  const sum = wb.addWorksheet("Synthèse");
  sum.getColumn(1).width = 34;
  sum.getColumn(2).width = 80;
  const facts: [string, string | number][] = [
    ["Lot", batch.batch_no],
    ["Statut", batchStatusLabel(batch.status)],
    ["Format", archiveFormatLabel(batch.format)],
    ["Période", `${batch.period_from.slice(0, 7)} → ${batch.period_to.slice(0, 7)}`],
    ["Année de référence", batch.reference_year],
    ["Nature", natureLabel(batch.nature)],
    ["Chantiers", (siteRows ?? []).map((s) => s.name_fr).join(", ")],
    ["Provenance", `${provenanceLabel(batch.provenance_kind)} — ${batch.provenance_detail}`],
    ["Date du document source", batch.source_produced_on ?? "—"],
    ["Commentaire", batch.comment ?? "—"],
    ["Fichier", batch.file_name],
    ["Empreinte SHA-256", batch.sha256],
    ["Déposé par", `${creator?.full_name ?? "?"} le ${new Date(batch.created_at).toLocaleString("fr-FR")}`],
    ["Total de contrôle déclaré (présences)", batch.control_lines ?? "—"],
    ["Total de contrôle déclaré (salariés)", batch.control_employees ?? "—"],
    ["Lignes lues", analysis.counts.read],
    ["Acceptées", analysis.counts.ok],
    ["Rejetées", analysis.counts.error],
    ["Doublons ignorés", analysis.counts.duplicate],
    ["Déjà enregistrées à l'identique", analysis.counts.same],
    ["En conflit", analysis.counts.conflict],
    ["Conflits non tranchés", analysis.counts.unresolved],
    ["Lignes d'heures supplémentaires acceptées", analysis.counts.hours_lines],
    ["Présences importables", analysis.counts.importable],
  ];
  sum.addRow(["Rapport de contrôle d'un import de présences"]).font = { bold: true, size: 13 };
  sum.addRow(["Aucune paie n'a été créée ni recalculée par cet import. Une présence reprise n'atteste ni un paiement ni une déclaration."]);
  sum.addRow([]);
  for (const [k, v] of facts) sum.addRow([k, v]).getCell(1).font = { bold: true };
  sum.addRow([]);
  sum.addRow(["Anomalies (nombre de lignes)"]).font = { bold: true };
  for (const [code, n] of Object.entries({ ...analysis.errors_by_code, ...analysis.warnings_by_code })) {
    sum.addRow([anomalyLabel(code), n]);
  }

  const ws = wb.addWorksheet("Lignes");
  ws.addRow([
    "Ligne",
    "Référence",
    "Type",
    "Matricule",
    "Nom (fichier)",
    "Prénom (fichier)",
    "Salarié reconnu",
    "Date (fichier)",
    "Date",
    "Chantier (fichier)",
    "Chantier",
    "Code (fichier)",
    "Code retenu",
    "Heures",
    "Statut",
    "Anomalies",
    "Conflit",
    "Déjà enregistré",
    "Choix",
  ]).font = { bold: true };
  for (const l of lines) {
    const emp = (Array.isArray(l.employee) ? l.employee[0] : l.employee) as { last_name: string; first_name: string } | null;
    const site = (Array.isArray(l.site) ? l.site[0] : l.site) as { name_fr: string } | null;
    const hours = Object.entries((l.hours ?? {}) as Record<string, number>)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ");
    ws.addRow([
      l.line_no,
      l.source_ref,
      l.kind === "HOURS" ? "Heures sup." : "Jour",
      l.matricule,
      l.last_name ?? "",
      l.first_name ?? "",
      emp ? `${emp.last_name} ${emp.first_name}` : "",
      l.raw_date ?? "",
      l.work_date ?? "",
      l.site_code ?? "",
      site?.name_fr ?? "",
      l.source_code ?? "",
      l.legend_code ?? "",
      hours,
      lineStatusLabel(String(l.status)),
      [...((l.errors as string[]) ?? []), ...((l.warnings as string[]) ?? [])].map(anomalyLabel).join(" ; "),
      ((l.conflict_kinds as string[]) ?? []).map(conflictLabel).join(" ; "),
      parseExisting(l.existing)
        .map((e) => existingValueText(e, siteName.get(e.site_id)))
        .join(" ; "),
      l.resolution === "IMPORT" ? "Retenir l'import" : l.resolution === "KEEP" ? "Conserver l'existant" : "",
    ]);
  }
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: "S1" };

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="rapport_${batch.batch_no}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
