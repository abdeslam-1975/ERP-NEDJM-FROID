import type { createClient } from "@/lib/supabase/server";
import {
  accumulateAttendanceMovements,
  emptyMovements,
  type AttendanceLegend,
  type AttendanceMovements,
} from "@/lib/hr/attendance-movements";
import { OVERTIME_COLUMNS } from "@/lib/hr/attendance-columns";
import {
  DEFAULT_IRG_ZONE,
  resolveCompliance,
  type CnasRegime,
  type ComplianceOverride,
  type IrgZone,
  type ResolvedCompliance,
} from "@/lib/hr/compliance";
import { loadComplianceContext } from "@/lib/hr/compliance-load";
import type { ContributionDef } from "@/lib/hr/contributions";
import type { IrgBracket, IrgRule } from "@/lib/hr/irg-calc";
import { loadIrgEngine } from "@/lib/hr/irg-engine-load";
import { normalizeSettlementLines, type SettlementLine } from "@/lib/hr/leave";
import { legalVarsAsOf, loadContributionDefs } from "@/lib/hr/legal-vars-as-of";
import {
  contractPayableInPeriod,
  coveredDaysInPeriod,
  exceptionAppliesToPeriod,
  groupContractsByEmployee,
  PAYROLL_CONTRACT_STATUSES,
  resolvePermanentAssignment,
  salaryAsOf,
  type PayrollAdvance,
  type PayrollAssignment,
  type PayrollException,
  type PayrollRubrique,
  type SalaryGridRow,
  type SalaryUnit,
  type SalaryVersion,
} from "@/lib/hr/payroll-calc";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const ANNUAL_LEAVE_LEGEND = "CA";

