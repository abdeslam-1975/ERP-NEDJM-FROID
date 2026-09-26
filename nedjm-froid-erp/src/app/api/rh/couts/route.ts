import { NextResponse, type NextRequest } from "next/server";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { workspaceHasRole } from "@/lib/auth/require-roles";
import { loadCostReport } from "@/lib/actions/hr-costs";
import { journalCsv } from "@/lib/hr/cost-allocation";
import { resolvePayrollPeriod } from "@/lib/hr/payroll-calc";

const COST_ROLES = ["SUPER_ADMIN", "ADMIN_RH", "GERANT", "ADMIN_FINANCE"];

function csv(rows: (string | number)[][]) {
  return (
    rows
      .map((r) => r.map((v) => (typeof v === "number" ? v.toFixed(2) : /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(";"))
      .join("\r\n") + "\r\n"
  );
}

export async function GET(request: NextRequest) {
  const ws = await getWorkspaceProfile();
  if (!ws) return NextResponse.json({ error: "Session expirée." }, { status: 401 });
  if (!workspaceHasRole(ws, COST_ROLES)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  const p = request.nextUrl.searchParams;
  const { year, month } = resolvePayrollPeriod(p.get("year") ?? undefined, p.get("month") ?? undefined);
  const report = await loadCostReport({ year, month });
  if (!report.ok) return NextResponse.json({ error: report.error }, { status: 500 });
  const r = report.data;
  if (!r.slips) return NextResponse.json({ error: "Aucun bulletin pour cette période." }, { status: 404 });
  const mm = String(month).padStart(2, "0");
  const prefix = r.provisional ? "PROVISOIRE_" : "";
  let body: string;
  let name: string;
  if (p.get("kind") === "journal") {
    if (!r.journal.balanced) return NextResponse.json({ error: "Écriture déséquilibrée : export bloqué." }, { status: 409 });
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    body = journalCsv({
      journalCode: r.journalCode,
      date: `${String(last).padStart(2, "0")}/${mm}/${year}`,
      piece: `PAIE-${year}${mm}`,
      label: `Paie ${mm}/${year}`,
      lines: r.journal.lines,
    });
    name = `${prefix}ECRITURES_PAIE_${year}_${mm}.csv`;
  } else {
    body = csv([
      ["Niveau", "Code", "Libelle", "Effectif / quote-part", "Brut", "Charges patronales", "Cout total"],
      ...r.sites.map((s) => ["Chantier", s.site_code, s.site_name, String(s.headcount), s.brut, s.charges, s.cost]),
      ...r.contracts.map((c) => ["Contrat", c.reference, `${c.client_name} (${c.site_name})`, `${Math.round(c.share * 100)} %`, "", "", c.cost]),
    ]);
    name = `${prefix}COUTS_PAIE_${year}_${mm}.csv`;
  }
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
