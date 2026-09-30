import { createHash } from "node:crypto";
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

type ExportPlan = {
  blocked?: boolean;
  message?: string | null;
  nature?: "OFFICIAL" | "CONTROL";
  months?: number[];
  excluded_months?: number[];
};

type BuiltFile = { body: string | ArrayBuffer; fileName: string; contentType: string; inline: boolean; missingNss?: number };

const CONTROL_NOTICE = "ÉTAT DE CONTRÔLE — reconstitution, non déclaratif (décision D10). NE PAS DÉPOSER.";

function sha256Hex(body: string | ArrayBuffer) {
  const hash = createHash("sha256");
  if (typeof body === "string") hash.update(body, "utf8");
  else hash.update(Buffer.from(body));
  return hash.digest("hex");
}

function byteSize(body: string | ArrayBuffer) {
  return typeof body === "string" ? Buffer.byteLength(body, "utf8") : body.byteLength;
}

/**
 * Every declaration file goes through the database plan (D10 guard) and is inscribed in the exports register
 * before it is returned: a period that needs a D10 gets no file without the matching decision, consumed once.
 */
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
  const decisionParam = params.get("decision");
  const decisionId = decisionParam && UUID_RE.test(decisionParam) ? decisionParam : null;

  const supabase = await createClient();
  try {
    const { data: planData, error: planErr } = await supabase.rpc("hr_declaration_export_plan", {
      p_kind: kind,
      p_year: year,
      p_month: annual ? null : month,
      p_site: siteId,
      p_decision: decisionId,
    });
    if (planErr) return NextResponse.json({ error: planErr.message }, { status: 403 });
    const plan = (planData ?? {}) as ExportPlan;
    if (plan.blocked) {
      return NextResponse.json({ error: plan.message ?? "Export bloqué : décision D10 requise.", blocked: true }, { status: 409 });
    }
    const control = plan.nature === "CONTROL";
    const months = plan.months?.length ? plan.months : annual ? Array.from({ length: 12 }, (_, i) => i + 1) : [month];
    const excluded = plan.excluded_months ?? [];

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
    const excludedNotice = excluded.length
      ? `Mois exclus par décision D10 (déclarés hors de l'application) : ${excluded.map((m) => String(m).padStart(2, "0")).join(", ")}/${year}.`
      : "";
    const notice = [control ? CONTROL_NOTICE : "", excludedNotice].filter(Boolean).join(" ") || undefined;
    const prefix = `${control ? "CONTROLE_" : ""}${status === "FINAL" ? "" : "PROVISOIRE_"}`;
    const scopeLabel = siteId ? (slips[0]?.site_name ?? "Chantier") : "Tous les chantiers";

    let built: BuiltFile;
    if (kind === "cnas_file" || kind === "das_file") {
      const file =
        kind === "cnas_file"
          ? buildCnasMonthlyFile({ employer, year, month, slips })
          : buildDasFile({ employer, year, slips });
      built = {
        body: notice ? `${notice}\r\n${file.content}` : file.content,
        fileName: `${prefix}${file.fileName}`,
        contentType: "text/csv; charset=utf-8",
        inline: false,
        missingNss: file.missing_nss.length,
      };
    } else if (kind === "g50") {
      built = {
        body: buildG50Html({ employer, year, month, status, scopeLabel, slips, notice }),
        fileName: `${prefix}G50_IRG_${year}_${String(month).padStart(2, "0")}.html`,
        contentType: "text/html; charset=utf-8",
        inline: true,
      };
    } else if (kind === "das") {
      built = {
        body: await buildAnnualDasWorkbook({ year, status, employer, slips, notice }),
        fileName: `${control ? "CONTROLE_" : ""}${annualDasFilename(year)}`,
        contentType: XLSX,
        inline: false,
      };
    } else {
      built = {
        body: await buildMonthlyDeclarationsWorkbook({ year, month, status, employer, scopeLabel, slips, notice }),
        fileName: `${control ? "CONTROLE_" : ""}${monthlyDeclarationsFilename(year, month)}`,
        contentType: XLSX,
        inline: false,
      };
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const { data: rec, error: recErr } = await supabase.rpc("hr_declaration_export_record", {
      p: {
        kind,
        year,
        month: annual ? null : month,
        site_id: siteId,
        nature: plan.nature ?? "OFFICIAL",
        months,
        file_name: built.fileName,
        sha256: sha256Hex(built.body),
        byte_size: byteSize(built.body),
        slip_count: slips.length,
        totals: {
          gross: round2(slips.reduce((s, x) => s + Number(x.gross_amount ?? 0), 0)),
          irg: round2(slips.reduce((s, x) => s + Number(x.irg_amount ?? 0), 0)),
          net: round2(slips.reduce((s, x) => s + Number(x.net_payable ?? 0), 0)),
        },
        payroll_status: status,
      },
      p_decision: decisionId,
    });
    if (recErr) return NextResponse.json({ error: recErr.message }, { status: 409 });
    const recorded = (rec ?? {}) as { ok?: boolean; reason?: string };
    if (recorded.ok !== true) {
      return NextResponse.json(
        {
          error:
            recorded.reason === "INVALIDATED"
              ? "Les données ont changé depuis la décision D10 : elle est invalidée, aucun fichier n'a été produit. Une nouvelle demande est nécessaire."
              : "Export refusé par le registre des déclarations.",
        },
        { status: 409 },
      );
    }

    const headers: Record<string, string> = { "Content-Type": built.contentType, "Cache-Control": "no-store" };
    if (!built.inline) headers["Content-Disposition"] = `attachment; filename="${built.fileName}"`;
    if (built.missingNss !== undefined) headers["X-Missing-NSS"] = String(built.missingNss);
    return new NextResponse(built.body, { status: 200, headers });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Export impossible." }, { status: 500 });
  }
}
