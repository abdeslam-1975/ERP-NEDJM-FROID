import { NextResponse, type NextRequest } from "next/server";
import { requireHrSalaryValues } from "@/lib/auth/require-roles";
import { createClient } from "@/lib/supabase/server";
import { listPayrollSlips, type PayrollSlipRow } from "@/lib/actions/hr-ops";
import { getHrBulletinSettings } from "@/lib/actions/hr-bulletin";
import { resolvePayrollPeriod } from "@/lib/hr/payroll-calc";
import { declarationStatus } from "@/lib/hr/payroll-declarations";
import {
  annualDasFilename,
  buildAnnualDasWorkbook,
  buildMonthlyDeclarationsWorkbook,
  monthlyDeclarationsFilename,
  type EmployerIdentity,
} from "@/lib/hr/payroll-declarations-excel";
import { buildCnasMonthlyFile, buildDasFile, buildG50Html } from "@/lib/hr/declaration-files";

type Kind = "monthly" | "das" | "cnas_file" | "das_file" | "g50";
const KINDS: readonly Kind[] = ["monthly", "das", "cnas_file", "das_file", "g50"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadEmployer(supabase: Supabase): Promise<EmployerIdentity> {
  const settings = await getHrBulletinSettings();
  const s = settings.ok ? settings.data : null;
  const employer: EmployerIdentity = {
    name: s?.employer_name ?? "",
    address: s?.employer_address ?? "",
    nif: s?.employer_nif ?? "",
    nis: s?.employer_nis ?? "",
    cnas_no: s?.employer_cnas_no ?? "",
    cacobatph_no: s?.employer_cacobatph_no ?? "",
  };
  if (employer.name && employer.nif && employer.nis) return employer;
  // Fallback to the default purchases document profile; RLS may hide it from RH users.
  const { data: profile } = await supabase
    .from("pur_document_profiles")
    .select("legal_name, address, city, nif, nis")
    .eq("is_default", true)
    .eq("active", true)
    .maybeSingle();
  if (!profile) return employer;
  return {
    ...employer,
    name: employer.name || profile.legal_name || "",
    address: employer.address || [profile.address, profile.city].filter(Boolean).join(", "),
    nif: employer.nif || profile.nif || "",
    nis: employer.nis || profile.nis || "",
  };
}

async function runStatuses(supabase: Supabase, year: number, month: number | null, siteId: string | null) {
  let query = supabase.from("hr_payroll_runs").select("status_code, site_id").eq("period_year", year);
  if (month != null) query = query.eq("period_month", month);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((r) => !siteId || r.site_id === siteId || r.site_id == null)
    .map((r) => String(r.status_code));
}

function fileResponse(buffer: ArrayBuffer, filename: string) {
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: NextRequest) {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.error.startsWith("Session") ? 401 : 403 });
  }

  const params = request.nextUrl.searchParams;
  const kind: Kind = KINDS.find((k) => k === params.get("kind")) ?? "monthly";
  const annual = kind === "das" || kind === "das_file";
  const { year, month } = resolvePayrollPeriod(params.get("year") ?? undefined, params.get("month") ?? undefined);
  const siteParam = params.get("site");
  const siteId = siteParam && UUID_RE.test(siteParam) ? siteParam : null;

  const supabase = await createClient();
  try {
    const months = annual ? Array.from({ length: 12 }, (_, i) => i + 1) : [month];
    const results = await Promise.all(months.map((m) => listPayrollSlips({ year, month: m })));
    const failed = results.find((r) => !r.ok);
    if (failed && !failed.ok) return NextResponse.json({ error: failed.error }, { status: 500 });
    const slips = results
      .flatMap((r) => (r.ok ? r.data : []))
      .filter((s: PayrollSlipRow) => !siteId || s.site_id === siteId);
    if (!slips.length) {
      return NextResponse.json(
        { error: "Aucun bulletin pour cette période. · لا توجد كشوف لهذه الفترة." },
        { status: 404 },
      );
    }

    const [employer, statuses] = await Promise.all([
      loadEmployer(supabase),
      runStatuses(supabase, year, annual ? null : month, siteId),
    ]);
    const status = declarationStatus(statuses);

    if (kind === "cnas_file" || kind === "das_file") {
      const file =
        kind === "cnas_file"
          ? buildCnasMonthlyFile({ employer, year, month, slips })
          : buildDasFile({ employer, year, slips });
      return new NextResponse(file.content, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${status === "FINAL" ? "" : "PROVISOIRE_"}${file.fileName}"`,
          "X-Missing-NSS": String(file.missing_nss.length),
          "Cache-Control": "no-store",
        },
      });
    }
    if (kind === "g50") {
      const scopeLabel = siteId ? (slips[0]?.site_name ?? "Chantier") : "Tous les chantiers";
      return new NextResponse(buildG50Html({ employer, year, month, status, scopeLabel, slips }), {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    if (kind === "das") {
      const buffer = await buildAnnualDasWorkbook({ year, status, employer, slips });
      return fileResponse(buffer, annualDasFilename(year));
    }
    const scopeLabel = siteId ? (slips[0]?.site_name ?? "Chantier") : "Tous les chantiers";
    const buffer = await buildMonthlyDeclarationsWorkbook({ year, month, status, employer, scopeLabel, slips });
    return fileResponse(buffer, monthlyDeclarationsFilename(year, month));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Export impossible." }, { status: 500 });
  }
}
