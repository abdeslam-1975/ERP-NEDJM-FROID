"use server";

import { createClient } from "@/lib/supabase/server";

export type GlobalSearchEmployee = {
  id: string;
  matricule: string;
  name: string;
  name_ar: string;
};

export type PayrollSearchEmployee = GlobalSearchEmployee & {
  site_id: string | null;
  site_name: string | null;
  contract_status: string | null;
};

export async function searchEmployeesForPayroll(query: string): Promise<PayrollSearchEmployee[]> {
  const employees = await searchEmployees(query);
  if (!employees.length) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("hr_contracts")
    .select("employee_id, site_id, status, start_date, site:ref_sites ( name_fr )")
    .in(
      "employee_id",
      employees.map((e) => e.id),
    )
    .eq("affectation_principale", true)
    .order("start_date", { ascending: false });
  const byEmployee = new Map<string, { site_id: string; site_name: string | null; status: string }>();
  for (const row of data ?? []) {
    if (byEmployee.has(row.employee_id)) continue;
    const site = Array.isArray(row.site) ? row.site[0] : row.site;
    byEmployee.set(row.employee_id, {
      site_id: row.site_id,
      site_name: site?.name_fr ?? null,
      status: row.status,
    });
  }
  return employees.map((e) => {
    const c = byEmployee.get(e.id);
    return {
      ...e,
      site_id: c?.site_id ?? null,
      site_name: c?.site_name ?? null,
      contract_status: c?.status ?? null,
    };
  });
}

export async function searchEmployees(query: string): Promise<GlobalSearchEmployee[]> {
  // PostgREST `or` filter syntax: commas, parentheses and wildcards must not reach the filter string.
  const q = String(query ?? "")
    .replace(/[,()%*\\"]/g, " ")
    .trim()
    .slice(0, 60);
  if (q.length < 2) return [];
  const terms = q.split(/\s+/).filter(Boolean).slice(0, 3);
  const supabase = await createClient();
  let request = supabase
    .from("hr_employees")
    .select("id, matricule, last_name, first_name, last_name_ar, first_name_ar")
    .order("last_name")
    .limit(8);
  for (const term of terms) {
    const like = `%${term}%`;
    request = request.or(
      ["matricule", "last_name", "first_name", "last_name_ar", "first_name_ar"]
        .map((col) => `${col}.ilike.${like}`)
        .join(","),
    );
  }
  const { data, error } = await request;
  if (error) return [];
  return (data ?? []).map((row) => ({
    id: row.id,
    matricule: row.matricule ?? "",
    name: `${row.last_name ?? ""} ${row.first_name ?? ""}`.trim(),
    name_ar: `${row.last_name_ar ?? ""} ${row.first_name_ar ?? ""}`.trim(),
  }));
}
