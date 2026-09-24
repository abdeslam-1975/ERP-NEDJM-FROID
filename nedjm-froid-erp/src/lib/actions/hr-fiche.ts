"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hrFicheSettingsSchema } from "@/lib/validations/hr";
import {
  DEFAULT_FICHE_SETTINGS,
  FICHE_SETTINGS_ID,
  asSections,
  asStringArray,
  asSuffixes,
  type HrFicheSettings,
} from "@/lib/hr/fiche-settings";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function revalidateHr() {
  revalidatePath("/rh");
  revalidatePath("/rh/employes");
  revalidatePath("/rh/documents");
  revalidatePath("/rh/parametres");
  revalidatePath("/rh/paie");
  revalidatePath("/rh/paie/bulletins");
}

function mapRow(row: Record<string, unknown>): HrFicheSettings {
  return {
    id: String(row.id ?? FICHE_SETTINGS_ID),
    title: String(row.title ?? DEFAULT_FICHE_SETTINGS.title),
    matricule_label: String(row.matricule_label ?? DEFAULT_FICHE_SETTINGS.matricule_label),
    letterhead_url: (row.letterhead_url as string | null) ?? null,
    phone_prefix: String(row.phone_prefix ?? "+213"),
    phone_codes: asStringArray(row.phone_codes),
    uppercase_codes: asStringArray(row.uppercase_codes),
    suffixes: asSuffixes(row.suffixes),
    identity_left: asStringArray(row.identity_left),
    identity_right: asStringArray(row.identity_right),
    photo_field: String(row.photo_field ?? "photo_url"),
    sections: asSections(row.sections),
    sig_left_title: String(row.sig_left_title ?? ""),
    sig_left_sub: String(row.sig_left_sub ?? ""),
    sig_right_title: String(row.sig_right_title ?? ""),
    sig_right_line1: String(row.sig_right_line1 ?? ""),
    sig_right_line2: String(row.sig_right_line2 ?? ""),
  };
}

export async function getHrFicheSettings(): Promise<ActionResult<HrFicheSettings>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_fiche_settings")
    .select(
      "id, title, matricule_label, letterhead_url, phone_prefix, phone_codes, uppercase_codes, suffixes, identity_left, identity_right, photo_field, sections, sig_left_title, sig_left_sub, sig_right_title, sig_right_line1, sig_right_line2",
    )
    .eq("id", FICHE_SETTINGS_ID)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, data: DEFAULT_FICHE_SETTINGS };
  return { ok: true, data: mapRow(data as Record<string, unknown>) };
}

export async function saveHrFicheSettings(
  input: unknown,
): Promise<ActionResult<HrFicheSettings>> {
  const parsed = hrFicheSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const p = parsed.data;
  const supabase = await createClient();
  const payload = {
    id: FICHE_SETTINGS_ID,
    title: p.title,
    matricule_label: p.matricule_label,
    letterhead_url: p.letterhead_url,
    phone_prefix: p.phone_prefix,
    phone_codes: p.phone_codes,
    uppercase_codes: p.uppercase_codes,
    suffixes: p.suffixes,
    identity_left: p.identity_left,
    identity_right: p.identity_right,
    photo_field: p.photo_field,
    sections: p.sections,
    sig_left_title: p.sig_left_title,
    sig_left_sub: p.sig_left_sub,
    sig_right_title: p.sig_right_title,
    sig_right_line1: p.sig_right_line1,
    sig_right_line2: p.sig_right_line2,
  };
  const { data, error } = await supabase
    .from("hr_fiche_settings")
    .upsert(payload, { onConflict: "id" })
    .select(
      "id, title, matricule_label, letterhead_url, phone_prefix, phone_codes, uppercase_codes, suffixes, identity_left, identity_right, photo_field, sections, sig_left_title, sig_left_sub, sig_right_title, sig_right_line1, sig_right_line2",
    )
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Enregistrement refusé (droits)." };
  revalidateHr();
  return { ok: true, data: mapRow(data as Record<string, unknown>) };
}

export async function uploadHrFicheLetterhead(
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choisissez une image d'en-tête." };
  }
  if (file.size > 8 * 1024 * 1024) {
    return { ok: false, error: "Image trop volumineuse (8 Mo max)." };
  }
  const type = file.type;
  if (!["image/jpeg", "image/png", "image/webp"].includes(type)) {
    return { ok: false, error: "Formats acceptés: JPG, PNG, WEBP." };
  }
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const path = `letterhead/${crypto.randomUUID()}.${ext}`;
  const supabase = await createClient();
  const { error } = await supabase.storage.from("hr-photos").upload(path, file, {
    contentType: type,
    upsert: false,
  });
  if (error) return { ok: false, error: error.message };
  const { data } = supabase.storage.from("hr-photos").getPublicUrl(path);
  const current = await getHrFicheSettings();
  if (current.ok) {
    await saveHrFicheSettings({
      ...current.data,
      letterhead_url: data.publicUrl,
    });
  }
  return { ok: true, data: { url: data.publicUrl } };
}