function num(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function day(v: unknown) {
  return v ? String(v).slice(0, 10) : null;
}

export type SimEmployeeOption = { id: string; matricule: string; name: string };

/** A permanent rubrique resolved for the contract (employee > contract > poste > site). */
export type SimRubricLine = {
  rubrique_id: string;
  amount: number;
  unit: SalaryUnit;
  source: "site" | "contract" | "employee" | "poste" | "added";
};

export type SimException = { id: string; rubrique_id: string; amount: number; unit: SalaryUnit | null };

export type SimContractField = { label: string; value: string };

export type SimAttendanceCell = { work_date: string; legend_code: string; site_id: string | null };

export type SimSubject = {
  employee: {
    id: string;
    matricule: string;
    name: string;
    nss: string | null;
    irg_category: string;
    birth_date: string | null;
    hired_at: string | null;
    marital_code: string | null;
    address_fr: string | null;
    commune: string | null;
    payment_mode_code: string | null;
    account_no: string | null;
    account_key?: string | null;
  };
  contract: {
    id: string;
    site_id: string;
    site_name: string;
    poste_id: string | null;
    poste_fr: string | null;
    grade: string | null;
    qualification_code: string | null;
    start_date: string;
    end_date: string | null;
    status: string;
    salaire_base_monthly: number;
    salaire_net_ref_monthly: number;
    salaire_net_recup_monthly: number | null;
  };
  /** Every other field of the work contract, for display. */
  contract_fields: SimContractField[];
  contract_payable: boolean;
  covered_days: number;
  contract_count: number;
  /** Validated pointage cells of the month (all sites), as used by the payroll run. */
  attendance_days: SimAttendanceCell[];
  movements: AttendanceMovements;
  annual_leave_days: number;
  salary: { base: number; net: number };
  salary_versions: SalaryVersion[];
  site_zone: { code: string; source: string };
  social_profile_code: string | null;
  activity: { label: string; cacobatph: boolean; intemperies: boolean };
  compliance: ResolvedCompliance;
  overrides: ComplianceOverride[];
  rubric_lines: SimRubricLine[];
  exceptions: SimException[];
  overtime_hours: Record<string, number>;
  exit_lines: SettlementLine[] | null;
  advances: PayrollAdvance[];
  deducted_elsewhere: Record<string, number>;
  stored_slip: {
    status: string;
    gross_amount: number;
    employee_ss: number;
    irg_amount: number;
    net_payable: number;
  } | null;
};

export type SimulatorData = {
  year: number;
  month: number;
  legal_vars: Record<string, number>;
  brackets: IrgBracket[];
  rules_by_category: Record<string, IrgRule[]>;
  contribution_defs: ContributionDef[];
  rubriques: PayrollRubrique[];
  grid: SalaryGridRow[];
  zones: IrgZone[];
  regimes: CnasRegime[];
  legends: AttendanceLegend[];
  employees: SimEmployeeOption[];
  subject: SimSubject | null;
  notice: string | null;
};

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what} : ${res.error.message}`);
  return (res.data ?? []) as T;
}

/** Read-only inputs of the payslip simulator: period engine, plus one employee when asked. */
export async function loadPayrollSimulator(
  supabase: Supabase,
  input: { year: number; month: number; employeeId: string | null },
): Promise<Result<SimulatorData>> {
  try {
    return await load(supabase, input);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Chargement du simulateur impossible." };
  }
}

async function load(
  supabase: Supabase,
  input: { year: number; month: number; employeeId: string | null },
): Promise<Result<SimulatorData>> {
  const mm = String(input.month).padStart(2, "0");
  const start = `${input.year}-${mm}-01`;
  const endDay = new Date(input.year, input.month, 0).getDate();
  const end = `${input.year}-${mm}-${String(endDay).padStart(2, "0")}`;

  const [legalVars, irgLoaded, contribLoaded] = await Promise.all([
    legalVarsAsOf(supabase, start),
    loadIrgEngine(supabase, start),
    loadContributionDefs(supabase, start),
  ]);
  if (!irgLoaded.ok) return irgLoaded;
  if (!contribLoaded.ok) return contribLoaded;

  const [rubriqueRows, gridRows, employeeRows, baseCompliance, legendRows] = await Promise.all([
    supabase
      .from("hr_salary_rubriques")
      .select("id, code, label_ar, label_fr, nature, unit, category, cotisable, taxable, is_active")
      .eq("is_active", true),
    supabase.from("hr_salary_grid").select("poste_id, grade, base_monthly, net_ref_monthly, effective_from"),
    supabase.from("hr_employees").select("id, matricule, last_name, first_name").order("matricule"),
    loadComplianceContext(supabase, { contractIds: [], siteIds: [], employeeIds: [], asOf: start }),
    supabase.from("ref_legendes").select("code, label_fr, label_ar, coefficient, counts_as_presence"),
  ]);
  const rubriques = must(rubriqueRows, "Rubriques") as PayrollRubrique[];
  const legendList = (must(legendRows, "Légendes") as AttendanceLegend[]).map((l) => ({
    ...l,
    coefficient: num(l.coefficient),
  }));
  const grid = (must(gridRows, "Grille salariale") as SalaryGridRow[]).map((g) => ({
    ...g,
    base_monthly: num(g.base_monthly),
    net_ref_monthly: g.net_ref_monthly == null ? null : num(g.net_ref_monthly),
    effective_from: String(g.effective_from).slice(0, 10),
  }));
  const employees = (
    must(employeeRows, "Employés") as { id: string; matricule: string; last_name: string; first_name: string }[]
  ).map((e) => ({ id: e.id, matricule: e.matricule, name: `${e.last_name} ${e.first_name}`.trim() }));
  if (!baseCompliance.ok) return baseCompliance;

  const data: SimulatorData = {
    year: input.year,
    month: input.month,
    legal_vars: legalVars,
    brackets: irgLoaded.data.brackets,
    rules_by_category: irgLoaded.data.rulesByCategory,
    contribution_defs: contribLoaded.data,
    rubriques,
    grid,
    zones: baseCompliance.data.zones,
    regimes: baseCompliance.data.regimes,
    legends: legendList,
    employees,
    subject: null,
    notice: null,
  };
  if (!input.employeeId) return { ok: true, data };

  const empId = input.employeeId;
  const contractCols =
    "id, employee_id, site_id, activity_code_id, qualification_code, affectation_principale, salaire_base_monthly, salaire_net_ref_monthly, salaire_net_recup_monthly, currency, start_date, end_date, status, contract_type_code, work_regime_code, poste_ar, poste_fr, poste_id, grade, contract_number, print_data, agency_id, interim_daily_rate, cnas_regime_code, created_at, updated_at";
  const contractRows = must(
    await supabase.from("hr_contracts").select(contractCols).eq("employee_id", empId).order("start_date", { ascending: false }),
    "Contrats",
  ) as Record<string, unknown>[];
  if (!contractRows.length) {
    return { ok: true, data: { ...data, notice: "Aucun contrat de travail pour ce salarié." } };
  }
  const principal = contractRows.filter(
    (c) =>
      c.affectation_principale === true &&
      c.contract_type_code !== "INTERIM" &&
      [...PAYROLL_CONTRACT_STATUSES, "ENDED"].includes(String(c.status)),
  );
  const payable = principal.filter((c) =>
    contractPayableInPeriod(
      { status: String(c.status), start_date: String(c.start_date), end_date: day(c.end_date) },
      start,
      end,
    ),
  );
  const grouped = groupContractsByEmployee(
    payable.map((c) => ({
      ...c,
      id: String(c.id),
      employee_id: empId,
      start_date: String(c.start_date).slice(0, 10),
      end_date: day(c.end_date),
    })),
    start,
    end,
  )[0];
  const ctr = (grouped?.contract ?? principal[0] ?? contractRows[0]) as Record<string, unknown>;
  const ctrId = String(ctr.id);
  const siteId = String(ctr.site_id);
  const notice = grouped
    ? null
    : "Aucun contrat principal payable sur la période : simulation sur le contrat le plus récent.";

  const [
    empRow,
    civil,
    contacts,
    bank,
    compliance,
    attendance,
    activity,
    site,
    assignments,
    exceptions,
    versions,
    sheet,
    advances,
    exits,
    runs,
    catalogs,
    poste,
    agency,
  ] = await Promise.all([
    supabase.from("hr_employees").select("id, matricule, last_name, first_name, nss, irg_category, birth_date, hired_at").eq("id", empId).maybeSingle(),
    supabase.from("hr_employee_civil").select("marital_code").eq("employee_id", empId).maybeSingle(),
    supabase.from("hr_employee_contacts").select("address_fr, commune").eq("employee_id", empId).maybeSingle(),
    supabase.from("hr_employee_bank").select("payment_mode_code, account_no, account_key").eq("employee_id", empId).maybeSingle(),
    loadComplianceContext(supabase, { contractIds: [ctrId], siteIds: [siteId], employeeIds: [empId], asOf: start }),
    supabase
      .from("hr_attendance")
      .select("employee_id, site_id, legend_code, work_date")
      .eq("status_code", "VALIDATED")
      .eq("employee_id", empId)
      .gte("work_date", start)
      .lte("work_date", end)
      .order("work_date"),
    supabase.from("ref_activity_codes").select("code, label_fr, applies_cacobatph, applies_intemperies").eq("id", String(ctr.activity_code_id)).maybeSingle(),
    supabase.from("ref_sites").select("name_fr").eq("id", siteId).maybeSingle(),
    supabase
      .from("hr_salary_assignments")
      .select("rubrique_id, employee_id, site_id, contract_id, poste_id, amount, unit, is_active")
      .eq("is_active", true)
      .or(`employee_id.eq.${empId},employee_id.is.null`),
    supabase
      .from("hr_salary_exceptions")
      .select("id, employee_id, rubrique_id, amount, unit, period_year, period_month, duration_mode, until_year, until_month, status_code, is_active")
      .eq("is_active", true)
      .eq("status_code", "APPROVED")
      .eq("employee_id", empId),
    supabase
      .from("hr_contract_salary_history")
      .select("contract_id, effective_from, salaire_base_monthly, salaire_net_ref_monthly")
      .eq("contract_id", ctrId),
    supabase
      .from("hr_attendance_sheet_rows")
      .select("employee_id, cell_values")
      .eq("period_year", input.year)
      .eq("period_month", input.month)
      .eq("employee_id", empId),
    supabase
      .from("hr_employee_advances")
      .select("id, employee_id, kind, principal_amount, installment_amount, start_year, start_month, status")
      .eq("status", "ACTIVE")
      .eq("employee_id", empId),
    supabase
      .from("hr_employee_exits")
      .select("employee_id, settlement_lines")
      .eq("status", "VALIDATED")
      .eq("employee_id", empId)
      .gte("exit_date", start)
      .lte("exit_date", end),
    supabase.from("hr_payroll_runs").select("id").eq("period_year", input.year).eq("period_month", input.month),
    supabase.from("hr_catalogs").select("kind, code, label_fr").in("kind", ["contract_type", "work_regime"]),
    ctr.poste_id
      ? supabase.from("hr_postes").select("code, label_fr").eq("id", String(ctr.poste_id)).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    ctr.agency_id
      ? supabase.from("hr_interim_agencies").select("name").eq("id", String(ctr.agency_id)).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  for (const [res, what] of [
    [empRow, "Employé"],
    [attendance, "Pointage"],
    [assignments, "Affectations de rubriques"],
    [exceptions, "Exceptions"],
    [versions, "Historique des salaires"],
    [sheet, "Heures supplémentaires"],
    [advances, "Avances et prêts"],
    [exits, "Sorties"],
    [runs, "Paies"],
  ] as const) {
    if (res.error) throw new Error(`${what} : ${res.error.message}`);
  }
  if (!compliance.ok) return compliance;
  const emp = empRow.data;
  if (!emp) return { ok: true, data: { ...data, notice: "Salarié introuvable." } };
  const cx = compliance.data;

  const att = attendance.data ?? [];
  const movements = accumulateAttendanceMovements(att, legendList).get(empId) ?? emptyMovements();
  const annualLeave = att.filter((c) => String(c.legend_code).toUpperCase() === ANNUAL_LEAVE_LEGEND).length;

  const act = activity.data;
  const siteZone = cx.siteZone.get(siteId) ?? { code: DEFAULT_IRG_ZONE, source: "default" as const };
  const socialProfile = cx.socialProfile.get(empId) ?? null;
  const overrides = cx.overridesByContract.get(ctrId) ?? [];
  const resolved = resolveCompliance({
    overrides,
    periodStart: start,
    periodEnd: end,
    employeeIrgCategory: emp.irg_category ?? "STANDARD",
    socialProfileCode: (ctr.cnas_regime_code as string | null) || socialProfile || null,
    siteZoneCode: siteZone.code,
    activity: { cacobatph: Boolean(act?.applies_cacobatph), intemperies: Boolean(act?.applies_intemperies) },
    vars: legalVars,
    zones: cx.zones,
    regimes: cx.regimes,
  });

  const salaryVersions = ((versions.data ?? []) as SalaryVersion[]).map((v) => ({
    ...v,
    effective_from: String(v.effective_from).slice(0, 10),
    salaire_base_monthly: num(v.salaire_base_monthly),
    salaire_net_ref_monthly: num(v.salaire_net_ref_monthly),
  }));
  const salary = salaryAsOf(salaryVersions, ctrId, end, {
    base: num(ctr.salaire_base_monthly),
    net: num(ctr.salaire_net_ref_monthly),
  });

  const asg = ((assignments.data ?? []) as PayrollAssignment[]).map((a) => ({ ...a, amount: num(a.amount) }));
  const ctx = { employeeId: empId, siteId, contractId: ctrId, posteId: (ctr.poste_id as string | null) ?? null };
  const rubricLines: SimRubricLine[] = [];
  for (const rub of rubriques) {
    const picked = resolvePermanentAssignment(rub.id, asg, ctx);
    if (!picked) continue;
    rubricLines.push({ rubrique_id: rub.id, amount: picked.amount, unit: picked.unit ?? rub.unit, source: picked.source });
  }

  const simExceptions = ((exceptions.data ?? []) as PayrollException[])
    .map((e) => ({ ...e, amount: num(e.amount) }))
    .filter((e) => exceptionAppliesToPeriod(e, input.year, input.month))
    .map((e) => ({ id: e.id, rubrique_id: e.rubrique_id, amount: e.amount, unit: e.unit ?? null }));

  const hours: Record<string, number> = {};
  for (const row of (sheet.data ?? []) as { cell_values: Record<string, unknown> | null }[]) {
    for (const col of OVERTIME_COLUMNS) {
      const h = num((row.cell_values ?? {})[col.code]);
      if (h > 0) hours[col.code] = (hours[col.code] ?? 0) + h;
    }
  }

  const adv = ((advances.data ?? []) as PayrollAdvance[]).map((a) => ({
    ...a,
    principal_amount: num(a.principal_amount),
    installment_amount: num(a.installment_amount),
  }));
  const runIds = new Set((runs.data ?? []).map((r) => r.id));
  const deducted: Record<string, number> = {};
  if (adv.length) {
    const taken = must(
      await supabase
        .from("hr_payroll_slip_lines")
        .select("advance_id, amount, slip:hr_payroll_slips!inner(run_id)")
        .in(
          "advance_id",
          adv.map((a) => a.id),
        ),
      "Retenues déjà effectuées",
    ) as unknown as { advance_id: string; amount: number; slip: { run_id: string } | { run_id: string }[] }[];
    for (const t of taken) {
      const slip = Array.isArray(t.slip) ? t.slip[0] : t.slip;
      if (!slip || runIds.has(slip.run_id)) continue;
      deducted[t.advance_id] = (deducted[t.advance_id] ?? 0) + Math.abs(num(t.amount));
    }
  }

  const exitRow = (exits.data ?? [])[0] as { settlement_lines: unknown } | undefined;

  let stored: SimSubject["stored_slip"] = null;
  if (runIds.size) {
    const { data: slip } = await supabase
      .from("hr_payroll_slips")
      .select("status_code, gross_amount, employee_ss, irg_amount, net_payable")
      .in("run_id", [...runIds])
      .eq("employee_id", empId)
      .limit(1)
      .maybeSingle();
    if (slip) {
      stored = {
        status: String(slip.status_code),
        gross_amount: num(slip.gross_amount),
        employee_ss: num(slip.employee_ss),
        irg_amount: num(slip.irg_amount),
        net_payable: num(slip.net_payable),
      };
    }
  }

  const catLabel = (kind: string, code: unknown) =>
    code ? ((catalogs.data ?? []).find((c) => c.kind === kind && c.code === code)?.label_fr ?? String(code)) : "—";
  const printData = (ctr.print_data ?? {}) as Record<string, unknown>;
  const fmtDate = (v: unknown) => day(v) ?? "—";
  const contractFields: SimContractField[] = [
    { label: "N° contrat", value: String(ctr.contract_number ?? "—") },
    { label: "Type", value: catLabel("contract_type", ctr.contract_type_code) },
    { label: "Régime de travail", value: catLabel("work_regime", ctr.work_regime_code) },
    { label: "Statut", value: String(ctr.status) },
    { label: "Affectation principale", value: ctr.affectation_principale ? "Oui" : "Non" },
    { label: "Poste (FR)", value: String(ctr.poste_fr ?? "—") },
    { label: "Poste (AR)", value: String(ctr.poste_ar ?? "—") },
    { label: "Poste référentiel", value: poste.data ? `${poste.data.code} · ${poste.data.label_fr}` : "—" },
    { label: "Grade", value: String(ctr.grade ?? "—") },
    { label: "Qualification", value: String(ctr.qualification_code ?? "—") },
    { label: "Code activité", value: act ? `${act.code} · ${act.label_fr}` : "—" },
    { label: "Régime CNAS du contrat", value: String(ctr.cnas_regime_code ?? "—") },
    { label: "Devise", value: String(ctr.currency ?? "DZD") },
    { label: "Net de référence", value: num(ctr.salaire_net_ref_monthly).toFixed(2) },
    {
      label: "Net récupération",
      value: ctr.salaire_net_recup_monthly == null ? "—" : num(ctr.salaire_net_recup_monthly).toFixed(2),
    },
    { label: "Agence intérim", value: agency.data?.name ?? "—" },
    {
      label: "Taux journalier intérim",
      value: ctr.interim_daily_rate == null ? "—" : num(ctr.interim_daily_rate).toFixed(2),
    },
    { label: "Période d'essai", value: String(printData.essai ?? "—") || "—" },
    { label: "Préavis", value: String(printData.preavis ?? "—") || "—" },
    { label: "Retenue (contrat)", value: String(printData.retenue ?? "—") || "—" },
    { label: "Créé le", value: fmtDate(ctr.created_at) },
    { label: "Modifié le", value: fmtDate(ctr.updated_at) },
  ];

  const startDate = String(ctr.start_date).slice(0, 10);
  const endDate = day(ctr.end_date);
  const subject: SimSubject = {
    employee: {
      id: emp.id,
      matricule: emp.matricule,
      name: `${emp.last_name} ${emp.first_name}`.trim(),
      nss: emp.nss ?? null,
      irg_category: emp.irg_category ?? "STANDARD",
      birth_date: day(emp.birth_date),
      hired_at: day(emp.hired_at),
      marital_code: civil.data?.marital_code ?? null,
      address_fr: contacts.data?.address_fr ?? null,
      commune: contacts.data?.commune ?? null,
      payment_mode_code: bank.data?.payment_mode_code ?? null,
      account_no: bank.data?.account_no ?? null,
      account_key: bank.data?.account_key ?? null,
    },
    contract: {
      id: ctrId,
      site_id: siteId,
      site_name: site.data?.name_fr ?? "—",
      poste_id: (ctr.poste_id as string | null) ?? null,
      poste_fr: (ctr.poste_fr as string | null) ?? null,
      grade: (ctr.grade as string | null) ?? null,
      qualification_code: (ctr.qualification_code as string | null) ?? null,
      start_date: startDate,
      end_date: endDate,
      status: String(ctr.status),
      salaire_base_monthly: num(ctr.salaire_base_monthly),
      salaire_net_ref_monthly: num(ctr.salaire_net_ref_monthly),
      salaire_net_recup_monthly: ctr.salaire_net_recup_monthly == null ? null : num(ctr.salaire_net_recup_monthly),
    },
    contract_fields: contractFields,
    contract_payable: Boolean(grouped),
    covered_days: grouped?.coveredDays ?? coveredDaysInPeriod(startDate, endDate, start, end),
    contract_count: grouped?.contractCount ?? 1,
    attendance_days: att.map((c) => ({
      work_date: String(c.work_date).slice(0, 10),
      legend_code: String(c.legend_code ?? ""),
      site_id: (c.site_id as string | null) ?? null,
    })),
    movements,
    annual_leave_days: annualLeave,
    salary,
    salary_versions: salaryVersions,
    site_zone: siteZone,
    social_profile_code: socialProfile,
    activity: {
      label: act ? `${act.code} · ${act.label_fr}` : "—",
      cacobatph: Boolean(act?.applies_cacobatph),
      intemperies: Boolean(act?.applies_intemperies),
    },
    compliance: resolved,
    overrides,
    rubric_lines: rubricLines,
    exceptions: simExceptions,
    overtime_hours: hours,
    exit_lines: exitRow ? normalizeSettlementLines(exitRow.settlement_lines) : null,
    advances: adv,
    deducted_elsewhere: deducted,
    stored_slip: stored,
  };
  return { ok: true, data: { ...data, subject, notice } };
}
