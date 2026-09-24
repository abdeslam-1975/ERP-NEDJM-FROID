"use server";

import { listCatalogItems, listCatalogKinds, listLegends } from "@/lib/actions/hr-catalogs";
import { listHrEmployeeRows } from "@/lib/actions/hr-employees";
import { listHrContracts } from "@/lib/actions/hr-contracts";
import { listHrCorrespondences, listHrFiles } from "@/lib/actions/hr-documents";
import { listSites } from "@/lib/actions/sites";
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
  contractsActive: number;
  contractsActivePrev: number;
  documentsTotal: number;
  statusBreakdown: { code: string; labelFr: string; labelAr: string; count: number; color: string }[];
  recentEmployees: {
    id: string;
    matricule: string;
    name: string;
    photo_url: string | null;
    status: string;
  }[];
  hiringByMonth: { key: string; label: string; count: number }[];
  sites: { id: string; label: string }[];
  error?: string;
};

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, (m || 1) - 1, 1);
  return d.toLocaleDateString("fr-FR", { month: "short" });
}

export async function loadHrDashboardStats(): Promise<HrDashboardStats> {
  const [employees, contracts, files, corr, sites] = await Promise.all([
    listHrEmployeeRows(),
    listHrContracts(),
    listHrFiles(),
    listHrCorrespondences(),
    listSites(),
  ]);

  const empRows = employees.ok ? employees.data : [];
  const contractRows = contracts.ok ? contracts.data : [];
  const siteRows = sites.ok ? sites.data.filter((s) => s.is_active) : [];

  const now = new Date();
  const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  const activeStatuses = new Set(["ACTIVE", "INVITED"]);
  const employeesActive = empRows.filter((e) => activeStatuses.has(e.status)).length;
  const employeesActivePrev = empRows.filter((e) => {
    if (!activeStatuses.has(e.status)) return false;
    if (!e.hired_at) return true;
    return new Date(e.hired_at) <= endPrevMonth;
  }).length;

  const contractsActive = contractRows.filter((c) => c.status === "ACTIVE" || c.status === "DRAFT").length;
  const contractsActivePrev = contractRows.filter((c) => {
    if (!(c.status === "ACTIVE" || c.status === "DRAFT")) return false;
    return new Date(c.start_date) <= endPrevMonth;
  }).length;

  const statusMap = new Map<string, number>();
  for (const e of empRows) {
    statusMap.set(e.status, (statusMap.get(e.status) ?? 0) + 1);
  }
  const statusMeta: Record<string, { labelFr: string; labelAr: string; color: string }> = {
    ACTIVE: { labelFr: "Actifs", labelAr: "نشط", color: "#3b6ef5" },
    INVITED: { labelFr: "Invités", labelAr: "مدعو", color: "#f59e0b" },
    SUSPENDED: { labelFr: "Suspendus", labelAr: "موقوف", color: "#ef4444" },
    INACTIVE: { labelFr: "Inactifs", labelAr: "غير نشط", color: "#22c55e" },
    DISABLED: { labelFr: "Désactivés", labelAr: "معطّل", color: "#94a3b8" },
  };
  const statusBreakdown = [...statusMap.entries()]
    .map(([code, count]) => ({
      code,
      count,
      labelFr: statusMeta[code]?.labelFr ?? code,
      labelAr: statusMeta[code]?.labelAr ?? code,
      color: statusMeta[code]?.color ?? "#64748b",
    }))
    .sort((a, b) => b.count - a.count);

  const recentEmployees = empRows
    .slice()
    .sort((a, b) => String(b.updated_at ?? b.created_at).localeCompare(String(a.updated_at ?? a.created_at)))
    .slice(0, 6)
    .map((e) => ({
      id: e.id,
      matricule: e.matricule,
      name: `${e.last_name} ${e.first_name}`.trim(),
      photo_url: e.photo_url,
      status: e.status,
    }));

  const months: string[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(monthKey(d));
  }
  const hireCounts = new Map(months.map((k) => [k, 0]));
  for (const e of empRows) {
    if (!e.hired_at) continue;
    const k = monthKey(new Date(e.hired_at));
    if (hireCounts.has(k)) hireCounts.set(k, (hireCounts.get(k) ?? 0) + 1);
  }
  const hiringByMonth = months.map((key) => ({
    key,
    label: monthLabel(key),
    count: hireCounts.get(key) ?? 0,
  }));

  void startThisMonth;
  void startPrevMonth;

  return {
    employeesTotal: empRows.length,
    employeesActive,
    employeesActivePrev,
    contractsActive,
    contractsActivePrev,
    documentsTotal:
      (files.ok ? files.data.length : 0) + (corr.ok ? corr.data.length : 0),
    statusBreakdown,
    recentEmployees,
    hiringByMonth,
    sites: siteRows.map((s) => ({
      id: s.id,
      label: `${s.code} · ${s.name_fr}`,
    })),
    error:
      (!employees.ok && employees.error) ||
      (!contracts.ok && contracts.error) ||
      undefined,
  };
}
