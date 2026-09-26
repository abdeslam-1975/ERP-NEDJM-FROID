"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hrBulletinSettingsSchema } from "@/lib/validations/hr";
import { getHrFicheSettings } from "@/lib/actions/hr-fiche";
import { legalVarsAsOf } from "@/lib/hr/legal-vars-as-of";
import {
  BULLETIN_SETTINGS_ID,
  bulletinRatesFromVars,
  DEFAULT_BULLETIN_SETTINGS,
  parseBulletinLayout,
  type BulletinLegalRates,
  type HrBulletinSettings,
} from "@/lib/hr/bulletin-settings";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type { BulletinLegalRates, HrBulletinSettings };

function revalidateBulletin() {
  revalidatePath("/rh");
  revalidatePath("/rh/parametres");
  revalidatePath("/rh/paie");
  revalidatePath("/rh/paie/bulletins");
  revalidatePath("/rh/paie/fiscal");
  revalidatePath("/rh/paie/social");
}

export async function getHrBulletinSettings(): Promise<ActionResult<HrBulletinSettings>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_bulletin_settings")
    .select("layout")
    .eq("id", BULLETIN_SETTINGS_ID)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: parseBulletinLayout(data?.layout) };
}

export async function saveHrBulletinSettings(
  input: unknown,
): Promise<ActionResult<HrBulletinSettings>> {
  const parsed = hrBulletinSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const layout = parseBulletinLayout(parsed.data);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_bulletin_settings")
    .upsert({ id: BULLETIN_SETTINGS_ID, layout }, { onConflict: "id" })
    .select("layout")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Enregistrement refusé (droits)." };
  revalidateBulletin();
  return { ok: true, data: parseBulletinLayout(data.layout) };
}

/** Rates in force on `asOf` (defaults to today, for the settings screen). */
export async function getBulletinLegalRates(
  settings?: HrBulletinSettings,
  asOf: string = new Date().toISOString().slice(0, 10),
): Promise<ActionResult<BulletinLegalRates>> {
  const layout = settings ?? DEFAULT_BULLETIN_SETTINGS;
  const supabase = await createClient();
  const vars = await legalVarsAsOf(supabase, asOf);
  return { ok: true, data: bulletinRatesFromVars(vars, layout) };
}

export async function loadPayrollBulletinContext() {
  const [bulletin, fiche] = await Promise.all([getHrBulletinSettings(), getHrFicheSettings()]);
  const layout = bulletin.ok ? { ...bulletin.data } : { ...DEFAULT_BULLETIN_SETTINGS };
  if (!layout.letterhead_url && fiche.ok && fiche.data.letterhead_url) {
    layout.letterhead_url = fiche.data.letterhead_url;
  }
  const rates = await getBulletinLegalRates(layout);
  return {
    bulletin: layout,
    legalRates: rates.ok
      ? rates.data
      : {
          ss_pct: null,
          pat_pct: null,
          caco_pct: null,
          intemp_sal_pct: null,
          intemp_pat_pct: null,
        },
    error:
      (!bulletin.ok && bulletin.error) ||
      (!fiche.ok && fiche.error) ||
      (!rates.ok && rates.error) ||
      undefined,
  };
}
