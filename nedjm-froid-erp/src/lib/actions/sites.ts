"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  siteCreateSchema,
  siteToggleActiveSchema,
  siteUpdateSchema,
  type SiteCreateInput,
} from "@/lib/validations/site";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export type ActivityCodeOption = {
  id: string;
  code: string;
  label_fr: string;
  regime: "BTPH" | "MAINTENANCE";
};

export type SiteRow = {
  id: string;
  code: string;
  name_fr: string;
  name_ar: string | null;
  activity_code_id: string | null;
  wilaya: string | null;
  commune: string | null;
  irg_zone_code: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  activity: ActivityCodeOption | null;
};

export type IrgZoneOption = { code: string; label_fr: string };

export async function listIrgZoneOptions(): Promise<ActionResult<IrgZoneOption[]>> {
  const { supabase, error } = await requireSession();
  if (error) return { ok: false, error };
  const { data, error: qErr } = await supabase
    .from("hr_catalogs")
    .select("code, label_fr")
    .eq("kind", "irg_zone")
    .eq("is_active", true)
    .order("sort_order");
  if (qErr) return { ok: false, error: `Lecture zones IRG: ${qErr.message}` };
  return { ok: true, data: (data ?? []) as IrgZoneOption[] };
}

async function requireSession() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      supabase,
      error: "Session requise. Connectez-vous puis réessayez." as const,
      user: null,
    };
  }

  return { supabase, error: null, user };
}

function mapZodError(err: {
  flatten: () => { fieldErrors: Record<string, string[] | undefined> };
}): ActionResult<never> {
  const flat = err.flatten().fieldErrors;
  const fieldErrors: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(flat)) {
    if (value && value.length) fieldErrors[key] = value;
  }
  return {
    ok: false,
    error: "Données invalides. Corrigez le formulaire.",
    fieldErrors,
  };
}

export async function listActivityCodes(): Promise<
  ActionResult<ActivityCodeOption[]>
> {
  const { supabase, error } = await requireSession();
  if (error) return { ok: false, error };

  const { data, error: qErr } = await supabase
    .from("ref_activity_codes")
    .select("id, code, label_fr, regime")
    .eq("is_active", true)
    .order("code");

  if (qErr) {
    return { ok: false, error: `Lecture activités: ${qErr.message}` };
  }

  return { ok: true, data: (data ?? []) as ActivityCodeOption[] };
}

export async function listSites(): Promise<ActionResult<SiteRow[]>> {
  const { supabase, error } = await requireSession();
  if (error) return { ok: false, error };

  // RLS enforces erp_can_see_site(id) on SELECT
  const { data, error: qErr } = await supabase
    .from("ref_sites")
    .select(
      `
      id,
      code,
      name_fr,
      name_ar,
      activity_code_id,
      wilaya,
      commune,
      irg_zone_code,
      latitude,
      longitude,
      is_active,
      created_at,
      updated_at,
      activity:ref_activity_codes ( id, code, label_fr, regime )
    `,
    )
    .order("code");

  if (qErr) {
    return { ok: false, error: `Lecture chantiers: ${qErr.message}` };
  }

  const rows: SiteRow[] = (data ?? []).map((row) => {
    const activityRaw = row.activity as
      | ActivityCodeOption
      | ActivityCodeOption[]
      | null;
    const activity = Array.isArray(activityRaw)
      ? (activityRaw[0] ?? null)
      : activityRaw;

    return {
      id: row.id,
      code: row.code,
      name_fr: row.name_fr,
      name_ar: row.name_ar,
      activity_code_id: row.activity_code_id,
      wilaya: row.wilaya,
      commune: row.commune,
      irg_zone_code: row.irg_zone_code ?? null,
      latitude: row.latitude == null ? null : Number(row.latitude),
      longitude: row.longitude == null ? null : Number(row.longitude),
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
      activity,
    };
  });

  return { ok: true, data: rows };
}

export async function createSite(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { supabase, error } = await requireSession();
  if (error) return { ok: false, error };

  const parsed = siteCreateSchema.safeParse(input);
  if (!parsed.success) return mapZodError(parsed.error);

  const payload: SiteCreateInput = parsed.data;

  const { data, error: iErr } = await supabase
    .from("ref_sites")
    .insert({
      code: payload.code,
      name_fr: payload.name_fr,
      name_ar: payload.name_ar,
      activity_code_id: payload.activity_code_id,
      wilaya: payload.wilaya,
      commune: payload.commune,
      irg_zone_code: payload.irg_zone_code ?? null,
      latitude: payload.latitude,
      longitude: payload.longitude,
      is_active: payload.is_active,
    })
    .select("id")
    .single();

  if (iErr) {
    if (iErr.code === "23505") {
      return { ok: false, error: `Le code « ${payload.code} » existe déjà.` };
    }
    if (iErr.code === "42501" || iErr.message.toLowerCase().includes("policy")) {
      return {
        ok: false,
        error:
          "Accès refusé (RLS). Vérifiez le rôle SUPER_ADMIN et l'écran « sites ».",
      };
    }
    return { ok: false, error: `Création impossible: ${iErr.message}` };
  }

  revalidatePath("/referentiels/chantiers");
  revalidatePath("/");
  return { ok: true, data: { id: data.id } };
}

export async function updateSite(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { supabase, error } = await requireSession();
  if (error) return { ok: false, error };

  const parsed = siteUpdateSchema.safeParse(input);
  if (!parsed.success) return mapZodError(parsed.error);

  const { id, ...rest } = parsed.data;
  if (Object.keys(rest).length === 0) {
    return { ok: false, error: "Aucune modification fournie." };
  }

  const { data, error: uErr } = await supabase
    .from("ref_sites")
    .update(rest)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (uErr) {
    if (uErr.code === "23505") {
      return { ok: false, error: "Ce code chantier est déjà utilisé." };
    }
    if (uErr.code === "42501" || uErr.message.toLowerCase().includes("policy")) {
      return {
        ok: false,
        error:
          "Accès refusé (RLS). Vérifiez les droits update sur l'écran « sites ».",
      };
    }
    return { ok: false, error: `Mise à jour impossible: ${uErr.message}` };
  }

  if (!data) {
    return {
      ok: false,
      error:
        "Chantier introuvable ou hors périmètre (RLS). Aucune ligne mise à jour.",
    };
  }

  revalidatePath("/referentiels/chantiers");
  revalidatePath("/");
  return { ok: true, data: { id: data.id } };
}

export async function toggleSiteActive(
  input: unknown,
): Promise<ActionResult<{ id: string; is_active: boolean }>> {
  const { supabase, error } = await requireSession();
  if (error) return { ok: false, error };

  const parsed = siteToggleActiveSchema.safeParse(input);
  if (!parsed.success) return mapZodError(parsed.error);

  const { id, is_active } = parsed.data;

  const { data, error: uErr } = await supabase
    .from("ref_sites")
    .update({ is_active })
    .eq("id", id)
    .select("id, is_active")
    .maybeSingle();

  if (uErr) {
    if (uErr.code === "42501" || uErr.message.toLowerCase().includes("policy")) {
      return {
        ok: false,
        error: "Accès refusé (RLS) pour changer le statut du chantier.",
      };
    }
    return { ok: false, error: `Statut non modifié: ${uErr.message}` };
  }

  if (!data) {
    return {
      ok: false,
      error:
        "Chantier introuvable ou hors périmètre (RLS). Aucune ligne mise à jour.",
    };
  }

  revalidatePath("/referentiels/chantiers");
  revalidatePath("/");
  return {
    ok: true,
    data: { id: data.id, is_active: data.is_active },
  };
}
