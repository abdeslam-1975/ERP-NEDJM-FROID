"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { loadCompanyProfile } from "@/lib/doc/print-kit";
import { COMPANY_PROFILE_KEYS, type HrCompanyProfile } from "@/lib/hr/company-profile";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";

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
  const { error } = await supabase.from("hr_company_profile").upsert({ id: "default", ...parsed.data }, { onConflict: "id" });
  if (error) return { ok: false, error: error.message };
  const saved = await loadCompanyProfile(supabase);
  if (!saved.ok) return saved;
  revalidatePath("/rh", "layout");
  revalidatePath("/simulateur");
  return { ok: true, data: saved.data };
}

const docCodeSchema = z.object({
  mode: z.enum(["auto", "manual"]),
  om: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,8}$/, "Code mission : 1 à 8 lettres ou chiffres.").optional(),
  cng: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,8}$/, "Code congé : 1 à 8 lettres ou chiffres.").optional(),
});

/** Automatic OM/CNG, or codes typed by the super admin. The sequence number stays generated. */
export async function saveDocCodeSettings(input: unknown): Promise<ActionResult<HrCompanyProfile>> {
  const workspace = await getWorkspaceProfile();
  if (!workspace?.isSuperAdmin) return { ok: false, error: "Réservé au super administrateur." };
  const parsed = docCodeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  if (parsed.data.mode === "manual" && (!parsed.data.om || !parsed.data.cng)) {
    return { ok: false, error: "Indiquez les deux codes." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("hr_company_profile")
    .update({
      doc_code_mode: parsed.data.mode,
      doc_code_om: parsed.data.mode === "manual" ? parsed.data.om : "OM",
      doc_code_cng: parsed.data.mode === "manual" ? parsed.data.cng : "CNG",
    })
    .eq("id", "default");
  if (error) return { ok: false, error: error.message };
  const saved = await loadCompanyProfile(supabase);
  if (!saved.ok) return saved;
  revalidatePath("/rh", "layout");
  return { ok: true, data: saved.data };
}
