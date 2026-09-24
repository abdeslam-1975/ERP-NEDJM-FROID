"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { attendanceSaveSchema, payrollGenerateSchema, payrollLockSchema } from "@/lib/validations/hr";
import {
  buildPayrollLines,
  contractCoversPeriod,
  PAYROLL_CONTRACT_STATUSES,
  payrollLegalWarnings,
  summarizeLines,
  type LegalPayrollRates,
  type PayrollAssignment,
  type PayrollException,
  type PayrollRubrique,
} from "@/lib/hr/payroll-calc";
import { computeMonthlyIrg, type IrgBracket, type IrgRule } from "@/lib/hr/irg-calc";
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
  lines: PayrollSlipLineRow[];
};

function num(v: unknown) {
  return Number(v ?? 0);
}

export async function listAttendanceMonth(input: {
  site_id: string;
  year: number;
  month: number;
}): Promise<ActionResult<{ cells: AttendanceCell[]; loaded_at: string }>> {
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
  return { ok: true, data: { cells, loaded_at: loadedAt } };
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const start = `${p.year}-${String(p.month).padStart(2, "0")}-01`;
  const endDate = new Date(p.year, p.month, 0).getDate();
  const end = `${p.year}-${String(p.month).padStart(2, "0")}-${String(endDate).padStart(2, "0")}`;
  let del = supabase
    .from("hr_attendance")
    .delete()
    .eq("site_id", p.site_id)
    .gte("work_date", start)
    .lte("work_date", end);
  if (p.employee_id) del = del.eq("employee_id", p.employee_id);
  if (p.loaded_at) del = del.or(`status_code.eq.VALIDATED,updated_at.lte."${p.loaded_at}"`);
  const { error: delErr } = await del;
  if (delErr) return { ok: false, error: delErr.message };
  if (p.cells.length) {
    const validatedAt = new Date().toISOString();
    const rows = p.cells.map((cell) => ({
      employee_id: cell.employee_id,
      site_id: cell.site_id,
      work_date: cell.work_date,
      legend_code: cell.legend_code,
      source_code: cell.source_code,
      correspondence_id: cell.source_code === "MANUAL" ? null : (cell.correspondence_id ?? null),
      status_code: "VALIDATED",
      validated_at: validatedAt,
      validated_by: user?.id ?? null,
    }));
    const { error } = await supabase
      .from("hr_attendance")
      .upsert(rows, { onConflict: "employee_id,site_id,work_date" });
    if (error) return { ok: false, error: error.message };
  }
  const refreshed = await refreshDraftPayroll({
    siteId: p.site_id,
    employeeId: p.employee_id ?? undefined,
    year: p.year,
    month: p.month,
  });
  if (!refreshed.ok) return refreshed;
  revalidatePath("/rh/presence");
  revalidatePath("/rh/paie");
  revalidatePath("/rh/paie/bulletins");
  revalidatePath("/rh/paie/social");
  revalidatePath("/rh/paie/fiscal");
  return {
    ok: true,
    data: { count: p.cells.length, refreshed_slips: refreshed.data.count },
  };
}

async function currentVar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  key: string,
): Promise<number> {
  const { data: row } = await supabase
    .from("ref_global_vars")
    .select("id")
    .eq("key", key)
    .maybeSingle();
  if (!row) return 0;
  const { data: ver } = await supabase
    .from("ref_global_var_versions")
    .select("value_numeric")
    .eq("var_id", row.id)
    .lte("effective_from", new Date().toISOString().slice(0, 10))
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  return num(ver?.value_numeric);
}

type IrgEngine = {
  brackets: IrgBracket[];
  rulesByCategory: Record<string, IrgRule[]>;
};

