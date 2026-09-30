import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { XLSX_MIME } from "@/lib/hr/attendance-archive";
import { parseLegacyRules, parseRuleBlockers, ruleFamilyLabel } from "@/lib/decisions/catalog";
import { parseSimulationTotals } from "@/lib/hr/payroll-simulation";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 1000;
const BANNER =
  "SIMULATION — RÈGLES NON APPROUVÉES. Ce document n'est ni un bulletin de paie, ni un ordre de paiement, ni une déclaration. Il ne peut être ni validé, ni payé, ni déclaré.";

/** D1 simulation (read under RLS: salary readers within their site scope). */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("simulation") ?? "";
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Simulation invalide." }, { status: 400 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Session requise." }, { status: 401 });

  const { data: sim } = await supabase
    .from("hr_payroll_simulations")
    .select(
      `id, decision_id, period_year, period_month, blockers, legacy, warnings, slip_count, totals, created_at,
       site:ref_sites ( name_fr ), creator:sys_users!created_by ( full_name )`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!sim) return NextResponse.json({ error: "Simulation introuvable ou non visible avec vos droits." }, { status: 404 });

  const slips: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("hr_payroll_simulation_slips")
      .select(
        `days_paid, gross_amount, employee_ss, employer_ss, irg_amount, net_payable, detail,
         employee:hr_employees ( matricule, last_name, first_name ), site:ref_sites ( name_fr )`,
      )
      .eq("simulation_id", id)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    slips.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const site = one(sim.site as { name_fr: string } | { name_fr: string }[] | null);
  const creator = one(sim.creator as { full_name: string } | { full_name: string }[] | null);
  const period = `${String(sim.period_month).padStart(2, "0")}/${sim.period_year}`;
  const totals = parseSimulationTotals(sim.totals);
  const legacy = parseLegacyRules(sim.legacy);

  const wb = new ExcelJS.Workbook();
  const sum = wb.addWorksheet("Synthèse");
  sum.getColumn(1).width = 36;
  sum.getColumn(2).width = 90;
  sum.addRow([BANNER]).font = { bold: true, color: { argb: "FFB91C1C" } };
  sum.addRow([]);
  const facts: [string, string | number][] = [
    ["Mois", period],
    ["Chantier", site?.name_fr ?? "Tous les chantiers"],
    ["Calculée par", `${creator?.full_name ?? "?"} le ${new Date(sim.created_at).toLocaleString("fr-FR")}`],
    ["Décision D1", sim.decision_id],
    ["Salariés", sim.slip_count],
    ["Brut cotisable", totals.gross],
    ["Retenue sécurité sociale", totals.employee_ss],
    ["Part patronale", totals.employer_ss],
    ["IRG", totals.irg],
    ["Net à payer (simulé)", totals.net],
  ];
  for (const [k, v] of facts) sum.addRow([k, v]).getCell(1).font = { bold: true };
  sum.addRow([]);
  sum.addRow(["Règles en attente non appliquées dans ce calcul"]).font = { bold: true };
  for (const b of parseRuleBlockers(sim.blockers)) {
    sum.addRow([ruleFamilyLabel(b.family), `${b.title} (${b.status}, mois ${b.month ?? "?"})`]);
  }
  const legacyRows = [...legacy.legal_vars, ...legacy.cnas_rates, ...legacy.irg_bareme, ...legacy.irg_rules];
  if (legacyRows.length) {
    sum.addRow([]);
    sum.addRow(["Valeurs héritées non vérifiées (utilisées)"]).font = { bold: true };
    for (const r of legacyRows) sum.addRow([r.code, r.label ?? ""]);
  }
  const warnings = Array.isArray(sim.warnings) ? (sim.warnings as unknown[]).map(String) : [];
  if (warnings.length) {
    sum.addRow([]);
    sum.addRow(["Avertissements du calcul"]).font = { bold: true };
    for (const w of warnings) sum.addRow(["", w]);
  }

  const ws = wb.addWorksheet("Salariés");
  ws.addRow([BANNER]).font = { bold: true, color: { argb: "FFB91C1C" } };
  ws.addRow([
    "Matricule",
    "Nom",
    "Chantier",
    "Jours payés",
    "Brut cotisable",
    "Retenue SS",
    "Part patronale",
    "IRG",
    "Net simulé",
  ]).font = { bold: true };
  for (const s of slips) {
    const emp = one(s.employee as { matricule: string; last_name: string; first_name: string } | null);
    const st = one(s.site as { name_fr: string } | null);
    ws.addRow([
      emp?.matricule ?? "",
      emp ? `${emp.last_name} ${emp.first_name}` : "",
      st?.name_fr ?? "",
      Number(s.days_paid),
      Number(s.gross_amount),
      Number(s.employee_ss),
      Number(s.employer_ss),
      Number(s.irg_amount),
      Number(s.net_payable),
    ]);
  }
  ws.views = [{ state: "frozen", ySplit: 2 }];

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="simulation_regles_non_approuvees_${sim.period_year}_${String(sim.period_month).padStart(2, "0")}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
