"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { COMPANY_PROFILE_COLUMNS, loadCompanyProfile } from "@/lib/doc/print-kit";
import { COMPANY_PROFILE_KEYS, normalizeCompanyProfile, type HrCompanyProfile } from "@/lib/hr/company-profile";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

const profileSchema = z.object(
  Object.fromEntries(COMPANY_PROFILE_KEYS.map((k) => [k, z.string().trim().max(600)])) as Record<
    (typeof COMPANY_PROFILE_KEYS)[number],
    z.ZodString
  >,
);

export async function getHrCompanyProfile(): Promise<ActionResult<{ profile: HrCompanyProfile; canEdit: boolean }>> {
  const supabase = await createClient();
  const [profile, perm] = await Promise.all([
    loadCompanyProfile(supabase),
    supabase.rpc("erp_has_perm", { p_screen: "hr_settings", p_action: "update" }),
  ]);
  if (!profile.ok) return profile;
  return { ok: true, data: { profile: profile.data, canEdit: perm.data === true } };
}

export async function saveHrCompanyProfile(input: unknown): Promise<ActionResult<HrCompanyProfile>> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  if (!parsed.data.name_fr && !parsed.data.name_ar) return { ok: false, error: "Indiquez la raison sociale." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_company_profile")
    .upsert({ id: "default", ...parsed.data }, { onConflict: "id" })
    .select(COMPANY_PROFILE_COLUMNS)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Enregistrement refusé (droits)." };
  revalidatePath("/rh", "layout");
  revalidatePath("/simulateur");
  return { ok: true, data: normalizeCompanyProfile(data) };
}
