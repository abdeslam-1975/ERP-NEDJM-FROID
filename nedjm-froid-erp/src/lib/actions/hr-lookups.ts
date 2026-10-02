"use server";

import { listCatalogItems, listCatalogKinds, listLegends } from "@/lib/actions/hr-catalogs";
import { listHrEmployeeRows } from "@/lib/actions/hr-employees";
import { listHrContracts } from "@/lib/actions/hr-contracts";
import { listHrCorrespondences, listHrFiles } from "@/lib/actions/hr-documents";
import { listSites } from "@/lib/actions/sites";
import {
  attendanceSnapshot,
  contractAlerts,
  contractMix,
  headcountByMonth,
  isOpenContract,
  type AttendanceSnapshot,
  type ContractAlert,
} from "@/lib/hr/dashboard-stats";
import { createClient } from "@/lib/supabase/server";

export async function listActivityOptions() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ref_activity_codes")
    .select("id, code, label_fr")
    .order("code");
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, data: data ?? [] };
}

export async function loadHrLookups() {
  const [kinds, items, legends, sites, activities] = await Promise.all([
    listCatalogKinds(),
    listCatalogItems(),
    listLegends(),
    listSites(),
    listActivityOptions(),
  ]);
  return {
    kinds: kinds.ok ? kinds.data : [],
    catalogs: items.ok ? items.data : [],
    legends: legends.ok ? legends.data.filter((l) => l.is_active) : [],
    sites: sites.ok ? sites.data.filter((s) => s.is_active) : [],
    activities: activities.ok ? activities.data : [],
    error:
      (!kinds.ok && kinds.error) ||
      (!items.ok && items.error) ||
      (!legends.ok && legends.error) ||
      (!sites.ok && sites.error) ||
      (!activities.ok && activities.error) ||
      undefined,
  };
}

export async function loadHrHubCounts() {
  const [employees, contracts, files, corr] = await Promise.all([
    listHrEmployeeRows(),
    listHrContracts(),
    listHrFiles(),
    listHrCorrespondences(),
  ]);
  return {
    employees: employees.ok ? employees.data.length : 0,
    contracts: contracts.ok ? contracts.data.length : 0,
    documents:
      (files.ok ? files.data.length : 0) + (corr.ok ? corr.data.length : 0),
    error:
      (!employees.ok && employees.error) ||
      (!contracts.ok && contracts.error) ||
      undefined,
  };
}

export type HrDashboardStats = {
  employeesTotal: number;
  employeesActive: number;
  employeesActivePrev: number;
  contractsOpen: number;
  payrollBase: number;
  averageBase: number;
  coverage: number;
  headcount: { key: string; label: string; count: number }[];
  contractMix: { code: string; label: string; count: number; color: string }[];
  attendance: AttendanceSnapshot;
  alerts: ContractAlert[];
  recentHires: {
    id: string;
    matricule: string;
    name: string;
    photo_url: string | null;
    poste: string | null;
    hired_at: string | null;
  }[];
  error?: string;
};

/**
 * Latest pointage day of the last month (optionally one site). Capped at the most recent 1 000 marks,
 * which always covers that day.
 */
export async function loadAttendanceSnapshot(siteId?: string): Promise<AttendanceSnapshot> {
  const supabase = await createClient();
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 31);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  let query = supabase
    .from("hr_attendance")
    .select("employee_id, work_date, legend_code")
    .gte("work_date", iso(from))
    .lte("work_date", iso(now))
    .order("work_date", { ascending: false })
    .limit(1000);
  if (siteId) query = query.eq("site_id", siteId);
  const [marks, legends] = await Promise.all([query, listLegends()]);
  return attendanceSnapshot(marks.data ?? [], legends.ok ? legends.data : []);
}

export async function loadHrDashboardStats(): Promise<HrDashboardStats> {
  const [employees, contracts, catalogs, attendance] = await Promise.all([
    listHrEmployeeRows(),
    listHrContracts(),
    listCatalogItems(),
    loadAttendanceSnapshot(),
  ]);

  const empRows = employees.ok ? employees.data : [];
  const contractRows = contracts.ok ? contracts.data : [];
  const now = new Date();
  const endPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  const activeStatuses = new Set(["ACTIVE", "INVITED"]);
  const activeEmployees = empRows.filter((e) => activeStatuses.has(e.status));
  const employeesActivePrev = activeEmployees.filter((e) => !e.hired_at || new Date(e.hired_at) <= endPrevMonth).length;

  const open = contractRows.filter(isOpenContract);
  const paid = contractRows.filter((c) => c.status === "ACTIVE");
  const payrollBase = paid.reduce((s, c) => s + (Number(c.salaire_base_monthly) || 0), 0);
  const covered = new Set(open.map((c) => c.employee_id));
  const coverage = activeEmployees.length
    ? Math.round((activeEmployees.filter((e) => covered.has(e.id)).length / activeEmployees.length) * 100)
    : 0;

  const typeLabels = Object.fromEntries(
    (catalogs.ok ? catalogs.data : []).filter((c) => c.kind === "contract_type").map((c) => [c.code, c.label_fr]),
  );

  const mainContract = new Map<string, (typeof contractRows)[number]>();
  for (const c of open) {
    const current = mainContract.get(c.employee_id);
    if (!current || (c.affectation_principale && !current.affectation_principale)) mainContract.set(c.employee_id, c);
  }
  const recentHires = empRows
    .slice()
    .sort((a, b) => String(b.hired_at ?? b.created_at).localeCompare(String(a.hired_at ?? a.created_at)))
    .slice(0, 4)
    .map((e) => ({
      id: e.id,
      matricule: e.matricule,
      name: `${e.last_name} ${e.first_name}`.trim(),
      photo_url: e.photo_url,
      poste: mainContract.get(e.id)?.poste_fr ?? null,
      hired_at: e.hired_at,
    }));

  return {
    employeesTotal: empRows.length,
    employeesActive: activeEmployees.length,
    employeesActivePrev,
    contractsOpen: open.length,
    payrollBase,
    averageBase: paid.length ? Math.round(payrollBase / paid.length) : 0,
    coverage,
    headcount: headcountByMonth(contractRows, now, 12),
    contractMix: contractMix(contractRows, typeLabels),
    attendance,
    alerts: contractAlerts(
      contractRows,
      activeEmployees.map((e) => ({ id: e.id, name: `${e.last_name} ${e.first_name}`.trim() })),
      now,
    ),
    recentHires,
    error:
      (!employees.ok && employees.error) ||
      (!contracts.ok && contracts.error) ||
      undefined,
  };
}
