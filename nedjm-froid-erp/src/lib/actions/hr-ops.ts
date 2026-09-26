"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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
import {
  advanceDeductionLines,
  buildPayrollLines,
  contractPayableInPeriod,
  exitSettlementLines,
  gridAsOf,
  groupContractsByEmployee,
  overtimeLines,
  paidMonthFraction,
  PAYROLL_CONTRACT_STATUSES,
  payrollLegalWarnings,
  salaryAsOf,
  sortBySalaryClass,
  summarizeLines,
  type LegalPayrollRates,
  type OvertimeSpec,
  type SalaryGridRow,
  type PayrollAdvance,
  type PayrollAssignment,
  type PayrollException,
  type PayrollRubrique,
  type SalaryVersion,
} from "@/lib/hr/payroll-calc";
import { OVERTIME_COLUMNS } from "@/lib/hr/attendance-columns";
import { normalizeSettlementLines, type SettlementLine } from "@/lib/hr/leave";

const ANNUAL_LEAVE_LEGEND = "CA";
import type { IrgBracket, IrgRule } from "@/lib/hr/irg-calc";
import {
  complianceLabels,
  computeResolvedIrg,
  DEFAULT_IRG_ZONE,
  resolveCompliance,
  type SnapshotCompliance,
} from "@/lib/hr/compliance";
import { loadComplianceContext } from "@/lib/hr/compliance-load";
import {
  legalVarsAsOf,
  parseLegalSnapshot,
  type PayrollLegalSnapshot,
} from "@/lib/hr/legal-vars-as-of";
import {
  accumulateAttendanceMovements,
  emptyMovements,
  type AttendanceLegend,
} from "@/lib/hr/attendance-movements";

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
  net_target: number;
  gross_amount: number;
  employee_ss: number;
  employer_ss: number;
  cacobatph: number;
  intemperies_employee: number;
  intemperies_employer: number;
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
  lines: PayrollSlipLineRow[];
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
};

