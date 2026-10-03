"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { createClient } from "@/lib/supabase/server";
import { decideDecision } from "@/lib/actions/decisions";
import { listPayrollSlips, loadPayrollIrgScales, requestPayrollCalculation } from "@/lib/actions/hr-ops";
import { PAYROLL_CONTRACT_STATUSES, contractPayableInPeriod } from "@/lib/hr/payroll-calc";
import { normalizeRunStatus } from "@/lib/hr/payroll-run-status";
import { loadPayrollBulletinContext } from "@/lib/actions/hr-bulletin";
import { renderBulletinHtml, slipToBulletin } from "@/components/rh/bulletin-print";
import { bulletinRatesFromVars } from "@/lib/hr/bulletin-settings";
import { requestOrigin } from "@/lib/pdf/print-archive";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type PayslipRegisterRow = {
  id: string;
  employee_id: string;
  period_year: number;
  period_month: number;
  site_name: string;
  matricule: string;
  employee_name: string;
  days_paid: number;
  net_payable: number;
  status_code: string;
};

type One<T> = T | T[] | null;
const one = <T,>(value: One<T>) => (Array.isArray(value) ? value[0] ?? null : value);

/** Every payslip already produced, newest period first. */
export async function listPayslipRegister(): Promise<ActionResult<PayslipRegisterRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_payroll_slips")
    .select(
      "id, employee_id, days_paid, net_payable, status_code, run:hr_payroll_runs ( period_year, period_month, site:ref_sites ( name_fr ) ), employee:hr_employees ( matricule, last_name, first_name )",
    )
    .limit(5000);
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []).map((row) => {
    const run = one(row.run as One<{ period_year: number; period_month: number; site: One<{ name_fr: string }> }>);
    const emp = one(row.employee as One<{ matricule: string; last_name: string; first_name: string }>);
    return {
      id: row.id,
      employee_id: row.employee_id,
      period_year: run?.period_year ?? 0,
      period_month: run?.period_month ?? 0,
      site_name: one(run?.site ?? null)?.name_fr ?? "",
      matricule: emp?.matricule ?? "",
      employee_name: `${emp?.last_name ?? ""} ${emp?.first_name ?? ""}`.trim(),
      days_paid: Number(row.days_paid ?? 0),
      net_payable: Number(row.net_payable ?? 0),
      status_code: row.status_code,
    };
  });
  rows.sort(
    (a, b) =>
      b.period_year - a.period_year ||
      b.period_month - a.period_month ||
      a.site_name.localeCompare(b.site_name) ||
      a.matricule.localeCompare(b.matricule, undefined, { numeric: true }),
  );
  return { ok: true, data: rows };
}

/** The payslip exactly as « Imprimer » prints it on the payroll screen. */
export async function getPayslipBulletinHtml(input: {
  slip_id: string;
  year: number;
  month: number;
}): Promise<ActionResult<{ html: string }>> {
  if (!z.string().uuid().safeParse(input.slip_id).success) return { ok: false, error: "Bulletin invalide." };
  const [slips, irg, context, origin] = await Promise.all([
    listPayrollSlips({ year: input.year, month: input.month }),
    loadPayrollIrgScales({ year: input.year, month: input.month }),
    loadPayrollBulletinContext(),
    requestOrigin(),
  ]);
  if (!slips.ok) return slips;
  const slip = slips.data.find((s) => s.id === input.slip_id);
  if (!slip) return { ok: false, error: "Bulletin introuvable." };
  const settings = context.bulletin;
  const model = slipToBulletin(slip, settings, bulletinRatesFromVars(slip.legal_vars, settings), irg.ok ? irg.data : null);
  return { ok: true, data: { html: renderBulletinHtml(context.template, [model], origin) } };
}

export type BulletinEmployee = { id: string; matricule: string; name: string };

export async function listBulletinEmployees(): Promise<ActionResult<BulletinEmployee[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_employees")
    .select("id, matricule, last_name, first_name")
    .order("matricule")
    .limit(5000);
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((e) => ({ id: e.id, matricule: e.matricule, name: `${e.last_name} ${e.first_name}`.trim() })),
  };
}

const employeePeriodSchema = z.object({
  employee_id: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  /** Recalculate a draft payslip even when no input change was recorded (calculation rules changed). */
  force: z.boolean().optional(),
});

export type EmployeeBulletinStep =
  | { kind: "slip"; slip_id: string; status_code: string }
  | {
      kind: "decision";
      decision_id: string;
      type_code: "D1" | "D3" | "D4";
      /** The requester may settle it here only as super admin (separation of duties). */
      can_decide: boolean;
      /** Draft payslip computed before the latest changes; still viewable as is. */
      stale_slip_id?: string;
    };

const label = (year: number, month: number) => `${String(month).padStart(2, "0")}/${year}`;

async function employeeSlip(supabase: Awaited<ReturnType<typeof createClient>>, employeeId: string, year: number, month: number) {
  const { data, error } = await supabase
    .from("hr_payroll_slips")
    .select("id, status_code, run_id, run:hr_payroll_runs!inner ( status_code, site_id, period_year, period_month )")
    .eq("employee_id", employeeId)
    .eq("run.period_year", year)
    .eq("run.period_month", month)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const run = (Array.isArray(data.run) ? data.run[0] : data.run) as { status_code: string; site_id: string | null } | null;
  return {
    id: data.id,
    status_code: String(data.status_code),
    run_id: String(data.run_id),
    run_status: run?.status_code,
    run_site: run?.site_id ?? null,
  };
}

