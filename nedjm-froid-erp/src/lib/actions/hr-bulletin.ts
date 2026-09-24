"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hrBulletinSettingsSchema } from "@/lib/validations/hr";
import { getHrFicheSettings } from "@/lib/actions/hr-fiche";
import {
  BULLETIN_SETTINGS_ID,
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

async function currentVarPct(
  supabase: Awaited<ReturnType<typeof createClient>>,
  key: string,
): Promise<number | null> {
  if (!key) return null;
  const { data: row } = await supabase.from("ref_global_vars").select("id").eq("key", key).maybeSingle();
  if (!row) return null;
  const { data: ver } = await supabase
    .from("ref_global_var_versions")
    .select("value_numeric")
    .eq("var_id", row.id)
    .lte("effective_from", new Date().toISOString().slice(0, 10))
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  const n = Number(ver?.value_numeric);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10000) / 100;
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

export async function getBulletinLegalRates(
  settings?: HrBulletinSettings,
): Promise<ActionResult<BulletinLegalRates>> {
  const layout = settings ?? DEFAULT_BULLETIN_SETTINGS;
  const supabase = await createClient();
  const [ss, pat, fos, caco, intempSal, intempPat] = await Promise.all([
    currentVarPct(supabase, layout.ss_var_key),
    currentVarPct(supabase, layout.pat_var_key),
    currentVarPct(supabase, layout.fos_var_key),
    currentVarPct(supabase, layout.caco_var_key),
    currentVarPct(supabase, layout.intemp_sal_var_key),
    currentVarPct(supabase, layout.intemp_emp_var_key),
  ]);
  const patTotal =
    pat == null && fos == null ? null : Math.round(((pat ?? 0) + (fos ?? 0)) * 100) / 100;
  return {
    ok: true,
    data: {
      ss_pct: ss,
      pat_pct: patTotal,
      caco_pct: caco,
      intemp_sal_pct: intempSal,
      intemp_pat_pct: intempPat,
    },
  };
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