function num(v: unknown) {
  return Number(v ?? 0);
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
 */
export async function saveAttendanceMonth(
  input: unknown,
): Promise<ActionResult<{ count: number; refreshed_slips: number }>> {
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
  // Site chiefs save attendance without payroll rights: the draft is refreshed by RH later.
  const { data: canPayroll } = await supabase.rpc("erp_has_perm", {
    p_screen: "hr_payroll",
    p_action: "update",
  });
  let refreshedCount = 0;
  if (canPayroll === true) {
    const refreshed = await refreshDraftPayroll({
      siteId: p.site_id,
      employeeId: p.employee_id ?? undefined,
      year: p.year,
      month: p.month,
    });
    if (!refreshed.ok) return refreshed;
    refreshedCount = refreshed.data.count;
  }
  revalidatePath("/rh/presence");
  revalidatePath("/rh/paie");
  revalidatePath("/rh/paie/bulletins");
  revalidatePath("/rh/paie/social");
  revalidatePath("/rh/paie/fiscal");
  return {
    ok: true,
    data: { count: p.cells.length, refreshed_slips: refreshedCount },
  };
}

type IrgEngine = {
  brackets: IrgBracket[];
  rulesByCategory: Record<string, IrgRule[]>;
};

async function loadIrgEngine(
  supabase: Awaited<ReturnType<typeof createClient>>,
  asOf: string,
): Promise<ActionResult<IrgEngine>> {
  const { data: versions, error: vErr } = await supabase
    .from("ref_bareme_irg_versions")
    .select("id, effective_from, effective_to")
    .lte("effective_from", asOf)
    .order("effective_from", { ascending: false });
  if (vErr) return { ok: false, error: `Barème IRG : ${vErr.message}` };
  const version = (versions ?? []).find(
    (v) => !v.effective_to || v.effective_to >= asOf,
  );
  let brackets: IrgBracket[] = [];
  if (version) {
    const { data: rows, error: bErr } = await supabase
      .from("ref_bareme_irg")
      .select("min_annual, max_annual, rate, sort_order")
      .eq("version_id", version.id)
      .order("sort_order");
    if (bErr) return { ok: false, error: `Barème IRG : ${bErr.message}` };
    brackets = (rows ?? []).map((r) => ({
      min_annual: num(r.min_annual),
      max_annual: r.max_annual == null ? null : num(r.max_annual),
      rate: num(r.rate),
    }));
  }
  const { data: sets, error: sErr } = await supabase
    .from("ref_irg_rule_sets")
    .select("id, taxpayer_category, effective_from, effective_to")
    .lte("effective_from", asOf)
    .order("effective_from", { ascending: false });
  if (sErr) return { ok: false, error: `Règles IRG : ${sErr.message}` };
  const chosen = new Map<string, string>();
  for (const s of sets ?? []) {
    if (s.effective_to && s.effective_to < asOf) continue;
    if (!chosen.has(s.taxpayer_category)) chosen.set(s.taxpayer_category, s.id);
  }
  const setIds = [...chosen.values()];
  const rulesByCategory: Record<string, IrgRule[]> = {};
  if (setIds.length) {
    const { data: rules, error: rErr } = await supabase
      .from("ref_irg_rules")
      .select("rule_set_id, kind, params, formula, sequence")
      .in("rule_set_id", setIds)
      .order("sequence");
    if (rErr) return { ok: false, error: `Règles IRG : ${rErr.message}` };
    const setToCat = new Map(
      [...chosen.entries()].map(([cat, id]) => [id, cat]),
    );
    for (const rule of rules ?? []) {
      const cat = setToCat.get(rule.rule_set_id);
      if (!cat) continue;
      const list = rulesByCategory[cat] ?? [];
      list.push({
        kind: rule.kind,
        params: (rule.params ?? {}) as Record<string, unknown>,
        formula: rule.formula ?? null,
      });
      rulesByCategory[cat] = list;
    }
  }
  return { ok: true, data: { brackets, rulesByCategory } };
}

export async function generatePayrollRun(
  input: unknown,
): Promise<ActionResult<{ run_id: string; count: number; warnings: string[] }>> {
  const parsed = payrollGenerateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const p = parsed.data;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session requise. · يلزم تسجيل الدخول." };
  const { data: canPayroll, error: permErr } = await supabase.rpc("erp_has_perm", {
    p_screen: "hr_payroll",
    p_action: "update",
  });
  if (permErr) return { ok: false, error: permErr.message };
  if (canPayroll !== true) {
    return { ok: false, error: "Génération de la paie non autorisée. · توليد الأجور غير مسموح لدورك." };
  }
  try {
    return await buildAndSavePayrollRun(supabase, user.id, p);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Génération de la paie impossible." };
  }
}

/** Throws on query error: a failed read must never produce silent zero-amount slips. */
function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what} : ${res.error.message}`);
  return (res.data ?? []) as T;
}

async function buildAndSavePayrollRun(
  supabase: Supabase,
  userId: string,
  p: { period_year: number; period_month: number; site_id?: string | null },
): Promise<ActionResult<{ run_id: string; count: number; warnings: string[] }>> {
  const start = `${p.period_year}-${String(p.period_month).padStart(2, "0")}-01`;
  const endDay = new Date(p.period_year, p.period_month, 0).getDate();
  const end = `${p.period_year}-${String(p.period_month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

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
    const { data: created, error: runErr } = await supabase
      .from("hr_payroll_runs")
      .insert({
        period_year: p.period_year,
        period_month: p.period_month,
        site_id: p.site_id ?? null,
        status_code: "DRAFT",
        created_by: userId,
      })
      .select("id")
      .maybeSingle();
    if (runErr || !created) return { ok: false, error: runErr?.message ?? "Run refusé." };
    run = { id: created.id };
  }

  const legalVars = await legalVarsAsOf(supabase, start);
  const legalVar = (key: string) => num(legalVars[key]);
  const caco = legalVar("CACOBATPH_CONGES");
  const intempSal = legalVar("CACOBATPH_INTEMPERIES_SAL");
  const intempPat = legalVar("CACOBATPH_INTEMPERIES_EMP");
  const divisorVar = legalVar("NJM_DIVISEUR_FIXED");
  const snmg = legalVar("SNMG");
  const divisor = divisorVar > 0 ? divisorVar : 30;
  const irgLoaded = await loadIrgEngine(supabase, start);
  if (!irgLoaded.ok) return irgLoaded;
  const irgEngine = irgLoaded.data;

  let contractsQuery = supabase
    .from("hr_contracts")
    .select(
      "id, employee_id, site_id, salaire_net_ref_monthly, salaire_base_monthly, activity_code_id, start_date, end_date, status, poste_id, grade",
    )
    .eq("affectation_principale", true)
    .in("status", [...PAYROLL_CONTRACT_STATUSES, "ENDED"]);
  if (p.site_id) contractsQuery = contractsQuery.eq("site_id", p.site_id);
  const { data: contractRows, error: cErr } = await contractsQuery;
  if (cErr) return { ok: false, error: cErr.message };
  const contracts = (contractRows ?? []).filter((c) =>
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

  const legends = must(
    await supabase
      .from("ref_legendes")
      .select("code, label_fr, label_ar, coefficient, counts_as_presence"),
    "Légendes",
  );

  let attQuery = supabase
    .from("hr_attendance")
    .select("employee_id, site_id, legend_code")
    .eq("status_code", "VALIDATED")
    .gte("work_date", start)
    .lte("work_date", end);
  if (p.site_id) attQuery = attQuery.eq("site_id", p.site_id);
  const att = must(await attQuery, "Pointage");

  const movementsByEmp = accumulateAttendanceMovements(
    att,
    legends as AttendanceLegend[],
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
    siteIds: [...new Set(contracts.map((c) => c.site_id))],
    employeeIds: empIds,
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

  const assignments = (
    must(
      await supabase
        .from("hr_salary_assignments")
        .select("rubrique_id, employee_id, site_id, contract_id, poste_id, amount, unit, is_active")
        .eq("is_active", true),
      "Affectations de rubriques",
    ) as PayrollAssignment[]
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

  const exceptions = (
    must(
      await supabase
        .from("hr_salary_exceptions")
        .select(
          "id, employee_id, rubrique_id, amount, unit, period_year, period_month, duration_mode, until_year, until_month, status_code, is_active",
        )
        .eq("is_active", true)
        .eq("status_code", "APPROVED"),
      "Exceptions",
    ) as PayrollException[]
  ).map((e) => ({ ...e, amount: num(e.amount) }));

  const contractIds = contracts.map((c) => c.id);
  const salaryVersions = contractIds.length
    ? (
        must(
          await supabase
            .from("hr_contract_salary_history")
            .select("contract_id, effective_from, salaire_base_monthly, salaire_net_ref_monthly")
            .in("contract_id", contractIds),
          "Historique des salaires",
        ) as SalaryVersion[]
      ).map((v) => ({
        ...v,
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
  const monthlyHours = legalVar("HEURES_MENSUELLES") || 173.33;
  const overtimeSpecs: OvertimeSpec[] = OVERTIME_COLUMNS.map((c) => {
    const rate = legalVars[c.rateKey] == null ? c.defaultRate : legalVar(c.rateKey);
    const pct = Math.round(rate * 100);
    return {
      code: c.code,
      rate,
      label_fr: `Heures supplémentaires ${pct} %`,
      label_ar: `ساعات إضافية ${pct}%`,
    };
  });

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
      if (!slip || slip.run_id === run.id) continue;
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
  const calendarDays = endDay;
  const slipPayloads: Array<{
    row: Record<string, unknown>;
    lines: ReturnType<typeof buildPayrollLines>;
    employee_id: string;
  }> = [];

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
    const mov = movementsByEmp.get(ctr.employee_id) ?? emptyMovements();
    const taxpayer = irgCat.get(ctr.employee_id) ?? "STANDARD";
    const resolved = resolveCompliance({
      overrides: cx.overridesByContract.get(ctr.id) ?? [],
      periodStart: start,
      periodEnd: end,
      employeeIrgCategory: taxpayer,
      socialProfileCode: cx.socialProfile.get(ctr.employee_id) ?? null,
      siteZoneCode: cx.siteZone.get(ctr.site_id)?.code ?? DEFAULT_IRG_ZONE,
      activity: {
        cacobatph: cacoSites.has(ctr.activity_code_id),
        intemperies: intempSites.has(ctr.activity_code_id),
      },
      vars: legalVars,
      zones: cx.zones,
      regimes: cx.regimes,
    });
    const fundLeave = resolved.cacobatph.conges ? (annualLeaveByEmp.get(ctr.employee_id) ?? 0) : 0;
    if (fundLeave > 0) {
      warnings.push(
        `${empById.get(ctr.employee_id)?.matricule ?? "—"} : ${fundLeave} j de congé annuel payés par la CACOBATPH, exclus du bulletin · أيام العطلة يدفعها الصندوق`,
      );
    }
    const paid = Math.min(Math.max(0, mov.days_paid - fundLeave), group.coveredDays);
    const worked = Math.min(mov.days_presence_qty, group.coveredDays);
    const monthFraction = paidMonthFraction({
      daysPaid: paid,
      coveredDays: group.coveredDays,
      calendarDays,
      divisor,
    });
    if (group.contractCount > 1) {
      warnings.push(
        `${empById.get(ctr.employee_id)?.matricule ?? "—"} : ${group.contractCount} contrats principaux ce mois, bulletin sur le plus récent · عقدان رئيسيان في نفس الشهر`,
      );
    }
    if (mov.days_paid > group.coveredDays) {
      warnings.push(
        `${empById.get(ctr.employee_id)?.matricule ?? "—"} : ${mov.days_paid} jours pointés > ${group.coveredDays} jours de contrat, plafonnés · أيام الحضور تتجاوز مدة العقد`,
      );
    }
    const salary = salaryAsOf(salaryVersions, ctr.id, end, {
      base: num(ctr.salaire_base_monthly),
      net: num(ctr.salaire_net_ref_monthly),
    });
    const gridRow = gridAsOf(grid, ctr.poste_id, ctr.grade, end);
    if (gridRow && salary.base > 0 && salary.base < gridRow.base_monthly) {
      warnings.push(
        `${empById.get(ctr.employee_id)?.matricule ?? "—"} : salaire de base ${salary.base.toFixed(2)} < grille ${gridRow.base_monthly.toFixed(2)} (grade ${gridRow.grade}) · الأجر أقل من الشبكة`,
      );
    }
    let lines = buildPayrollLines({
      employeeId: ctr.employee_id,
      siteId: ctr.site_id,
      contractId: ctr.id,
      posteId: ctr.poste_id,
      baseMonthly: salary.base,
      daysPaid: paid,
      daysWorked: worked,
      monthFraction,
      year: p.period_year,
      month: p.period_month,
      rubriques,
      assignments,
      exceptions,
      extraLines: [
        ...overtimeLines({
          hours: hoursByEmp.get(ctr.employee_id) ?? {},
          baseMonthly: salary.base,
          monthlyHours,
          specs: overtimeSpecs,
        }),
        ...exitSettlementLines(exitByEmp.get(ctr.employee_id) ?? []),
      ],
    });
    const legal: Omit<LegalPayrollRates, "irgAmount"> = {
      cnasEmployee: resolved.cnas.employee,
      cnasEmployer: resolved.cnas.employer,
      cnasFos: resolved.cnas.fos,
      cacobatph: caco,
      intemperiesEmployee: intempSal,
      intemperiesEmployer: intempPat,
      appliesCacobatph: resolved.cacobatph.conges,
      appliesIntemperies: resolved.cacobatph.intemperies,
    };
    const pre = summarizeLines(lines, { ...legal, irgAmount: 0 });
    const irgAmount = computeResolvedIrg({
      irgBase: pre.irg_base,
      irg: resolved.irg,
      brackets: irgEngine.brackets,
      rulesByCategory: irgEngine.rulesByCategory,
    });
    let sum = summarizeLines(lines, { ...legal, irgAmount });
    const emp = empById.get(ctr.employee_id);
    const advance = advanceDeductionLines({
      advances,
      deductedElsewhere,
      employeeId: ctr.employee_id,
      year: p.period_year,
      month: p.period_month,
      availableNet: sum.net_payable,
      settleAll: exitByEmp.has(ctr.employee_id),
    });
    if (advance.lines.length) {
      lines = sortBySalaryClass([...lines, ...advance.lines]).map((line, index) => ({
        ...line,
        sort_order: (index + 1) * 10,
      }));
      sum = summarizeLines(lines, { ...legal, irgAmount });
    }
    if (advance.capped) {
      warnings.push(
        `${emp?.matricule ?? "—"} : retenue d'avance réduite pour garder un net ≥ 0 · اقتطاع التسبيق مخفّض`,
      );
    }
    const labels = complianceLabels(resolved, cx.zones, cx.regimes);
    warnings.push(
      ...payrollLegalWarnings({
        matricule: emp?.matricule ?? "",
        nss: emp?.nss,
        baseMonthly: salary.base,
        snmg,
        grossCotisable: sum.gross_cotisable,
      }),
    );
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
        run_id: run.id,
        employee_id: ctr.employee_id,
        hr_contract_id: ctr.id,
        days_worked: mov.days_worked,
        days_paid: paid,
        days_leave: mov.days_leave,
        days_absence: mov.days_absence,
        days_weekend: mov.days_weekend,
        days_abandon: mov.days_abandon,
        days_rappel: mov.days_rappel,
        net_target: salary.net,
        gross_amount: sum.gross_cotisable,
        employee_ss: sum.employee_ss,
        employer_ss: sum.employer_ss,
        cacobatph: sum.cacobatph,
        intemperies_employee: sum.intemperies_employee,
        intemperies_employer: sum.intemperies_employer,
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
        } satisfies PayrollLegalSnapshot,
      },
    });
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
  });
  if (saveErr) return { ok: false, error: saveErr.message };

  revalidatePath("/rh/paie");
  revalidatePath("/rh/paie/bulletins");
  revalidatePath("/rh/paie/social");
  revalidatePath("/rh/paie/fiscal");
  revalidatePath("/rh/paie/exceptions");
  return { ok: true, data: { run_id: run.id, count: slipPayloads.length, warnings } };
}