async function loadIrgEngine(
  supabase: Awaited<ReturnType<typeof createClient>>,
  asOf: string,
): Promise<IrgEngine> {
  const { data: versions } = await supabase
    .from("ref_bareme_irg_versions")
    .select("id, effective_from, effective_to")
    .lte("effective_from", asOf)
    .order("effective_from", { ascending: false });
  const version = (versions ?? []).find(
    (v) => !v.effective_to || v.effective_to >= asOf,
  );
  let brackets: IrgBracket[] = [];
  if (version) {
    const { data: rows } = await supabase
      .from("ref_bareme_irg")
      .select("min_annual, max_annual, rate, sort_order")
      .eq("version_id", version.id)
      .order("sort_order");
    brackets = (rows ?? []).map((r) => ({
      min_annual: num(r.min_annual),
      max_annual: r.max_annual == null ? null : num(r.max_annual),
      rate: num(r.rate),
    }));
  }
  const { data: sets } = await supabase
    .from("ref_irg_rule_sets")
    .select("id, taxpayer_category, effective_from, effective_to")
    .lte("effective_from", asOf)
    .order("effective_from", { ascending: false });
  const chosen = new Map<string, string>();
  for (const s of sets ?? []) {
    if (s.effective_to && s.effective_to < asOf) continue;
    if (!chosen.has(s.taxpayer_category)) chosen.set(s.taxpayer_category, s.id);
  }
  const setIds = [...chosen.values()];
  const rulesByCategory: Record<string, IrgRule[]> = {};
  if (setIds.length) {
    const { data: rules } = await supabase
      .from("ref_irg_rules")
      .select("rule_set_id, kind, params, formula, sequence")
      .in("rule_set_id", setIds)
      .order("sequence");
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
  return { brackets, rulesByCategory };
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

  const start = `${p.period_year}-${String(p.period_month).padStart(2, "0")}-01`;
  const endDay = new Date(p.period_year, p.period_month, 0).getDate();
  const end = `${p.period_year}-${String(p.period_month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

  const { data: run, error: runErr } = await supabase
    .from("hr_payroll_runs")
    .upsert(
      {
        period_year: p.period_year,
        period_month: p.period_month,
        site_id: p.site_id ?? null,
        status_code: "DRAFT",
        created_by: user?.id ?? null,
      },
      { onConflict: "period_year,period_month,site_id" },
    )
    .select("id")
    .maybeSingle();
  if (runErr || !run) return { ok: false, error: runErr?.message ?? "Run refusé." };

  const [cnasEmp, cnasPat, cnasFos, caco, intempSal, intempPat, divisorVar, snmg] = await Promise.all([
    currentVar(supabase, "CNAS_EMPLOYEE"),
    currentVar(supabase, "CNAS_EMPLOYER_BASE"),
    currentVar(supabase, "CNAS_FOS"),
    currentVar(supabase, "CACOBATPH_CONGES"),
    currentVar(supabase, "CACOBATPH_INTEMPERIES_SAL"),
    currentVar(supabase, "CACOBATPH_INTEMPERIES_EMP"),
    currentVar(supabase, "NJM_DIVISEUR_FIXED"),
    currentVar(supabase, "SNMG"),
  ]);
  const divisor = divisorVar > 0 ? divisorVar : 30;
  const irgEngine = await loadIrgEngine(supabase, start);

  let contractsQuery = supabase
    .from("hr_contracts")
    .select(
      "id, employee_id, site_id, salaire_net_ref_monthly, salaire_base_monthly, activity_code_id, start_date, end_date, status",
    )
    .eq("affectation_principale", true)
    .in("status", [...PAYROLL_CONTRACT_STATUSES]);
  if (p.site_id) contractsQuery = contractsQuery.eq("site_id", p.site_id);
  const { data: contractRows, error: cErr } = await contractsQuery;
  if (cErr) return { ok: false, error: cErr.message };
  const contracts = (contractRows ?? []).filter((c) =>
    contractCoversPeriod(
      String(c.start_date).slice(0, 10),
      c.end_date ? String(c.end_date).slice(0, 10) : null,
      start,
      end,
    ),
  );

  const { data: legends } = await supabase
    .from("ref_legendes")
    .select("code, label_fr, label_ar, coefficient, counts_as_presence");

  let attQuery = supabase
    .from("hr_attendance")
    .select("employee_id, site_id, legend_code")
    .eq("status_code", "VALIDATED")
    .gte("work_date", start)
    .lte("work_date", end);
  if (p.site_id) attQuery = attQuery.eq("site_id", p.site_id);
  const { data: att } = await attQuery;

  const movementsByEmp = accumulateAttendanceMovements(
    att ?? [],
    (legends ?? []) as AttendanceLegend[],
    p.site_id ? { siteId: p.site_id } : undefined,
  );

  const { data: activities } = await supabase
    .from("ref_activity_codes")
    .select("id, applies_cacobatph, applies_intemperies");
  const cacoSites = new Set(
    (activities ?? []).filter((a) => a.applies_cacobatph).map((a) => a.id),
  );
  const intempSites = new Set(
    (activities ?? []).filter((a) => a.applies_intemperies).map((a) => a.id),
  );

  const empIds = [...new Set((contracts ?? []).map((c) => c.employee_id))];
  const { data: employees } = empIds.length
    ? await supabase
        .from("hr_employees")
        .select("id, irg_category, nss, matricule")
        .in("id", empIds)
    : { data: [] as { id: string; irg_category: string; nss: string | null; matricule: string }[] };
  const irgCat = new Map(
    (employees ?? []).map((e) => [e.id, e.irg_category ?? "STANDARD"]),
  );
  const empById = new Map((employees ?? []).map((e) => [e.id, e]));

  const { data: rubRows } = await supabase
    .from("hr_salary_rubriques")
    .select(
      "id, code, label_ar, label_fr, nature, unit, category, cotisable, taxable, is_active",
    )
    .eq("is_active", true);
  const rubriques = (rubRows ?? []) as PayrollRubrique[];

  const { data: asgRows } = await supabase
    .from("hr_salary_assignments")
    .select("rubrique_id, employee_id, site_id, contract_id, amount, unit, is_active")
    .eq("is_active", true);
  const assignments = ((asgRows ?? []) as PayrollAssignment[]).map((a) => ({
    ...a,
    amount: num(a.amount),
  }));

  const { data: exRows } = await supabase
    .from("hr_salary_exceptions")
    .select(
      "id, employee_id, rubrique_id, amount, unit, period_year, period_month, duration_mode, until_year, until_month, status_code, is_active",
    )
    .eq("is_active", true)
    .eq("status_code", "APPROVED");
  const exceptions = ((exRows ?? []) as PayrollException[]).map((e) => ({
    ...e,
    amount: num(e.amount),
  }));

  const { data: existingSlips } = await supabase
    .from("hr_payroll_slips")
    .select("id, employee_id, status_code")
    .eq("run_id", run.id);
  const locked = new Set(
    (existingSlips ?? []).filter((s) => s.status_code === "LOCKED").map((s) => s.employee_id),
  );

  const warnings: string[] = [];
  const slipPayloads: Array<{
    row: Record<string, unknown>;
    lines: ReturnType<typeof buildPayrollLines>;
    employee_id: string;
  }> = [];

  for (const ctr of contracts ?? []) {
    if (locked.has(ctr.employee_id)) continue;
    const mov = movementsByEmp.get(ctr.employee_id) ?? emptyMovements();
    const paid = mov.days_paid;
    const worked = mov.days_presence_qty;
    const lines = buildPayrollLines({
      employeeId: ctr.employee_id,
      siteId: ctr.site_id,
      contractId: ctr.id,
      baseMonthly: num(ctr.salaire_base_monthly),
      daysPaid: paid,
      daysWorked: worked,
      divisor,
      year: p.period_year,
      month: p.period_month,
      rubriques,
      assignments,
      exceptions,
    });
    const taxpayer = irgCat.get(ctr.employee_id) ?? "STANDARD";
    const legal: Omit<LegalPayrollRates, "irgAmount"> = {
      cnasEmployee: cnasEmp,
      cnasEmployer: cnasPat,
      cnasFos,
      cacobatph: caco,
      intemperiesEmployee: intempSal,
      intemperiesEmployer: intempPat,
      appliesCacobatph: cacoSites.has(ctr.activity_code_id),
      appliesIntemperies: intempSites.has(ctr.activity_code_id),
    };
    const pre = summarizeLines(lines, { ...legal, irgAmount: 0 });
    const irgAmount = computeMonthlyIrg({
      irgBaseMonthly: pre.irg_base,
      brackets: irgEngine.brackets,
      rules: irgEngine.rulesByCategory[taxpayer] ?? irgEngine.rulesByCategory.STANDARD ?? [],
    });
    const sum = summarizeLines(lines, { ...legal, irgAmount });
    const emp = empById.get(ctr.employee_id);
    warnings.push(
      ...payrollLegalWarnings({
        matricule: emp?.matricule ?? "",
        nss: emp?.nss,
        baseMonthly: num(ctr.salaire_base_monthly),
        snmg,
        grossCotisable: sum.gross_cotisable,
      }),
    );
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
        net_target: num(ctr.salaire_net_ref_monthly),
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
      },
    });
  }

  if (slipPayloads.length) {
    const { data: saved, error: sErr } = await supabase
      .from("hr_payroll_slips")
      .upsert(
        slipPayloads.map((s) => s.row),
        { onConflict: "run_id,employee_id" },
      )
      .select("id, employee_id");
    if (sErr) return { ok: false, error: sErr.message };
    const slipIdByEmp = new Map((saved ?? []).map((s) => [s.employee_id, s.id]));
    const slipIds = [...slipIdByEmp.values()];
    if (slipIds.length) {
      const { error: delLinesErr } = await supabase
        .from("hr_payroll_slip_lines")
        .delete()
        .in("slip_id", slipIds);
      if (delLinesErr) return { ok: false, error: delLinesErr.message };
    }
    const lineRows = slipPayloads.flatMap((s) => {
      const slipId = slipIdByEmp.get(s.employee_id);
      if (!slipId) return [];
      return s.lines.map((line) => ({
        slip_id: slipId,
        rubrique_id: line.rubrique_id,
        exception_id: line.exception_id,
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
      }));
    });
    if (lineRows.length) {
      const { error: lErr } = await supabase.from("hr_payroll_slip_lines").insert(lineRows);
      if (lErr) return { ok: false, error: lErr.message };
    }
  }

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
      "id, run_id, employee_id, hr_contract_id, days_worked, days_paid, days_leave, days_absence, days_weekend, days_abandon, days_rappel, net_target, gross_amount, employee_ss, employer_ss, cacobatph, intemperies_employee, intemperies_employer, irg_base, irg_amount, net_payable, status_code, employee:hr_employees ( matricule, last_name, first_name, nss, birth_date, hired_at )",
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
  const lineRows = linesQuery.error ? [] : (linesQuery.data ?? []);
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
          .select("employee_id, payment_mode_code, account_no")
          .in("employee_id", empIds)
      : { data: [] as Array<{ employee_id: string; payment_mode_code: string | null; account_no: string | null }> },
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
  const endDay = new Date(input.year, input.month, 0).getDate();
  const end = `${input.year}-${String(input.month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
  const [{ data: legendRows }, { data: attRows }] = await Promise.all([
    supabase
      .from("ref_legendes")
      .select("code, label_fr, label_ar, coefficient, counts_as_presence"),
    empIds.length
      ? supabase
          .from("hr_attendance")
          .select("employee_id, site_id, legend_code")
          .eq("status_code", "VALIDATED")
          .in("employee_id", empIds)
          .gte("work_date", start)
          .lte("work_date", end)
      : Promise.resolve({ data: [] as Array<{ employee_id: string; site_id: string; legend_code: string }> }),
  ]);

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
      const mov =
        accumulateAttendanceMovements(
          attRows ?? [],
          (legendRows ?? []) as AttendanceLegend[],
          siteId ? { siteId } : undefined,
        ).get(row.employee_id) ?? emptyMovements();
      return {
        id: row.id,
        run_id: row.run_id,
        employee_id: row.employee_id,
        period_year: run?.period_year ?? input.year,
        period_month: run?.period_month ?? input.month,
        site_id: siteId,
        hr_contract_id: row.hr_contract_id ?? null,
        days_worked: mov.days_worked,
        days_paid: num(row.days_paid) || mov.days_paid,
        days_leave: mov.days_leave,
        days_absence: mov.days_absence,
        days_weekend: mov.days_weekend,
        days_abandon: mov.days_abandon,
        days_rappel: mov.days_rappel,
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
        lines: linesBySlip.get(row.id) ?? [],
      };
    }),
  };
}

export async function lockPayrollSlip(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = payrollLockSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_payroll_slips")
    .update({ status_code: "LOCKED", locked_at: new Date().toISOString() })
    .eq("id", parsed.data.slip_id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Verrouillage refusé." };
  revalidatePath("/rh/paie");
  revalidatePath("/rh/paie/bulletins");
  return { ok: true, data: { id: data.id } };
}
