"use server";

import { createClient } from "@/lib/supabase/server";

export type GlobalSearchEmployee = {
  id: string;
  matricule: string;
  name: string;
  name_ar: string;
};

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