/** Contract, attendance… of the employee (or of the whole run) changed after the draft was computed. */
async function draftIsStale(supabase: Awaited<ReturnType<typeof createClient>>, runId: string, employeeId: string) {
  const { data, error } = await supabase
    .from("hr_payroll_input_changes")
    .select("id")
    .eq("run_id", runId)
    .is("resolved_at", null)
    .or(`employee_id.eq.${employeeId},employee_id.is.null`)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/**
 * Payslip of one employee for one month. The month's payroll covers every site (the employee may
 * have worked away from his usual site), so a missing payslip means generating or recalculating
 * the company-wide payroll of the month — still through a decision (D4, D3, or D1 if rules are pending).
 */
export async function requestEmployeeBulletin(input: unknown): Promise<ActionResult<EmployeeBulletinStep>> {
  const parsed = employeePeriodSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choisissez l'employé, le mois et l'année." };
  const { employee_id, year, month, force } = parsed.data;
  const ws = await getWorkspaceProfile();
  if (!ws) return { ok: false, error: "Session requise." };
  const supabase = await createClient();
  let existing: Awaited<ReturnType<typeof employeeSlip>>;
  let stale = false;
  try {
    existing = await employeeSlip(supabase, employee_id, year, month);
    if (existing && normalizeRunStatus(existing.run_status) === "DRAFT") {
      stale = force === true || (await draftIsStale(supabase, existing.run_id, employee_id));
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lecture des bulletins impossible." };
  }
  if (existing && !stale) {
    return { ok: true, data: { kind: "slip", slip_id: existing.id, status_code: existing.status_code } };
  }
  if (existing) {
    const requested = await requestPayrollCalculation({ period_year: year, period_month: month, site_id: existing.run_site });
    if (!requested.ok) return requested;
    return {
      ok: true,
      data: {
        kind: "decision",
        decision_id: requested.data.decision_id,
        type_code: requested.data.type_code,
        can_decide: ws.isSuperAdmin && requested.data.type_code !== "D1",
        stale_slip_id: existing.id,
      },
    };
  }

  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
  const { data: contracts, error: cErr } = await supabase
    .from("hr_contracts")
    .select("status, start_date, end_date, contract_type_code")
    .eq("employee_id", employee_id)
    .eq("affectation_principale", true)
    .in("status", [...PAYROLL_CONTRACT_STATUSES, "ENDED"]);
  if (cErr) return { ok: false, error: cErr.message };
  const payable = (contracts ?? []).some(
    (c) =>
      c.contract_type_code !== "INTERIM" &&
      contractPayableInPeriod({ status: c.status, start_date: c.start_date, end_date: c.end_date }, start, end),
  );
  if (!payable) {
    return {
      ok: false,
      error: `Aucun contrat de travail payable en ${label(year, month)} pour cet employé : enregistrez d'abord son contrat.`,
    };
  }

  const { data: runs, error: rErr } = await supabase
    .from("hr_payroll_runs")
    .select("site_id, status_code, site:ref_sites ( name_fr )")
    .eq("period_year", year)
    .eq("period_month", month);
  if (rErr) return { ok: false, error: rErr.message };
  const bySite = (runs ?? []).filter((r) => r.site_id);
  if (bySite.length) {
    const names = bySite
      .map((r) => (Array.isArray(r.site) ? r.site[0] : r.site) as { name_fr: string } | null)
      .map((s) => s?.name_fr ?? "?")
      .join(", ");
    return {
      ok: false,
      error: `La paie de ${label(year, month)} est établie par chantier (${names}) et ce salarié n'y figure pas : ajoutez son pointage validé sur ce chantier puis recalculez depuis l'écran Paie.`,
    };
  }
  const global = (runs ?? []).find((r) => !r.site_id);
  if (global && normalizeRunStatus(global.status_code) !== "DRAFT") {
    return {
      ok: false,
      error: `La paie de ${label(year, month)} est déjà validée ou clôturée sans ce salarié : réouvrez-la depuis l'écran Paie.`,
    };
  }

  const requested = await requestPayrollCalculation({ period_year: year, period_month: month, site_id: null });
  if (!requested.ok) return requested;
  return {
    ok: true,
    data: {
      kind: "decision",
      decision_id: requested.data.decision_id,
      type_code: requested.data.type_code,
      can_decide: ws.isSuperAdmin && requested.data.type_code !== "D1",
    },
  };
}

/** Settles the D4 / D3 opened above and returns the employee's payslip once the payroll is computed. */
export async function decideEmployeeBulletin(input: unknown): Promise<ActionResult<{ slip_id: string }>> {
  const parsed = employeePeriodSchema
    .extend({ decision_id: z.string().uuid(), justification: z.string().trim().min(10).max(2000) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Justification obligatoire (10 caractères minimum)." };
  const p = parsed.data;
  const supabase = await createClient();
  const { data: d, error } = await supabase
    .from("sys_decisions")
    .select("type_code, fingerprint, status")
    .eq("id", p.decision_id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!d || (d.type_code !== "D4" && d.type_code !== "D3")) return { ok: false, error: "Décision introuvable." };
  if (d.status === "PENDING") {
    const decided = await decideDecision({
      id: p.decision_id,
      option: d.type_code === "D4" ? "GENERATE" : "RECALCULATE",
      justification: p.justification,
      fingerprint: d.fingerprint ?? "",
      risk_ack: false,
    });
    if (!decided.ok) return decided;
    if (decided.data.execute_error) return { ok: false, error: `Décision prise, calcul échoué : ${decided.data.execute_error}` };
  }
  revalidatePath("/rh/documents");
  try {
    const slip = await employeeSlip(supabase, p.employee_id, p.year, p.month);
    if (!slip) {
      return {
        ok: false,
        error: `Paie de ${label(p.year, p.month)} calculée, mais sans bulletin pour cet employé (contrat ou pointage du mois à vérifier).`,
      };
    }
    return { ok: true, data: { slip_id: slip.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lecture du bulletin impossible." };
  }
}
