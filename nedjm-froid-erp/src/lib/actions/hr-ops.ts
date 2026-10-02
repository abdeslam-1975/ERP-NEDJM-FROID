"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { chainDecisionRequired, parseChainState } from "@/lib/hr/payroll-chains";
import {
  attendanceSaveSchema,
  payrollGenerateSchema,
  payrollRunActionSchema,
} from "@/lib/validations/hr";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import {
  HR_PAYROLL_CLOSE_ROLES,
  HR_SALARY_VALUE_ROLES,
  workspaceHasRole,
} from "@/lib/auth/require-roles";
import {
  attendanceFrozenMessage,
  normalizeRunStatus,
  periodStatus,
  planRunTransition,
  type PayrollRunAction,
  type PayrollRunStatus,
} from "@/lib/hr/payroll-run-status";
import { computeSlip, slipEngineRates, type SlipEngine } from "@/lib/hr/payroll-slip";
import {
  contractPayableInPeriod,
  groupContractsByEmployee,
  PAYROLL_CONTRACT_STATUSES,
  salaryAsOf,
  salaryVersionAt,
  type SalaryGridRow,
  type PayrollAdvance,
  type PayrollAssignment,
  type PayrollException,
  type PayrollLine,
  type PayrollRubrique,
  type SalaryVersion,
} from "@/lib/hr/payroll-calc";
import { OVERTIME_COLUMNS } from "@/lib/hr/attendance-columns";
import { normalizeSettlementLines, type SettlementLine } from "@/lib/hr/leave";

const ANNUAL_LEAVE_LEGEND = "CA";
import { loadIrgEngine, type IrgEngine } from "@/lib/hr/irg-engine-load";
import {
  complianceLabels,
  DEFAULT_IRG_ZONE,
  resolveCompliance,
  type SnapshotCompliance,
} from "@/lib/hr/compliance";
import { loadComplianceContext } from "@/lib/hr/compliance-load";
import { buildSlipTrace } from "@/lib/hr/slip-trace";
import {
  legalVarsAsOf,
  legalVarVersionsAsOf,
  loadContributionDefs,
  parseLegalSnapshot,
  type PayrollLegalSnapshot,
  type PayrollSlipTrace,
} from "@/lib/hr/legal-vars-as-of";
import {
  parseAppliedContributions,
  type AppliedContribution,
} from "@/lib/hr/contributions";
import {
  accumulateAttendanceMovements,
  emptyMovements,
  type AttendanceLegend,
} from "@/lib/hr/attendance-movements";
import { signalPayrollInputChange } from "@/lib/hr/payroll-input-signal";
import type { PayrollSignal } from "@/lib/decisions/catalog";
import { monthAssignmentsByEmployee } from "@/lib/hr/assignments";
import { loadContractAssignments } from "@/lib/hr/assignments-load";
import { loadLegendsAt } from "@/lib/hr/legends-at";
import { simulationWarnings, toSimulationSlip } from "@/lib/hr/payroll-simulation";
import { archivePayrollBulletins } from "@/lib/hr/bulletin-archive";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type AttendanceStatus = "PROPOSED" | "VALIDATED";

export type AttendanceCell = {
  employee_id: string;
  site_id: string;
  work_date: string;
  legend_code: string;
  /** MANUAL (user), OM (ordre de mission), AUTO (other correspondence). */
  source_code: string;
  status_code: AttendanceStatus;
  correspondence_id: string | null;
  correspondence_number: string | null;
};

/** Salary-free roster for the attendance sheet (readable by site chiefs). */
export type AttendanceRosterRow = {
  employee_id: string;
  matricule: string;
  last_name: string;
  first_name: string;
  poste: string;
  site_id: string;
  site_name: string;
  start_date: string;
  end_date: string | null;
  status: string;
};

export async function listAttendanceRoster(): Promise<ActionResult<AttendanceRosterRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_attendance_roster");
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: ((data ?? []) as AttendanceRosterRow[]).map((r) => ({
      employee_id: r.employee_id,
      matricule: r.matricule ?? "",
      last_name: r.last_name ?? "",
      first_name: r.first_name ?? "",
      poste: r.poste ?? "",
      site_id: r.site_id,
      site_name: r.site_name ?? "",
      start_date: String(r.start_date ?? "").slice(0, 10),
      end_date: r.end_date ? String(r.end_date).slice(0, 10) : null,
      status: r.status,
    })),
  };
}

export type PayrollSlipLineRow = {
  id: string;
  slip_id: string;
  source_code: string;
  code: string;
  label_ar: string;
  label_fr: string;
  category: string;
  nature: string;
  unit: string;
  cotisable: boolean;
  taxable: boolean;
  quantity: number;
  unit_amount: number;
  amount: number;
};

export type PayrollSlipRow = {
  id: string;
  run_id: string;
  employee_id: string;
  period_year: number;
  period_month: number;
  site_id: string | null;
  hr_contract_id: string | null;
  days_worked: number;
  days_paid: number;
  days_leave: number;
  days_absence: number;
  days_weekend: number;
  days_abandon: number;
  days_rappel: number;
  days_by_code: Record<string, number>;
  net_target: number;
  gross_amount: number;
  employee_ss: number;
  employer_ss: number;
  cacobatph: number;
  intemperies_employee: number;
  intemperies_employer: number;
  extra_employee: number;
  extra_employer: number;
  extra_contributions: AppliedContribution[];
  irg_base: number;
  irg_amount: number;
  net_payable: number;
  status_code: string;
  matricule: string;
  employee_name: string;
  last_name: string;
  first_name: string;
  nss: string | null;
  birth_date: string | null;
  hired_at: string | null;
  marital_code: string | null;
  address_fr: string | null;
  commune: string | null;
  poste_fr: string | null;
  site_name: string | null;
  qualification_code: string | null;
  payment_mode_code: string | null;
  account_no: string | null;
  account_key: string | null;
  /** Legal rates of the slip period (frozen snapshot, or versions in force on the 1st of the month). */
  legal_vars: Record<string, number>;
  /** IRG / CNAS / CACOBATPH regime applied (null on slips generated before Module 05). */
  compliance: SnapshotCompliance | null;
  /** Rule versions and decisions behind the slip (null before lot 2). */
  trace: PayrollSlipTrace | null;
  lines: PayrollSlipLineRow[];
  /** False when the list skipped lines and print identity. Undefined means they are present. */
  detail_loaded?: boolean;
  /** Draft slip whose inputs changed after calculation, pending a D3 decision. */
  inputs_changed?: boolean;
};

export type PayrollSlipDetail = {
  id: string;
  lines: PayrollSlipLineRow[];
  marital_code: string | null;
  address_fr: string | null;
  commune: string | null;
  poste_fr: string | null;
  qualification_code: string | null;
  payment_mode_code: string | null;
  account_no: string | null;
  account_key: string | null;
  detail_loaded: true;
};

export type PayrollRunRow = {
  id: string;
  period_year: number;
  period_month: number;
  site_id: string | null;
  status_code: PayrollRunStatus;
  validated_at: string | null;
  locked_at: string | null;
  slip_count: number;
  /** Changes since calculation not yet decided (recalculate or keep): validation is refused meanwhile. */
  pending_changes: number;
  /** Open D3 decision of this run, when visible to the user. */
  open_decision_id: string | null;
  /** Open D7 (reopening) request of this run, when visible to the user. */
  reopen_decision_id: string | null;
  /** Validation blocked until the SUPER_ADMIN decides the closing policy of the reprise months (D6). */
  chain_required: boolean;
  /** Frozen copies kept by earlier reopenings (D7). */
  version_count: number;
};

/** Open D4 request (payroll not generated yet) visible to the user. */
export type PayrollGenerationRequest = { site_id: string | null; decision_id: string };

function num(v: unknown) {
  return Number(v ?? 0);
}