export async function refreshDraftPayroll(filter: {
  employeeId?: string;
  contractId?: string;
  siteId?: string;
  year?: number;
  month?: number;
}): Promise<ActionResult<{ count: number }>> {
  if (!filter.employeeId && !filter.contractId && !filter.siteId) {
    return { ok: true, data: { count: 0 } };
  }
  const supabase = await createClient();
  const { data: slips, error } = await supabase
    .from("hr_payroll_slips")
    .select("run_id, employee_id, hr_contract_id")
    .eq("status_code", "DRAFT");
  if (error) return { ok: false, error: error.message };
  const matched = (slips ?? []).filter((s) => {
    if (filter.employeeId && s.employee_id === filter.employeeId) return true;
    if (filter.contractId && s.hr_contract_id === filter.contractId) return true;
    return false;
  });
  let runIds = [...new Set(matched.map((s) => s.run_id))];
  if (filter.siteId) {
    let siteRunsQuery = supabase
      .from("hr_payroll_runs")
      .select("id")
      .eq("site_id", filter.siteId)
      .eq("status_code", "DRAFT");
    if (filter.year != null) siteRunsQuery = siteRunsQuery.eq("period_year", filter.year);
    if (filter.month != null) siteRunsQuery = siteRunsQuery.eq("period_month", filter.month);
    const { data: siteRuns } = await siteRunsQuery;
    runIds = [...new Set([...runIds, ...(siteRuns ?? []).map((r) => r.id)])];
  }
  if (!runIds.length) {
    // No draft run yet for this site/period: create one if year+month+site known.
    if (filter.siteId && filter.year != null && filter.month != null) {
      const period = await loadPeriodStatus(supabase, filter.siteId, filter.year, filter.month);
      if (!period.ok) return period;
      if (period.status) return { ok: true, data: { count: 0 } };
      const created = await generatePayrollRun({
        period_year: filter.year,
        period_month: filter.month,
        site_id: filter.siteId,
      });
      if (!created.ok) return created;
      return { ok: true, data: { count: created.data.count } };
    }
    return { ok: true, data: { count: 0 } };
  }
  const { data: runs, error: rErr } = await supabase
    .from("hr_payroll_runs")
    .select("period_year, period_month, site_id")
    .in("id", runIds);
  if (rErr) return { ok: false, error: rErr.message };
  const seen = new Set<string>();
  let count = 0;
  for (const run of runs ?? []) {
    if (filter.year != null && run.period_year !== filter.year) continue;
    if (filter.month != null && run.period_month !== filter.month) continue;
    const key = `${run.period_year}-${run.period_month}-${run.site_id ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const result = await generatePayrollRun({
      period_year: run.period_year,
      period_month: run.period_month,
      site_id: filter.siteId ?? run.site_id,
    });
    if (!result.ok) return result;
    count += result.data.count;
  }
  return { ok: true, data: { count } };
}

export async function listPayrollSlips(input: {
  year: number;
  month: number;
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
      "id, run_id, employee_id, hr_contract_id, days_worked, days_paid, days_leave, days_absence, days_weekend, days_abandon, days_rappel, net_target, gross_amount, employee_ss, employer_ss, cacobatph, intemperies_employee, intemperies_employer, irg_base, irg_amount, net_payable, status_code, legal_snapshot, employee:hr_employees ( matricule, last_name, first_name, nss, birth_date, hired_at )",
    )
    .in("run_id", runIds);
  if (error) return { ok: false, error: error.message };

  const slipIds = (data ?? []).map((row) => row.id);
  const linesQuery = slipIds.length
    ? await supabase
        .from("hr_payroll_slip_lines")
        .select(
          "id, slip_id, source_code, code, label_ar, label_fr, category, nature, unit, cotisable, taxable, quantity, unit_amount, amount, sort_order",
        )
        .in("slip_id", slipIds)
        .order("sort_order")
    : { data: [] as Array<{
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
      }>, error: null };
  if (linesQuery.error) return { ok: false, error: linesQuery.error.message };
  const lineRows = linesQuery.data ?? [];
  const linesBySlip = new Map<string, PayrollSlipLineRow[]>();
  for (const line of lineRows ?? []) {
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

  const runMap = new Map((runs ?? []).map((r) => [r.id, r]));
  const empIds = [...new Set((data ?? []).map((row) => row.employee_id))];
  const contractIds = [...new Set((data ?? []).map((row) => row.hr_contract_id).filter(Boolean))] as string[];
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
        net_target: num(row.net_target),
        gross_amount: num(row.gross_amount),
        employee_ss: num(row.employee_ss),
        employer_ss: num(row.employer_ss),
        cacobatph: num(row.cacobatph),
        intemperies_employee: num(row.intemperies_employee),
        intemperies_employer: num(row.intemperies_employer),
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
        lines: linesBySlip.get(row.id) ?? [],
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
}): Promise<ActionResult<{ runs: PayrollRunRow[]; can_validate: boolean; can_close: boolean }>> {
  const supabase = await createClient();
  const [{ data, error }, perms] = await Promise.all([
    supabase
      .from("hr_payroll_runs")
      .select("id, period_year, period_month, site_id, status_code, validated_at, locked_at")
      .eq("period_year", input.year)
      .eq("period_month", input.month),
    payrollRunPermissions(),
  ]);
  if (error) return { ok: false, error: error.message };
  const runIds = (data ?? []).map((r) => r.id);
  const { data: slipRows, error: slipErr } = runIds.length
    ? await supabase.from("hr_payroll_slips").select("run_id").in("run_id", runIds)
    : { data: [] as { run_id: string }[], error: null };
  if (slipErr) return { ok: false, error: slipErr.message };
  const counts = new Map<string, number>();
  for (const s of slipRows ?? []) counts.set(s.run_id, (counts.get(s.run_id) ?? 0) + 1);
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
      })),
      can_validate: perms.canValidate,
      can_close: perms.canClose,
    },
  };
}

async function transitionPayrollRun(
  input: unknown,
  action: PayrollRunAction,
): Promise<ActionResult<{ id: string; status_code: PayrollRunStatus }>> {
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
    .select("id, status_code")
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
  revalidatePath("/rh/paie");
  revalidatePath("/rh/paie/bulletins");
  revalidatePath("/rh/paie/social");
  revalidatePath("/rh/paie/fiscal");
  revalidatePath("/rh/presence");
  return {
    ok: true,
    data: { id: run.id, status_code: normalizeRunStatus(typeof status === "string" ? status : plan.to) },
  };
}

export async function validatePayrollRun(
  input: unknown,
): Promise<ActionResult<{ id: string; status_code: PayrollRunStatus }>> {
  return transitionPayrollRun(input, "validate");
}

export async function reopenPayrollRun(
  input: unknown,
): Promise<ActionResult<{ id: string; status_code: PayrollRunStatus }>> {
  return transitionPayrollRun(input, "reopen");
}

export async function closePayrollRun(
  input: unknown,
): Promise<ActionResult<{ id: string; status_code: PayrollRunStatus }>> {
  return transitionPayrollRun(input, "close");
}
