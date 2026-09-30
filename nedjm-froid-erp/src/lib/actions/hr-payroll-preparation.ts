"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { payrollGenerateSchema } from "@/lib/validations/hr";
import { parseMonthPreparation, type MonthPreparation } from "@/lib/hr/payroll-preparation";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export type PreparationSite = { id: string; name: string };

/** Month preparation dashboard: read only, rights and site scope checked by the database. */
export async function loadMonthPreparation(
  input: unknown,
): Promise<ActionResult<{ preparation: MonthPreparation; sites: PreparationSite[] }>> {
  const parsed = payrollGenerateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Période invalide." };
  const p = parsed.data;
  const supabase = await createClient();
  const [{ data, error }, sites] = await Promise.all([
    supabase.rpc("hr_payroll_month_preparation", {
      p_year: p.period_year,
      p_month: p.period_month,
      p_site: p.site_id ?? null,
    }),
    supabase.from("ref_sites").select("id, name_fr").eq("is_active", true).order("name_fr"),
  ]);
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: {
      preparation: parseMonthPreparation(data),
      sites: (sites.data ?? []).map((s) => ({ id: s.id as string, name: s.name_fr as string })),
    },
  };
}

/** Opens (or returns) the D1 request of the month; refused by the database when no rule is pending. */
export async function requestUnapprovedRulesDecision(input: unknown): Promise<ActionResult<{ decision_id: string }>> {
  const parsed = payrollGenerateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Période invalide." };
  const p = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_payroll_d1_request", {
    p_site: p.site_id ?? null,
    p_year: p.period_year,
    p_month: p.period_month,
  });
  if (error) return { ok: false, error: error.message };
  if (typeof data !== "string") return { ok: false, error: "Demande non enregistrée." };
  revalidatePath("/decisions");
  revalidatePath("/rh/paie/preparation");
  return { ok: true, data: { decision_id: data } };
}