function dayCounts(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, number> = {};
  for (const [code, n] of Object.entries(v as Record<string, unknown>)) {
    const days = Number(n);
    if (Number.isFinite(days)) out[code.toUpperCase()] = days;
  }
  return out;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Most restrictive run status for a site/month (site run + company-wide run). */
async function loadPeriodStatus(
  supabase: Supabase,
  siteId: string,
  year: number,
  month: number,
): Promise<{ ok: true; status: PayrollRunStatus | null } | { ok: false; error: string }> {
  if (!UUID_RE.test(siteId)) return { ok: false, error: "Chantier invalide." };
  // RPC (security definer): attendance writers may lack read access to hr_payroll_runs.
  const { data, error } = await supabase.rpc("hr_payroll_period_status", {
    p_site: siteId,
    p_date: `${year}-${String(month).padStart(2, "0")}-01`,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, status: periodStatus([typeof data === "string" ? data : null]) };
}

export async function getAttendancePeriodStatus(input: {
  site_id: string;
  year: number;
  month: number;
}): Promise<ActionResult<PayrollRunStatus | null>> {
  const supabase = await createClient();
  const period = await loadPeriodStatus(supabase, input.site_id, input.year, input.month);
  if (!period.ok) return period;
  return { ok: true, data: period.status };
}

export async function listAttendanceMonth(input: {
  site_id: string;
  year: number;
  month: number;
}): Promise<
  ActionResult<{ cells: AttendanceCell[]; loaded_at: string; period_status: PayrollRunStatus | null }>
> {
  const supabase = await createClient();
  const loadedAt = new Date().toISOString();
  const start = `${input.year}-${String(input.month).padStart(2, "0")}-01`;
  const endDate = new Date(input.year, input.month, 0).getDate();
  const end = `${input.year}-${String(input.month).padStart(2, "0")}-${String(endDate).padStart(2, "0")}`;
  const { data, error } = await supabase
    .from("hr_attendance")
    .select(
      "employee_id, site_id, work_date, legend_code, source_code, status_code, correspondence_id, correspondence:hr_correspondences ( number )",
    )
    .eq("site_id", input.site_id)
    .gte("work_date", start)
    .lte("work_date", end);
  if (error) return { ok: false, error: error.message };
  const cells: AttendanceCell[] = (data ?? []).map((row) => {
    const corr = Array.isArray(row.correspondence) ? row.correspondence[0] : row.correspondence;
    return {
      employee_id: row.employee_id,
      site_id: row.site_id,
      work_date: row.work_date,
      legend_code: row.legend_code,
      source_code: row.source_code,
      status_code: row.status_code === "PROPOSED" ? "PROPOSED" : "VALIDATED",
      correspondence_id: row.correspondence_id ?? null,
      correspondence_number: corr?.number ?? null,
    };
  });
  const period = await loadPeriodStatus(supabase, input.site_id, input.year, input.month);
  if (!period.ok) return period;
  return { ok: true, data: { cells, loaded_at: loadedAt, period_status: period.status } };
}

/**
 * "Valider les valeurs renseignées": replaces the month with the grid's final values,
 * all VALIDATED, each keeping its origin (MANUAL / OM / AUTO).
 * Proposals written after the grid was loaded (new ordre de mission) are left untouched.
 * No payroll is created or recalculated: drafts are flagged and a D3 / D4 decision is requested.
 */
export async function saveAttendanceMonth(
  input: unknown,
): Promise<ActionResult<{ count: number; payroll: PayrollSignal }>> {
  const parsed = attendanceSaveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const p = parsed.data;
  const supabase = await createClient();
  const period = await loadPeriodStatus(supabase, p.site_id, p.year, p.month);
  if (!period.ok) return period;
  const frozen = attendanceFrozenMessage(period.status);
  if (frozen) return { ok: false, error: frozen };
  const { data: canEditDays, error: accessErr } = await supabase.rpc("hr_att_col_allowed", {
    p_code: "DAYS",
    p_edit: true,
    p_site: p.site_id,
  });
  if (accessErr) return { ok: false, error: accessErr.message };
  if (!canEditDays) {
    return {
      ok: false,
      error: "Saisie des jours non autorisée pour votre rôle. · تعبئة الأيام غير مسموحة لدورك.",
    };
  }
  const start = `${p.year}-${String(p.month).padStart(2, "0")}-01`;
  const endDate = new Date(p.year, p.month, 0).getDate();
  const end = `${p.year}-${String(p.month).padStart(2, "0")}-${String(endDate).padStart(2, "0")}`;
  const rows = p.cells.map((cell) => ({
    employee_id: cell.employee_id,
    site_id: cell.site_id,
    work_date: cell.work_date,
    legend_code: cell.legend_code,
    source_code: cell.source_code,
    correspondence_id: cell.source_code === "MANUAL" ? null : (cell.correspondence_id ?? null),
  }));
  const { error: saveErr } = await supabase.rpc("hr_attendance_replace_month", {
    p_site: p.site_id,
    p_start: start,
    p_end: end,
    p_employee: p.employee_id ?? null,
    p_loaded_at: p.loaded_at ?? null,
    p_rows: rows,
  });
  if (saveErr) return { ok: false, error: saveErr.message };
  const signal = await signalPayrollInputChange(supabase, {
    source: "ATTENDANCE",
    siteId: p.site_id,
    employeeId: p.employee_id ?? null,
    year: p.year,
    month: p.month,
  });
  if (!signal.ok) {
    return {
      ok: false,
      error: `Présences enregistrées, mais la paie n'a pas pu être signalée : ${signal.error}`,
    };
  }
  revalidatePath("/rh/presence");
  revalidatePath("/rh/paie");
  revalidatePath("/decisions");
  return {
    ok: true,
    data: { count: p.cells.length, payroll: signal.data },
  };
}

export type PayrollIrgScales = IrgEngine;

export async function loadPayrollIrgScales(input: {
  year: number;
  month: number;
}): Promise<ActionResult<PayrollIrgScales>> {
  const year = Number(input.year);
  const month = Number(input.month);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return { ok: false, error: "Période invalide." };
  }
  const supabase = await createClient();
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  return loadIrgEngine(supabase, start);
}

/**
 * "Générer" on the payroll screen: opens (or refreshes) the decision that governs the month —
 * D4 when the payroll does not exist yet, D3 (whole run) for a draft. Nothing is calculated here.
 */
export async function requestPayrollCalculation(
  input: unknown,
): Promise<ActionResult<{ decision_id: string; type_code: "D1" | "D3" | "D4" }>> {
  const parsed = payrollGenerateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const p = parsed.data;
  const supabase = await createClient();
  let runQuery = supabase
    .from("hr_payroll_runs")
    .select("id, status_code")
    .eq("period_year", p.period_year)
    .eq("period_month", p.period_month);
  runQuery = p.site_id ? runQuery.eq("site_id", p.site_id) : runQuery.is("site_id", null);
  const { data: run, error: runErr } = await runQuery.maybeSingle();
  if (runErr) return { ok: false, error: runErr.message };
  if (run) {
    const status = normalizeRunStatus(run.status_code);
    if (status !== "DRAFT") {
      return {
        ok: false,
        error:
          status === "LOCKED"
            ? "Paie clôturée : aucun recalcul possible. · الأجور مقفلة."
            : "Paie validée : aucun recalcul possible sans réouverture. · الأجور معتمدة.",
      };
    }
    const { data, error } = await supabase.rpc("hr_payroll_request_recalc", { p_run: run.id });
    if (error) return { ok: false, error: error.message };
    if (typeof data !== "string") return { ok: false, error: "Demande de recalcul non enregistrée." };
    revalidatePath("/decisions");
    return { ok: true, data: { decision_id: data, type_code: "D3" } };
  }
  const { data, error } = await supabase.rpc("hr_payroll_request_generation", {
    p_site: p.site_id ?? null,
    p_year: p.period_year,
    p_month: p.period_month,
    p_source: "MANUAL",
  });
  if (error) return { ok: false, error: error.message };
  if (typeof data !== "string") {
    return { ok: false, error: "Mois déjà validé ou clôturé : aucune paie à générer." };
  }
  // Rules of the month still awaiting approval: the database opens D1 instead of D4.
  const { data: opened } = await supabase.from("sys_decisions").select("type_code").eq("id", data).maybeSingle();
  revalidatePath("/decisions");
  revalidatePath("/rh/paie/preparation");
  return { ok: true, data: { decision_id: data, type_code: opened?.type_code === "D1" ? "D1" : "D4" } };
}

/**
 * Runs the operation of a decided D4 (generate) or D3 (recalculate). The database refuses the
 * writes unless the decision is decided, matches the payroll and its data fingerprint, and it is
 * consumed once.
 */
export async function executePayrollDecision(
  decisionId: string,
): Promise<
  ActionResult<{ run_id: string; count: number; warnings: string[] }> & { invalidated?: string | null }
> {
  if (!UUID_RE.test(decisionId)) return { ok: false, error: "Décision invalide." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session requise. · يلزم تسجيل الدخول." };
  const { data: checked, error: checkErr } = await supabase.rpc("sys_decision_check", { p_id: decisionId });
  if (checkErr) return { ok: false, error: checkErr.message };
  const c = (checked ?? {}) as {
    ok?: boolean;
    reason?: string;
    new_decision_id?: string | null;
    type_code?: string;
    period_year?: number;
    period_month?: number;
    site_id?: string | null;
    run_id?: string | null;
    employee_ids?: unknown;
  };
  if (!c.ok) {
    if (c.reason === "INVALIDATED") {
      return {
        ok: false,
        error:
          "Les données ont changé depuis la décision : elle est invalidée et une nouvelle demande est ouverte.",
        invalidated: c.new_decision_id ?? null,
      };
    }
    return { ok: false, error: "Cette décision n'a pas d'opération à exécuter." };
  }
  if ((c.type_code !== "D3" && c.type_code !== "D4") || !c.period_year || !c.period_month) {
    return { ok: false, error: "Type de décision non exécutable ici." };
  }
  const { data: canPayroll, error: permErr } = await supabase.rpc("erp_has_perm", {
    p_screen: "hr_payroll",
    p_action: "update",
  });
  if (permErr) return { ok: false, error: permErr.message };
  if (canPayroll !== true) {
    return { ok: false, error: "Calcul de la paie non autorisé pour votre rôle. · حساب الأجور غير مسموح لدورك." };
  }
  const scope =
    c.type_code === "D3" && Array.isArray(c.employee_ids)
      ? c.employee_ids.filter((id): id is string => typeof id === "string" && UUID_RE.test(id))
      : undefined;
  try {
    const result = await buildAndSavePayrollRun(
      supabase,
      { period_year: c.period_year, period_month: c.period_month, site_id: c.site_id ?? null },
      decisionId,
      scope,
    );
    if (result.ok) revalidatePath("/decisions");
    return result;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Calcul de la paie impossible." };
  }
}

/**
 * Runs a D1 decided « simulation »: the slips are computed with the rules in force (pending proposals are
 * not applied) and stored apart, status « règles non approuvées ». No payroll, slip, transfer or
 * declaration is created; the database refuses the save unless the decision is still current.
 */
export async function executePayrollSimulation(
  decisionId: string,
): Promise<
  ActionResult<{ simulation_id: string; count: number; warnings: string[] }> & { invalidated?: string | null }
> {
  if (!UUID_RE.test(decisionId)) return { ok: false, error: "Décision invalide." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session requise. · يلزم تسجيل الدخول." };
  const { data: d, error: dErr } = await supabase
    .from("sys_decisions")
    .select("id, type_code, status, chosen_option, period_year, period_month, site_id")
    .eq("id", decisionId)
    .maybeSingle();
  if (dErr) return { ok: false, error: dErr.message };
  if (!d || d.type_code !== "D1" || d.status !== "DECIDED" || d.chosen_option !== "SIMULATE") {
    return { ok: false, error: "Décision D1 « simulation » décidée requise." };
  }
  const p = { period_year: Number(d.period_year), period_month: Number(d.period_month), site_id: d.site_id ?? null };
  let runQuery = supabase
    .from("hr_payroll_runs")
    .select("id")
    .eq("period_year", p.period_year)
    .eq("period_month", p.period_month);
  runQuery = p.site_id ? runQuery.eq("site_id", p.site_id) : runQuery.is("site_id", null);
  const { data: draft, error: runErr } = await runQuery.maybeSingle();
  if (runErr) return { ok: false, error: runErr.message };

  let computed: Awaited<ReturnType<typeof computePayrollSlips>>;
  try {
    computed = await computePayrollSlips(supabase, p, { runId: draft?.id ?? null, decisionId, scope: [] });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Simulation de la paie impossible." };
  }
  if (!computed.ok) return computed;
  const empIds = [...new Set(computed.data.slips.map((s) => s.employee_id))];
  const matricules = new Map<string, string>();
  if (empIds.length) {
    const { data: emps, error: eErr } = await supabase.from("hr_employees").select("id, matricule").in("id", empIds);
    if (eErr) return { ok: false, error: eErr.message };
    for (const e of emps ?? []) matricules.set(e.id, e.matricule);
  }
  const warnings = simulationWarnings(computed.data.warnings);
  const { data, error } = await supabase.rpc("hr_payroll_simulation_save", {
    p_decision: decisionId,
    p_slips: computed.data.slips.map((s) => toSimulationSlip(s, matricules.get(s.employee_id) ?? null)),
    p_warnings: warnings,
  });
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as { ok?: boolean; reason?: string; new_decision_id?: string | null; simulation_id?: string };
  if (r.ok !== true || typeof r.simulation_id !== "string") {
    return {
      ok: false,
      error:
        r.reason === "INVALIDATED"
          ? "Les règles ou les présences du mois ont changé depuis la décision : elle est invalidée et une nouvelle demande est ouverte."
          : "Simulation non enregistrée.",
      invalidated: r.new_decision_id ?? null,
    };
  }
  revalidatePath("/rh/paie/preparation");
  revalidatePath("/decisions");
  return { ok: true, data: { simulation_id: r.simulation_id, count: computed.data.slips.length, warnings } };
}

/** Throws on query error: a failed read must never produce silent zero-amount slips. */
function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what} : ${res.error.message}`);
  return (res.data ?? []) as T;
}

/** Draft slips of this run that this refresh must not recompute or delete. */
async function loadPreservedDraftSlips(
  supabase: Supabase,
  runId: string,
  scope: string[],
): Promise<
  ActionResult<
    Array<{ employee_id: string; row: Record<string, unknown>; lines: PayrollLine[] }>
  >
> {
  const scopeSet = new Set(scope);
  const { data: slips, error } = await supabase
    .from("hr_payroll_slips")
    .select(
      "id, employee_id, hr_contract_id, days_worked, days_paid, days_leave, days_absence, days_weekend, days_abandon, days_rappel, days_by_code, net_target, gross_amount, employee_ss, employer_ss, cacobatph, intemperies_employee, intemperies_employer, extra_employee, extra_employer, extra_contributions, irg_base, irg_amount, net_payable, legal_snapshot",
    )
    .eq("run_id", runId)
    .eq("status_code", "DRAFT");
  if (error) return { ok: false, error: error.message };
  const kept = (slips ?? []).filter((s) => !scopeSet.has(s.employee_id));
  if (!kept.length) return { ok: true, data: [] };
  const { data: lines, error: lineErr } = await supabase
    .from("hr_payroll_slip_lines")
    .select(
      "slip_id, rubrique_id, exception_id, advance_id, source_code, code, label_ar, label_fr, category, nature, unit, cotisable, taxable, quantity, unit_amount, amount, sort_order",
    )
    .in(
      "slip_id",
      kept.map((s) => s.id),
    );
  if (lineErr) return { ok: false, error: lineErr.message };
  const linesBySlip = new Map<string, PayrollLine[]>();
  for (const line of lines ?? []) {
    const list = linesBySlip.get(line.slip_id) ?? [];
    list.push({
      rubrique_id: line.rubrique_id,
      exception_id: line.exception_id,
      advance_id: line.advance_id,
      source_code: line.source_code,
      code: line.code,
      label_ar: line.label_ar,
      label_fr: line.label_fr,
      category: line.category,
      nature: line.nature,
      unit: line.unit,
      cotisable: Boolean(line.cotisable),
      taxable: Boolean(line.taxable),
      quantity: num(line.quantity),
      unit_amount: num(line.unit_amount),
      amount: num(line.amount),
      sort_order: line.sort_order,
    } as PayrollLine);
    linesBySlip.set(line.slip_id, list);
  }
  return {
    ok: true,
    data: kept.map((s) => ({
      employee_id: s.employee_id,
      lines: linesBySlip.get(s.id) ?? [],
      row: {
        run_id: runId,
        employee_id: s.employee_id,
        hr_contract_id: s.hr_contract_id,
        days_worked: num(s.days_worked),
        days_paid: num(s.days_paid),
        days_leave: num(s.days_leave),
        days_absence: num(s.days_absence),
        days_weekend: num(s.days_weekend),
        days_abandon: num(s.days_abandon),
        days_rappel: num(s.days_rappel),
        days_by_code: s.days_by_code ?? {},
        net_target: num(s.net_target),
        gross_amount: num(s.gross_amount),
        employee_ss: num(s.employee_ss),
        employer_ss: num(s.employer_ss),
        cacobatph: num(s.cacobatph),
        intemperies_employee: num(s.intemperies_employee),
        intemperies_employer: num(s.intemperies_employer),
        extra_employee: num(s.extra_employee),
        extra_employer: num(s.extra_employer),
        extra_contributions: s.extra_contributions ?? [],
        irg_base: num(s.irg_base),
        irg_amount: num(s.irg_amount),
        net_payable: num(s.net_payable),
        status_code: "DRAFT",
        legal_snapshot: s.legal_snapshot,
      },
    })),
  };
}

async function buildAndSavePayrollRun(
  supabase: Supabase,
  p: { period_year: number; period_month: number; site_id?: string | null },
  decisionId: string,
  onlyEmployeeIds?: string[],
): Promise<ActionResult<{ run_id: string; count: number; warnings: string[] }>> {
  const scope = (onlyEmployeeIds ?? []).filter((id) => UUID_RE.test(id));

  let existingRunQuery = supabase
    .from("hr_payroll_runs")
    .select("id, status_code")
    .eq("period_year", p.period_year)
    .eq("period_month", p.period_month);
  existingRunQuery = p.site_id
    ? existingRunQuery.eq("site_id", p.site_id)
    : existingRunQuery.is("site_id", null);
  const { data: existingRun, error: existingRunErr } = await existingRunQuery.maybeSingle();
  if (existingRunErr) return { ok: false, error: existingRunErr.message };
  const existingStatus = existingRun ? normalizeRunStatus(existingRun.status_code) : null;
  if (existingStatus === "LOCKED") {
    return {
      ok: false,
      error: "Paie clôturée : régénération impossible. · الأجور مقفلة: لا يمكن إعادة التوليد.",
    };
  }
  if (existingStatus === "VALIDATED") {
    return {
      ok: false,
      error: "Paie validée : réouvrez-la avant de régénérer. · الأجور معتمدة: أعد فتحها قبل إعادة التوليد.",
    };
  }
  let run: { id: string } | null = existingRun ? { id: existingRun.id } : null;
  if (!run) {
    const { data: created, error: runErr } = await supabase.rpc("hr_payroll_run_open", {
      p_decision: decisionId,
    });
    if (runErr || typeof created !== "string") return { ok: false, error: runErr?.message ?? "Run refusé." };
    run = { id: created };
  }

  const computed = await computePayrollSlips(supabase, p, { runId: run.id, decisionId, scope });
  if (!computed.ok) return computed;
  const { slips: slipPayloads, warnings } = computed.data;

  const recomputed = slipPayloads.length;
  if (scope.length) {
    const preserved = await loadPreservedDraftSlips(supabase, run.id, scope);
    if (!preserved.ok) return preserved;
    slipPayloads.push(...preserved.data);
  }

  const lineRows = slipPayloads.flatMap((s) =>
    s.lines.map((line) => ({
      employee_id: s.employee_id,
      rubrique_id: line.rubrique_id,
      exception_id: line.exception_id,
      advance_id: line.advance_id ?? null,
      source_code: line.source_code,
      code: line.code,
      label_ar: line.label_ar,
      label_fr: line.label_fr,
      category: line.category,
      nature: line.nature,
      unit: line.unit,
      cotisable: line.cotisable,
      taxable: line.taxable,
      quantity: line.quantity,
      unit_amount: line.unit_amount,
      amount: line.amount,
      sort_order: line.sort_order,
    })),
  );
  const { error: saveErr } = await supabase.rpc("hr_payroll_replace_slips", {
    p_run_id: run.id,
    p_slips: slipPayloads.map((s) => s.row),
    p_lines: lineRows,
    p_decision: decisionId,
  });
  if (saveErr) return { ok: false, error: saveErr.message };

  revalidatePath("/rh/paie");
  revalidatePath("/rh/paie/bulletins");
  revalidatePath("/rh/paie/social");
  revalidatePath("/rh/paie/fiscal");
  revalidatePath("/rh/paie/exceptions");
  return { ok: true, data: { run_id: run.id, count: recomputed, warnings } };
}

type PayrollSlipPayload = {
  row: Record<string, unknown>;
  lines: PayrollLine[];
  employee_id: string;
};

/**
 * Slips of the month as the payroll engine computes them, without writing anything. Shared by the
 * real payroll (D4 / D3) and the D1 simulation; `runId` is the draft whose own advance deductions are
 * not counted as taken elsewhere (null when no payroll exists for the month).
 */
async function computePayrollSlips(
  supabase: Supabase,
  p: { period_year: number; period_month: number; site_id?: string | null },
  opts: { runId: string | null; decisionId: string; scope: string[] },
): Promise<ActionResult<{ slips: PayrollSlipPayload[]; warnings: string[] }>> {
  const { scope } = opts;
  const start = `${p.period_year}-${String(p.period_month).padStart(2, "0")}-01`;
  const endDay = new Date(p.period_year, p.period_month, 0).getDate();
  const end = `${p.period_year}-${String(p.period_month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

  let legalVersions: Awaited<ReturnType<typeof legalVarVersionsAsOf>>;
  try {
    legalVersions = await legalVarVersionsAsOf(supabase, start);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const { vars: legalVars, rows: legalVarRows } = legalVersions;
  const irgLoaded = await loadIrgEngine(supabase, start);
  if (!irgLoaded.ok) return irgLoaded;
  const irgEngine = irgLoaded.data;
  const contribLoaded = await loadContributionDefs(supabase, start);
  if (!contribLoaded.ok) return contribLoaded;
  const contributionDefs = contribLoaded.data;

  let contractsQuery = supabase
    .from("hr_contracts")
    .select(
      "id, employee_id, site_id, salaire_net_ref_monthly, salaire_base_monthly, activity_code_id, start_date, end_date, status, poste_id, grade, cnas_regime_code, start_exception_decision",
    )
    .eq("affectation_principale", true)
    .in("status", [...PAYROLL_CONTRACT_STATUSES, "ENDED"])
    .or("contract_type_code.is.null,contract_type_code.neq.INTERIM");
  if (scope.length) contractsQuery = contractsQuery.in("employee_id", scope);
  const { data: contractRows, error: cErr } = await contractsQuery;
  if (cErr) return { ok: false, error: cErr.message };
  const payable = (contractRows ?? []).filter((c) =>
    contractPayableInPeriod(
      {
        status: String(c.status),
        start_date: String(c.start_date),
        end_date: c.end_date ? String(c.end_date) : null,
      },
      start,
      end,
    ),
  );
  const assignmentLoaded = await loadContractAssignments(
    supabase,
    payable.map((c) => c.id),
  );
  if (!assignmentLoaded.ok) return assignmentLoaded;
  const monthByEmp = monthAssignmentsByEmployee(payable, assignmentLoaded.data, start);
  const contracts = p.site_id
    ? payable.filter((c) => monthByEmp.get(c.employee_id)?.siteId === p.site_id)
    : payable;

  const legendsLoaded = await loadLegendsAt<AttendanceLegend>(
    supabase,
    start,
    "code, label_fr, label_ar, counts_as_presence",
  );
  if (!legendsLoaded.ok) return legendsLoaded;
  const legends = legendsLoaded.data;

  let attQuery = supabase
    .from("hr_attendance")
    .select("employee_id, site_id, legend_code")
    .eq("status_code", "VALIDATED")
    .gte("work_date", start)
    .lte("work_date", end);
  if (p.site_id) attQuery = attQuery.eq("site_id", p.site_id);
  if (scope.length) attQuery = attQuery.in("employee_id", scope);
  const att = must(await attQuery, "Pointage");

  const movementsByEmp = accumulateAttendanceMovements(
    att,
    legends,
    p.site_id ? { siteId: p.site_id } : undefined,
  );
  const annualLeaveByEmp = new Map<string, number>();
  for (const cell of att) {
    if (String(cell.legend_code).toUpperCase() !== ANNUAL_LEAVE_LEGEND) continue;
    annualLeaveByEmp.set(cell.employee_id, (annualLeaveByEmp.get(cell.employee_id) ?? 0) + 1);
  }

  const activities = must(
    await supabase.from("ref_activity_codes").select("id, applies_cacobatph, applies_intemperies"),
    "Codes activité",
  );
  const cacoSites = new Set(
    activities.filter((a) => a.applies_cacobatph).map((a) => a.id),
  );
  const intempSites = new Set(
    activities.filter((a) => a.applies_intemperies).map((a) => a.id),
  );

  const empIds = [...new Set(contracts.map((c) => c.employee_id))];
  const employees = empIds.length
    ? must(
        await supabase.from("hr_employees").select("id, irg_category, nss, matricule").in("id", empIds),
        "Employés",
      )
    : [];
  const irgCat = new Map(
    (employees ?? []).map((e) => [e.id, e.irg_category ?? "STANDARD"]),
  );
  const empById = new Map((employees ?? []).map((e) => [e.id, e]));

  const compliance = await loadComplianceContext(supabase, {
    contractIds: contracts.map((c) => c.id),
    siteIds: [...new Set(contracts.map((c) => monthByEmp.get(c.employee_id)?.siteId ?? c.site_id))],
    employeeIds: empIds,
    asOf: start,
  });
  if (!compliance.ok) return compliance;
  const cx = compliance.data;

  const rubriques = must(
    await supabase
      .from("hr_salary_rubriques")
      .select("id, code, label_ar, label_fr, nature, unit, category, cotisable, taxable, is_active")
      .eq("is_active", true),
    "Rubriques",
  ) as PayrollRubrique[];

  let assignmentQuery = supabase
    .from("hr_salary_assignments")
    .select("rubrique_id, employee_id, site_id, contract_id, poste_id, amount, unit, is_active")
    .eq("is_active", true);
  if (scope.length) {
    assignmentQuery = assignmentQuery.or(
      `employee_id.in.(${scope.join(",")}),employee_id.is.null`,
    );
  }
  const assignments = (
    must(await assignmentQuery, "Affectations de rubriques") as PayrollAssignment[]
  ).map((a) => ({ ...a, amount: num(a.amount) }));

  const grid = (
    must(
      await supabase
        .from("hr_salary_grid")
        .select("poste_id, grade, base_monthly, net_ref_monthly, effective_from"),
      "Grille salariale",
    ) as SalaryGridRow[]
  ).map((g) => ({
    ...g,
    base_monthly: num(g.base_monthly),
    net_ref_monthly: g.net_ref_monthly == null ? null : num(g.net_ref_monthly),
    effective_from: String(g.effective_from).slice(0, 10),
  }));

  let exceptionQuery = supabase
    .from("hr_salary_exceptions")
    .select(
      "id, employee_id, rubrique_id, amount, unit, period_year, period_month, duration_mode, until_year, until_month, status_code, is_active",
    )
    .eq("is_active", true)
    .eq("status_code", "APPROVED");
  if (scope.length) exceptionQuery = exceptionQuery.in("employee_id", scope);
  const exceptions = (must(await exceptionQuery, "Exceptions") as PayrollException[]).map((e) => ({
    ...e,
    amount: num(e.amount),
  }));

  const contractIds = contracts.map((c) => c.id);
  const salaryVersions = contractIds.length
    ? (
        must(
          await supabase
            .from("hr_contract_salary_history")
            .select("id, contract_id, effective_from, salaire_base_monthly, salaire_net_ref_monthly")
            .in("contract_id", contractIds),
          "Historique des salaires",
        ) as SalaryVersion[]
      ).map((v) => ({
        ...v,
        id: String(v.id),
        effective_from: String(v.effective_from).slice(0, 10),
        salaire_base_monthly: num(v.salaire_base_monthly),
        salaire_net_ref_monthly: num(v.salaire_net_ref_monthly),
      }))
    : [];

  let sheetQuery = supabase
    .from("hr_attendance_sheet_rows")
    .select("employee_id, cell_values")
    .eq("period_year", p.period_year)
    .eq("period_month", p.period_month);
  if (p.site_id) sheetQuery = sheetQuery.eq("site_id", p.site_id);
  if (scope.length) sheetQuery = sheetQuery.in("employee_id", scope);
  const hoursByEmp = new Map<string, Record<string, number>>();
  for (const row of must(await sheetQuery, "Heures supplémentaires") as {
    employee_id: string;
    cell_values: Record<string, unknown> | null;
  }[]) {
    const acc = hoursByEmp.get(row.employee_id) ?? {};
    for (const col of OVERTIME_COLUMNS) {
      const h = num((row.cell_values ?? {})[col.code]);
      if (h > 0) acc[col.code] = (acc[col.code] ?? 0) + h;
    }
    hoursByEmp.set(row.employee_id, acc);
  }
  const advances = empIds.length
    ? (
        must(
          await supabase
            .from("hr_employee_advances")
            .select(
              "id, employee_id, kind, principal_amount, installment_amount, start_year, start_month, status",
            )
            .eq("status", "ACTIVE")
            .in("employee_id", empIds),
          "Avances et prêts",
        ) as PayrollAdvance[]
      ).map((a) => ({
        ...a,
        principal_amount: num(a.principal_amount),
        installment_amount: num(a.installment_amount),
      }))
    : [];
  const deductedElsewhere = new Map<string, number>();
  if (advances.length) {
    const taken = must(
      await supabase
        .from("hr_payroll_slip_lines")
        .select("advance_id, amount, slip:hr_payroll_slips!inner(run_id)")
        .in(
          "advance_id",
          advances.map((a) => a.id),
        ),
      "Retenues déjà effectuées",
    ) as unknown as { advance_id: string; amount: number; slip: { run_id: string } | { run_id: string }[] }[];
    for (const t of taken) {
      const slip = Array.isArray(t.slip) ? t.slip[0] : t.slip;
      if (!slip || slip.run_id === opts.runId) continue;
      deductedElsewhere.set(t.advance_id, (deductedElsewhere.get(t.advance_id) ?? 0) + Math.abs(num(t.amount)));
    }
  }

  const exitByEmp = new Map<string, SettlementLine[]>();
  if (empIds.length) {
    const exits = must(
      await supabase
        .from("hr_employee_exits")
        .select("employee_id, settlement_lines")
        .eq("status", "VALIDATED")
        .gte("exit_date", start)
        .lte("exit_date", end)
        .in("employee_id", empIds),
      "Sorties",
    ) as { employee_id: string; settlement_lines: unknown }[];
    for (const x of exits) exitByEmp.set(x.employee_id, normalizeSettlementLines(x.settlement_lines));
  }

  const warnings: string[] = [];
  if (!irgEngine.brackets.length) {
    warnings.push("Barème IRG introuvable pour la période : IRG = 0 · سلم الضريبة غير موجود لهذه الفترة");
  }
  const engine: SlipEngine = {
    ...slipEngineRates(legalVars),
    contributionDefs,
    legalVars,
    irg: irgEngine,
    rubriques,
    assignments,
    exceptions,
    grid,
  };
  const slipPayloads: PayrollSlipPayload[] = [];

  for (const group of groupContractsByEmployee(
    contracts.map((c) => ({
      ...c,
      start_date: String(c.start_date).slice(0, 10),
      end_date: c.end_date ? String(c.end_date).slice(0, 10) : null,
    })),
    start,
    end,
  )) {
    const ctr = group.contract;
    const monthAsg = monthByEmp.get(ctr.employee_id);
    const monthSiteId = monthAsg?.siteId ?? ctr.site_id;
    const mov = movementsByEmp.get(ctr.employee_id) ?? emptyMovements();
    const taxpayer = irgCat.get(ctr.employee_id) ?? "STANDARD";
    const resolved = resolveCompliance({
      overrides: cx.overridesByContract.get(ctr.id) ?? [],
      periodStart: start,
      periodEnd: end,
      employeeIrgCategory: taxpayer,
      socialProfileCode: ctr.cnas_regime_code || cx.socialProfile.get(ctr.employee_id) || null,
      siteZoneCode: cx.siteZone.get(monthSiteId)?.code ?? DEFAULT_IRG_ZONE,
      activity: {
        cacobatph: cacoSites.has(ctr.activity_code_id),
        intemperies: intempSites.has(ctr.activity_code_id),
      },
      vars: legalVars,
      zones: cx.zones,
      regimes: cx.regimes,
    });
    const salary = salaryAsOf(salaryVersions, ctr.id, end, {
      base: num(ctr.salaire_base_monthly),
      net: num(ctr.salaire_net_ref_monthly),
    });
    const siteZone = cx.siteZone.get(monthSiteId);
    const assignmentRow = monthAsg?.assignmentId
      ? assignmentLoaded.data.find((a) => a.id === monthAsg.assignmentId)
      : undefined;
    const trace = buildSlipTrace({
      legalVarRows,
      irg: irgEngine.trace,
      resolved,
      siteZone,
      zoneScope: siteZone?.scope_id ? cx.zoneScopes.get(siteZone.scope_id) : undefined,
      regimeRates: cx.regimeRateRows.get(resolved.cnas.regime_code),
      contract: {
        id: monthAsg?.contractId ?? ctr.id,
        start_exception_decision: ctr.start_exception_decision ? String(ctr.start_exception_decision) : null,
      },
      assignment: {
        id: monthAsg?.assignmentId ?? null,
        corrected_by_decision: assignmentRow?.corrected_by_decision ?? null,
      },
      salaryVersionId: salaryVersionAt(salaryVersions, ctr.id, end)?.id ?? null,
      payrollDecisionId: opts.decisionId,
    });
    const emp = empById.get(ctr.employee_id);
    const slip = computeSlip({
      year: p.period_year,
      month: p.period_month,
      engine,
      subject: {
        contract: {
          id: ctr.id,
          employee_id: ctr.employee_id,
          site_id: monthSiteId,
          poste_id: ctr.poste_id,
          grade: ctr.grade,
        },
        employee: { matricule: emp?.matricule ?? "", nss: emp?.nss ?? null },
        coveredDays: group.coveredDays,
        contractCount: group.contractCount,
        daysPaid: mov.days_paid,
        daysPresence: mov.days_presence_qty,
        annualLeaveDays: annualLeaveByEmp.get(ctr.employee_id) ?? 0,
        salary,
        compliance: resolved,
        overtimeHours: hoursByEmp.get(ctr.employee_id) ?? {},
        exitLines: exitByEmp.get(ctr.employee_id) ?? null,
        advances,
        deductedElsewhere,
      },
    });
    const { lines, summary: sum } = slip;
    const paid = slip.days_paid;
    warnings.push(...slip.warnings);
    const labels = complianceLabels(resolved, cx.zones, cx.regimes);
    if (resolved.override_ids.length) {
      const manual = [
        resolved.irg.mode === "MANUAL" ? `IRG ${labels.irg}` : null,
        resolved.cnas.mode === "MANUAL" ? `CNAS ${labels.cnas}` : null,
        resolved.cacobatph.mode === "MANUAL" ? `CACOBATPH ${labels.cacobatph}` : null,
      ].filter(Boolean);
      warnings.push(
        `${emp?.matricule ?? "—"} : régime manuel · وضع يدوي — ${manual.join(" ; ")}`,
      );
    }
    slipPayloads.push({
      employee_id: ctr.employee_id,
      lines,
      row: {
        run_id: opts.runId,
        employee_id: ctr.employee_id,
        hr_contract_id: ctr.id,
        days_worked: mov.days_worked,
        days_paid: paid,
        days_leave: mov.days_leave,
        days_absence: mov.days_absence,
        days_weekend: mov.days_weekend,
        days_abandon: mov.days_abandon,
        days_rappel: mov.days_rappel,
        days_by_code: mov.days_by_code,
        net_target: salary.net,
        gross_amount: sum.gross_cotisable,
        employee_ss: sum.employee_ss,
        employer_ss: sum.employer_ss,
        cacobatph: sum.cacobatph,
        intemperies_employee: sum.intemperies_employee,
        intemperies_employer: sum.intemperies_employer,
        extra_employee: sum.extra_employee,
        extra_employer: sum.extra_employer,
        extra_contributions: sum.extra_contributions,
        irg_base: sum.irg_base,
        irg_amount: sum.irg_amount,
        net_payable: sum.net_payable,
        status_code: "DRAFT",
        legal_snapshot: {
          as_of: start,
          vars: {
            ...legalVars,
            CNAS_EMPLOYEE: resolved.cnas.employee,
            CNAS_EMPLOYER_BASE: resolved.cnas.employer,
            CNAS_FOS: resolved.cnas.fos,
          },
          irg_category: resolved.irg.category,
          compliance: { ...resolved, labels } satisfies SnapshotCompliance,
          assignment: {
            id: monthAsg?.assignmentId ?? null,
            contract_id: monthAsg?.contractId ?? ctr.id,
            site_id: monthSiteId,
            zone_code: siteZone?.code ?? DEFAULT_IRG_ZONE,
          },
          trace,
        } satisfies PayrollLegalSnapshot,
      },
    });
  }

  return { ok: true, data: { slips: slipPayloads, warnings } };
}

/**
 * Per-code pointed days of each slip. Slips generated before the counts were stored (validated ones
 * cannot be rewritten) get them from the validated pointage of the month, with the generation scope.
 */
async function pointedDaysByCode(
  supabase: Supabase,
  slips: { id: string; run_id: string; employee_id: string; days_by_code: unknown }[],
  runs: Map<string, { site_id: string | null }>,
  year: number,
  month: number,
) {
  const out = new Map<string, Record<string, number>>();
  const missing: typeof slips = [];
  for (const slip of slips) {
    const counts = dayCounts(slip.days_by_code);
    if (Object.keys(counts).length) out.set(slip.id, counts);
    else missing.push(slip);
  }
  if (!missing.length) return out;
  const mm = String(month).padStart(2, "0");
  const { data: cells, error } = await supabase
    .from("hr_attendance")
    .select("employee_id, site_id, legend_code")
    .eq("status_code", "VALIDATED")
    .gte("work_date", `${year}-${mm}-01`)
    .lte("work_date", `${year}-${mm}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`)
    .in("employee_id", [...new Set(missing.map((s) => s.employee_id))]);
  if (error) return out;
  for (const slip of missing) {
    const siteId = runs.get(slip.run_id)?.site_id ?? null;
    const counts: Record<string, number> = {};
    for (const cell of cells ?? []) {
      if (cell.employee_id !== slip.employee_id || (siteId && cell.site_id !== siteId)) continue;
      const code = String(cell.legend_code ?? "").trim().toUpperCase();
      if (code) counts[code] = (counts[code] ?? 0) + 1;
    }
    out.set(slip.id, counts);
  }
  return out;
}

export async function listPayrollSlips(input: {
  year: number;
  month: number;
  /** List screens skip lines and print identity; declarations and costs keep the default. */
  includeLines?: boolean;
}): Promise<ActionResult<PayrollSlipRow[]>> {
  const supabase = await createClient();
  const { data: runs, error: rErr } = await supabase
    .from("hr_payroll_runs")
    .select("id, period_year, period_month, site_id")
    .eq("period_year", input.year)
    .eq("period_month", input.month);
  if (rErr) return { ok: false, error: rErr.message };
  const runIds = (runs ?? []).map((r) => r.id);
  if (!runIds.length) return { ok: true, data: [] };

  const { data, error } = await supabase
    .from("hr_payroll_slips")
    .select(
      "id, run_id, employee_id, hr_contract_id, days_worked, days_paid, days_leave, days_absence, days_weekend, days_abandon, days_rappel, days_by_code, net_target, gross_amount, employee_ss, employer_ss, cacobatph, intemperies_employee, intemperies_employer, extra_employee, extra_employer, extra_contributions, irg_base, irg_amount, net_payable, status_code, legal_snapshot, employee:hr_employees ( matricule, last_name, first_name, nss, birth_date, hired_at )",
    )
    .in("run_id", runIds);
  if (error) return { ok: false, error: error.message };

  const includeLines = input.includeLines !== false;
  const slipIds = (data ?? []).map((row) => row.id);
  const linesBySlip = new Map<string, PayrollSlipLineRow[]>();
  if (includeLines && slipIds.length) {
    const linesQuery = await supabase
      .from("hr_payroll_slip_lines")
      .select(
        "id, slip_id, source_code, code, label_ar, label_fr, category, nature, unit, cotisable, taxable, quantity, unit_amount, amount, sort_order",
      )
      .in("slip_id", slipIds)
      .order("sort_order");
    if (linesQuery.error) return { ok: false, error: linesQuery.error.message };
    for (const line of linesQuery.data ?? []) {
      const list = linesBySlip.get(line.slip_id) ?? [];
      list.push({
        id: line.id,
        slip_id: line.slip_id,
        source_code: line.source_code,
        code: line.code,
        label_ar: line.label_ar,
        label_fr: line.label_fr,
        category: line.category,
        nature: line.nature,
        unit: line.unit,
        cotisable: Boolean(line.cotisable),
        taxable: Boolean(line.taxable),
        quantity: num(line.quantity),
        unit_amount: num(line.unit_amount),
        amount: num(line.amount),
      });
      linesBySlip.set(line.slip_id, list);
    }
  }

  const runMap = new Map((runs ?? []).map((r) => [r.id, r]));
  const daysByCode = await pointedDaysByCode(supabase, data ?? [], runMap, input.year, input.month);
  const changes = await loadPendingInputChanges(supabase, runIds);
  if (!changes.ok) return changes;
  const empIds = includeLines
    ? [...new Set((data ?? []).map((row) => row.employee_id))]
    : [];
  const contractIds = includeLines
    ? ([...new Set((data ?? []).map((row) => row.hr_contract_id).filter(Boolean))] as string[])
    : [];
  const [civil, contacts, bank, quals, contracts, sites] = await Promise.all([
    empIds.length
      ? supabase.from("hr_employee_civil").select("employee_id, marital_code").in("employee_id", empIds)
      : { data: [] as Array<{ employee_id: string; marital_code: string | null }> },
    empIds.length
      ? supabase
          .from("hr_employee_contacts")
          .select("employee_id, address_fr, commune")
          .in("employee_id", empIds)
      : { data: [] as Array<{ employee_id: string; address_fr: string | null; commune: string | null }> },
    empIds.length
      ? supabase
          .from("hr_employee_bank")
          .select("employee_id, payment_mode_code, account_no, account_key")
          .in("employee_id", empIds)
      : {
          data: [] as Array<{
            employee_id: string;
            payment_mode_code: string | null;
            account_no: string | null;
            account_key: string | null;
          }>,
        },
    empIds.length
      ? supabase
          .from("hr_employee_qualifications")
          .select("employee_id, level_code")
          .in("employee_id", empIds)
      : { data: [] as Array<{ employee_id: string; level_code: string | null }> },
    contractIds.length
      ? supabase
          .from("hr_contracts")
          .select("id, poste_fr, qualification_code, site_id")
          .in("id", contractIds)
      : { data: [] as Array<{ id: string; poste_fr: string | null; qualification_code: string | null; site_id: string }> },
    supabase.from("ref_sites").select("id, name_fr"),
  ]);
  // A failed read would print slips without bank account, address or site instead of reporting it.
  for (const res of [civil, contacts, bank, quals, contracts, sites]) {
    if ("error" in res && res.error) return { ok: false, error: res.error.message };
  }
  const civilMap = new Map((civil.data ?? []).map((r) => [r.employee_id, r]));
  const contactMap = new Map((contacts.data ?? []).map((r) => [r.employee_id, r]));
  const bankMap = new Map((bank.data ?? []).map((r) => [r.employee_id, r]));
  const qualMap = new Map((quals.data ?? []).map((r) => [r.employee_id, r]));
  const contractMap = new Map((contracts.data ?? []).map((r) => [r.id, r]));
  const siteMap = new Map((sites.data ?? []).map((r) => [r.id, r.name_fr]));

  const start = `${input.year}-${String(input.month).padStart(2, "0")}-01`;
  const snapshots = new Map(
    (data ?? []).map((row) => [row.id, parseLegalSnapshot(row.legal_snapshot)]),
  );
  const periodVars = [...snapshots.values()].some((s) => !s)
    ? await legalVarsAsOf(supabase, start)
    : {};

  return {
    ok: true,
    data: (data ?? []).map((row) => {
      const emp = Array.isArray(row.employee) ? row.employee[0] : row.employee;
      const run = runMap.get(row.run_id);
      const ctr = row.hr_contract_id ? contractMap.get(row.hr_contract_id) : undefined;
      const cv = civilMap.get(row.employee_id);
      const ct = contactMap.get(row.employee_id);
      const bk = bankMap.get(row.employee_id);
      const q = qualMap.get(row.employee_id);
      const siteId = run?.site_id ?? ctr?.site_id ?? null;
      return {
        id: row.id,
        run_id: row.run_id,
        employee_id: row.employee_id,
        period_year: run?.period_year ?? input.year,
        period_month: run?.period_month ?? input.month,
        site_id: siteId,
        hr_contract_id: row.hr_contract_id ?? null,
        days_worked: num(row.days_worked),
        days_paid: num(row.days_paid),
        days_leave: num(row.days_leave),
        days_absence: num(row.days_absence),
        days_weekend: num(row.days_weekend),
        days_abandon: num(row.days_abandon),
        days_rappel: num(row.days_rappel),
        days_by_code: daysByCode.get(row.id) ?? {},
        net_target: num(row.net_target),
        gross_amount: num(row.gross_amount),
        employee_ss: num(row.employee_ss),
        employer_ss: num(row.employer_ss),
        cacobatph: num(row.cacobatph),
        intemperies_employee: num(row.intemperies_employee),
        intemperies_employer: num(row.intemperies_employer),
        extra_employee: num(row.extra_employee),
        extra_employer: num(row.extra_employer),
        extra_contributions: parseAppliedContributions(row.extra_contributions),
        irg_base: num(row.irg_base),
        irg_amount: num(row.irg_amount),
        net_payable: num(row.net_payable),
        status_code: row.status_code,
        matricule: emp?.matricule ?? "",
        employee_name: `${emp?.last_name ?? ""} ${emp?.first_name ?? ""}`.trim(),
        last_name: emp?.last_name ?? "",
        first_name: emp?.first_name ?? "",
        nss: emp?.nss ?? null,
        birth_date: emp?.birth_date ?? null,
        hired_at: emp?.hired_at ?? null,
        marital_code: cv?.marital_code ?? null,
        address_fr: ct?.address_fr ?? null,
        commune: ct?.commune ?? null,
        poste_fr: ctr?.poste_fr ?? null,
        site_name: siteId ? siteMap.get(siteId) ?? null : null,
        qualification_code: ctr?.qualification_code ?? q?.level_code ?? null,
        payment_mode_code: bk?.payment_mode_code ?? null,
        account_no: bk?.account_no ?? null,
        account_key: bk?.account_key ?? null,
        legal_vars: snapshots.get(row.id)?.vars ?? periodVars,
        compliance: snapshots.get(row.id)?.compliance ?? null,
        trace: snapshots.get(row.id)?.trace ?? null,
        lines: linesBySlip.get(row.id) ?? [],
        detail_loaded: includeLines,
        inputs_changed:
          row.status_code === "DRAFT" && slipInputsChanged(changes.data, row.run_id, row.employee_id),
      };
    }),
  };
}

type PendingInputChanges = Map<string, { whole: boolean; employees: Set<string>; count: number }>;

/** Unresolved "données modifiées depuis le calcul" per run. */
async function loadPendingInputChanges(
  supabase: Supabase,
  runIds: string[],
): Promise<ActionResult<PendingInputChanges>> {
  const out: PendingInputChanges = new Map();
  if (!runIds.length) return { ok: true, data: out };
  const { data, error } = await supabase
    .from("hr_payroll_input_changes")
    .select("run_id, employee_id")
    .in("run_id", runIds)
    .is("resolved_at", null);
  if (error) return { ok: false, error: error.message };
  for (const row of data ?? []) {
    const entry = out.get(row.run_id) ?? { whole: false, employees: new Set<string>(), count: 0 };
    entry.count += 1;
    if (row.employee_id) entry.employees.add(row.employee_id);
    else entry.whole = true;
    out.set(row.run_id, entry);
  }
  return { ok: true, data: out };
}

function slipInputsChanged(changes: PendingInputChanges, runId: string, employeeId: string) {
  const entry = changes.get(runId);
  return Boolean(entry && (entry.whole || entry.employees.has(employeeId)));
}

const SLIP_DETAIL_LIMIT = 80;

export async function loadPayrollSlipDetails(
  ids: string[],
): Promise<ActionResult<PayrollSlipDetail[]>> {
  const unique = [...new Set(ids)].filter((id) => UUID_RE.test(id));
  if (!unique.length) return { ok: true, data: [] };
  if (unique.length > SLIP_DETAIL_LIMIT) {
    return { ok: false, error: "Trop de bulletins d'un coup. · عدد الكشوف أكبر من الحد." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_payroll_slips")
    .select("id, employee_id, hr_contract_id")
    .in("id", unique);
  if (error) return { ok: false, error: error.message };
  if ((data ?? []).length !== unique.length) {
    return { ok: false, error: "Bulletin introuvable. · الكشف غير موجود." };
  }
  const empIds = [...new Set((data ?? []).map((row) => row.employee_id))];
  const contractIds = [...new Set((data ?? []).map((row) => row.hr_contract_id).filter(Boolean))] as string[];
  const [linesQuery, civil, contacts, bank, quals, contracts] = await Promise.all([
    supabase
      .from("hr_payroll_slip_lines")
      .select(
        "id, slip_id, source_code, code, label_ar, label_fr, category, nature, unit, cotisable, taxable, quantity, unit_amount, amount, sort_order",
      )
      .in("slip_id", unique)
      .order("sort_order"),
    supabase.from("hr_employee_civil").select("employee_id, marital_code").in("employee_id", empIds),
    supabase.from("hr_employee_contacts").select("employee_id, address_fr, commune").in("employee_id", empIds),
    supabase
      .from("hr_employee_bank")
      .select("employee_id, payment_mode_code, account_no, account_key")
      .in("employee_id", empIds),
    supabase.from("hr_employee_qualifications").select("employee_id, level_code").in("employee_id", empIds),
    contractIds.length
      ? supabase.from("hr_contracts").select("id, poste_fr, qualification_code").in("id", contractIds)
      : Promise.resolve({ data: [] as Array<{ id: string; poste_fr: string | null; qualification_code: string | null }>, error: null }),
  ]);
  if (linesQuery.error) return { ok: false, error: linesQuery.error.message };
  if (civil.error) return { ok: false, error: civil.error.message };
  if (contacts.error) return { ok: false, error: contacts.error.message };
  if (bank.error) return { ok: false, error: bank.error.message };
  if (quals.error) return { ok: false, error: quals.error.message };
  if (contracts.error) return { ok: false, error: contracts.error.message };
  const linesBySlip = new Map<string, PayrollSlipLineRow[]>();
  for (const line of linesQuery.data ?? []) {
    const list = linesBySlip.get(line.slip_id) ?? [];
    list.push({
      id: line.id,
      slip_id: line.slip_id,
      source_code: line.source_code,
      code: line.code,
      label_ar: line.label_ar,
      label_fr: line.label_fr,
      category: line.category,
      nature: line.nature,
      unit: line.unit,
      cotisable: Boolean(line.cotisable),
      taxable: Boolean(line.taxable),
      quantity: num(line.quantity),
      unit_amount: num(line.unit_amount),
      amount: num(line.amount),
    });
    linesBySlip.set(line.slip_id, list);
  }
  const civilMap = new Map((civil.data ?? []).map((r) => [r.employee_id, r]));
  const contactMap = new Map((contacts.data ?? []).map((r) => [r.employee_id, r]));
  const bankMap = new Map((bank.data ?? []).map((r) => [r.employee_id, r]));
  const qualMap = new Map((quals.data ?? []).map((r) => [r.employee_id, r]));
  const contractMap = new Map((contracts.data ?? []).map((r) => [r.id, r]));
  return {
    ok: true,
    data: (data ?? []).map((row) => {
      const cv = civilMap.get(row.employee_id);
      const ct = contactMap.get(row.employee_id);
      const bk = bankMap.get(row.employee_id);
      const q = qualMap.get(row.employee_id);
      const ctr = row.hr_contract_id ? contractMap.get(row.hr_contract_id) : undefined;
      return {
        id: row.id,
        lines: linesBySlip.get(row.id) ?? [],
        marital_code: cv?.marital_code ?? null,
        address_fr: ct?.address_fr ?? null,
        commune: ct?.commune ?? null,
        poste_fr: ctr?.poste_fr ?? null,
        qualification_code: ctr?.qualification_code ?? q?.level_code ?? null,
        payment_mode_code: bk?.payment_mode_code ?? null,
        account_no: bk?.account_no ?? null,
        account_key: bk?.account_key ?? null,
        detail_loaded: true as const,
      };
    }),
  };
}

async function payrollRunPermissions() {
  const workspace = await getWorkspaceProfile();
  return {
    signedIn: Boolean(workspace),
    canValidate: workspace ? workspaceHasRole(workspace, HR_SALARY_VALUE_ROLES) : false,
    canClose: workspace ? workspaceHasRole(workspace, HR_PAYROLL_CLOSE_ROLES) : false,
  };
}

export async function listPayrollRuns(input: {
  year: number;
  month: number;
}): Promise<
  ActionResult<{
    runs: PayrollRunRow[];
    generation_requests: PayrollGenerationRequest[];
    /** Open D6 request (closing policy of the reprise months), when visible to the user. */
    chain_decision_id: string | null;
    can_validate: boolean;
    can_close: boolean;
  }>
> {
  const supabase = await createClient();
  const month = `${input.year}-${String(input.month).padStart(2, "0")}-01`;
  const [{ data, error }, perms, openDecisions, chainState, chainDecision] = await Promise.all([
    supabase
      .from("hr_payroll_runs")
      .select("id, period_year, period_month, site_id, status_code, validated_at, locked_at")
      .eq("period_year", input.year)
      .eq("period_month", input.month),
    payrollRunPermissions(),
    // RLS: only decisions the user may see (decision holders, requesters, decision centre readers).
    supabase
      .from("sys_decisions")
      .select("id, type_code, site_id, run_id")
      .in("type_code", ["D3", "D4", "D7"])
      .in("status", ["PENDING", "DECIDED"])
      .eq("period_year", input.year)
      .eq("period_month", input.month),
    supabase.rpc("hr_payroll_chain_state"),
    supabase
      .from("sys_decisions")
      .select("id")
      .eq("dedupe_key", "D6")
      .in("status", ["PENDING", "DECIDED"])
      .maybeSingle(),
  ]);
  if (error) return { ok: false, error: error.message };
  const runIds = (data ?? []).map((r) => r.id);
  let slipRows: { run_id: string }[] = [];
  let versionRows: { run_id: string }[] = [];
  if (runIds.length) {
    const [s, v] = await Promise.all([
      supabase.from("hr_payroll_slips").select("run_id").in("run_id", runIds),
      supabase.from("hr_payroll_slip_versions").select("run_id").in("run_id", runIds),
    ]);
    if (s.error) return { ok: false, error: s.error.message };
    slipRows = s.data ?? [];
    versionRows = v.error ? [] : (v.data ?? []);
  }
  const versions = new Map<string, number>();
  for (const v of versionRows) versions.set(v.run_id, (versions.get(v.run_id) ?? 0) + 1);
  const chainRequired = chainState.error ? false : chainDecisionRequired(parseChainState(chainState.data), month);
  const changes = await loadPendingInputChanges(supabase, runIds);
  if (!changes.ok) return changes;
  const counts = new Map<string, number>();
  for (const s of slipRows ?? []) counts.set(s.run_id, (counts.get(s.run_id) ?? 0) + 1);
  const decisions = openDecisions.error ? [] : (openDecisions.data ?? []);
  const byRun = (type: string) =>
    new Map(decisions.filter((d) => d.type_code === type && d.run_id).map((d) => [d.run_id as string, d.id]));
  const recalcByRun = byRun("D3");
  const reopenByRun = byRun("D7");
  return {
    ok: true,
    data: {
      runs: (data ?? []).map((r) => ({
        id: r.id,
        period_year: r.period_year,
        period_month: r.period_month,
        site_id: r.site_id ?? null,
        status_code: normalizeRunStatus(r.status_code),
        validated_at: r.validated_at ?? null,
        locked_at: r.locked_at ?? null,
        slip_count: counts.get(r.id) ?? 0,
        pending_changes: changes.data.get(r.id)?.count ?? 0,
        open_decision_id: recalcByRun.get(r.id) ?? null,
        reopen_decision_id: reopenByRun.get(r.id) ?? null,
        chain_required: chainRequired && normalizeRunStatus(r.status_code) === "DRAFT",
        version_count: versions.get(r.id) ?? 0,
      })),
      generation_requests: decisions
        .filter((d) => d.type_code === "D4")
        .map((d) => ({ site_id: d.site_id ?? null, decision_id: d.id })),
      chain_decision_id: chainDecision.data?.id ?? null,
      can_validate: perms.canValidate,
      can_close: perms.canClose,
    },
  };
}

type PayrollTransitionResult = {
  id: string;
  status_code: PayrollRunStatus;
  /** Bulletins archived as PDF by this transition, by employee id. */
  archives: Record<string, string>;
  archive_error: string | null;
};

async function transitionPayrollRun(
  input: unknown,
  action: PayrollRunAction,
): Promise<ActionResult<PayrollTransitionResult>> {
  const parsed = payrollRunActionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const perms = await payrollRunPermissions();
  if (!perms.signedIn) return { ok: false, error: "Session requise. · يلزم تسجيل الدخول." };
  if (action === "close" ? !perms.canClose : !perms.canValidate) {
    return {
      ok: false,
      error:
        action === "close"
          ? "Clôture réservée à SUPER_ADMIN et GERANT. · الإقفال لـ SUPER_ADMIN و GERANT."
          : "Validation réservée à SUPER_ADMIN, ADMIN_RH et GERANT. · الاعتماد لـ SUPER_ADMIN و ADMIN_RH و GERANT.",
    };
  }
  const supabase = await createClient();
  const { data: run, error } = await supabase
    .from("hr_payroll_runs")
    .select("id, status_code, period_year, period_month")
    .eq("id", parsed.data.run_id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!run) return { ok: false, error: "Paie introuvable. · الأجور غير موجودة." };
  const plan = planRunTransition(run.status_code, action);
  if (!plan.ok) return plan;
  const { data: status, error: rpcErr } = await supabase.rpc("hr_payroll_run_transition", {
    p_run_id: run.id,
    p_action: action,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };
  const archive = await archivePayrollBulletins({
    runId: run.id,
    year: run.period_year,
    month: run.period_month,
    onlyMissing: action === "close",
  });
  revalidatePath("/rh/paie");
  revalidatePath("/rh/paie/bulletins");
  revalidatePath("/rh/paie/social");
  revalidatePath("/rh/paie/fiscal");
  revalidatePath("/rh/presence");
  return {
    ok: true,
    data: {
      id: run.id,
      status_code: normalizeRunStatus(typeof status === "string" ? status : plan.to),
      archives: archive.archived,
      archive_error: archive.error,
    },
  };
}

export async function validatePayrollRun(input: unknown): Promise<ActionResult<PayrollTransitionResult>> {
  return transitionPayrollRun(input, "validate");
}

export async function closePayrollRun(input: unknown): Promise<ActionResult<PayrollTransitionResult>> {
  return transitionPayrollRun(input, "close");
}

const reopenRequestSchema = payrollRunActionSchema.extend({
  reason: z
    .string()
    .trim()
    .min(10, "Motif de la réouverture obligatoire (10 caractères minimum).")
    .max(500, "Motif trop long (500 caractères maximum)."),
});

/** D7: a validated or closed run is never reopened here; the request goes to the SUPER_ADMIN (non-delegable). */
export async function requestPayrollReopen(input: unknown): Promise<ActionResult<{ decision_id: string }>> {
  const parsed = reopenRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_payroll_request_reopen", {
    p_run: parsed.data.run_id,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/rh/paie");
  revalidatePath("/decisions");
  return { ok: true, data: { decision_id: String(data) } };
}

/** D6: validating an operational month while reprise months are open waits for the SUPER_ADMIN's closing policy. */
export async function requestPayrollChainDecision(input: unknown): Promise<ActionResult<{ decision_id: string }>> {
  const parsed = payrollRunActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_payroll_request_chain_decision", { p_run: parsed.data.run_id });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/rh/paie");
  revalidatePath("/decisions");
  return { ok: true, data: { decision_id: String(data) } };
}

export type PayrollSlipVersionRow = {
  id: string;
  slip_id: string;
  employee: string;
  version_no: number;
  run_status: string;
  gross_amount: number;
  irg_amount: number;
  net_payable: number;
  line_count: number;
  decision_id: string | null;
  captured_at: string;
  captured_by: string | null;
};

/** Frozen copies taken before each reopening (read-only; never restored automatically). */
export async function listPayrollSlipVersions(runId: unknown): Promise<ActionResult<PayrollSlipVersionRow[]>> {
  const parsed = z.string().uuid().safeParse(runId);
  if (!parsed.success) return { ok: false, error: "Paie invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_payroll_slip_versions")
    .select(
      "id, slip_id, version_no, run_status, slip, lines, decision_id, captured_at, employee:hr_employees ( matricule, last_name, first_name ), capturer:sys_users!captured_by ( full_name )",
    )
    .eq("run_id", parsed.data)
    .order("captured_at", { ascending: false })
    .order("version_no", { ascending: false })
    .limit(500);
  if (error) return { ok: false, error: error.message };
  type Row = {
    id: string;
    slip_id: string;
    version_no: number;
    run_status: string;
    slip: Record<string, unknown> | null;
    lines: unknown;
    decision_id: string | null;
    captured_at: string;
    employee: { matricule: string | null; last_name: string | null; first_name: string | null } | null;
    capturer: { full_name: string | null } | null;
  };
  return {
    ok: true,
    data: ((data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      slip_id: r.slip_id,
      employee: [r.employee?.matricule, r.employee?.last_name, r.employee?.first_name].filter(Boolean).join(" "),
      version_no: r.version_no,
      run_status: r.run_status,
      gross_amount: num(r.slip?.gross_amount),
      irg_amount: num(r.slip?.irg_amount),
      net_payable: num(r.slip?.net_payable),
      line_count: Array.isArray(r.lines) ? r.lines.length : 0,
      decision_id: r.decision_id,
      captured_at: r.captured_at,
      captured_by: r.capturer?.full_name ?? null,
    })),
  };
}
