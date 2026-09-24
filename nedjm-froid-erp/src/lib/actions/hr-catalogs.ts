"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import {
  catalogItemSchema,
  catalogKindSchema,
  legendUpsertSchema,
} from "@/lib/validations/hr";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type CatalogKind = {
  code: string;
  label_ar: string;
  label_fr: string;
  extra_hint: string | null;
  sort_order: number;
  is_active: boolean;
};

export type CatalogItem = {
  id: string;
  kind: string;
  code: string;
  label_ar: string;
  label_fr: string;
  extra: Record<string, unknown>;
  color_bg: string | null;
  color_fg: string | null;
  sort_order: number;
  is_active: boolean;
};

export type LegendRow = {
  id: string;
  code: string;
  label_fr: string;
  label_ar: string | null;
  coefficient: number;
  counts_as_presence: boolean;
  triggers_an_passthrough: boolean;
  color_bg: string | null;
  color_fg: string | null;
  source_mode: string;
  is_active: boolean;
  is_system: boolean;
};

function revalidateHr() {
  revalidatePath("/rh");
  revalidatePath("/rh/employes");
  revalidatePath("/rh/contrats");
  revalidatePath("/rh/documents");
  revalidatePath("/rh/presence");
  revalidatePath("/rh/paie");
  revalidatePath("/rh/parametres");
  revalidatePath("/referentiels/legendes");
}

export async function listCatalogKinds(): Promise<ActionResult<CatalogKind[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_catalog_kinds")
    .select("code, label_ar, label_fr, extra_hint, sort_order, is_active")
    .order("sort_order");
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as CatalogKind[] };
}

export async function listCatalogItems(
  kind?: string,
): Promise<ActionResult<CatalogItem[]>> {
  const supabase = await createClient();
  let q = supabase
    .from("hr_catalogs")
    .select(
      "id, kind, code, label_ar, label_fr, extra, color_bg, color_fg, sort_order, is_active",
    )
    .order("sort_order");
  if (kind) q = q.eq("kind", kind);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((row) => ({
      ...row,
      extra: (row.extra ?? {}) as Record<string, unknown>,
    })),
  };
}

export async function upsertCatalogKind(
  input: unknown,
): Promise<ActionResult<{ code: string }>> {
  const parsed = catalogKindSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_catalog_kinds")
    .upsert(parsed.data, { onConflict: "code" })
    .select("code")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Enregistrement refusé (droits)." };
  revalidateHr();
  return { ok: true, data: { code: data.code } };
}

export async function upsertCatalogItem(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = catalogItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const p = parsed.data;
  const supabase = await createClient();
  const payload = {
    kind: p.kind,
    code: p.code,
    label_ar: p.label_ar,
    label_fr: p.label_fr,
    extra: p.extra ?? {},
    color_bg: p.color_bg,
    color_fg: p.color_fg,
    sort_order: p.sort_order,
    is_active: p.is_active,
  };
  const q = p.id
    ? supabase.from("hr_catalogs").update(payload).eq("id", p.id)
    : supabase.from("hr_catalogs").insert(payload);
  const { data, error } = await q.select("id").maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Enregistrement refusé (droits)." };
  revalidateHr();
  return { ok: true, data: { id: data.id } };
}

export async function setDocumentRequiredForSave(input: {
  id: string;
  required_for_save: boolean;
}): Promise<ActionResult<{ id: string }>> {
  const workspace = await getWorkspaceProfile();
  if (!workspace?.isSuperAdmin) {
    return {
      ok: false,
      error: "Réservé à SUPER_ADMIN. · محصور في SUPER_ADMIN.",
    };
  }
  const supabase = await createClient();
  const { data: row, error: readErr } = await supabase
    .from("hr_catalogs")
    .select("id, kind, extra")
    .eq("id", input.id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!row || row.kind !== "document_type") {
    return { ok: false, error: "Type de document introuvable." };
  }
  const extra = {
    ...((row.extra as Record<string, unknown> | null) ?? {}),
    required_for_save: input.required_for_save,
  };
  const { data, error } = await supabase
    .from("hr_catalogs")
    .update({ extra })
    .eq("id", input.id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Mise à jour refusée." };
  revalidateHr();
  return { ok: true, data: { id: data.id } };
}

export async function setCatalogItemActive(input: {
  id: string;
  is_active: boolean;
}): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_catalogs")
    .update({ is_active: input.is_active })
    .eq("id", input.id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Mise à jour refusée." };
  revalidateHr();
  return { ok: true, data: { id: data.id } };
}

export async function deleteCatalogItem(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_catalogs")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Suppression refusée." };
  revalidateHr();
  return { ok: true, data: { id } };
}

export async function listLegends(): Promise<ActionResult<LegendRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ref_legendes")
    .select(
      "id, code, label_fr, label_ar, coefficient, counts_as_presence, triggers_an_passthrough, color_bg, color_fg, source_mode, is_active, is_system",
    )
    .order("code");
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as LegendRow[] };
}

export async function upsertLegend(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = legendUpsertSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const p = parsed.data;
  const supabase = await createClient();
  const payload = {
    code: p.code,
    label_fr: p.label_fr,
    label_ar: p.label_ar,
    coefficient: p.coefficient,
    counts_as_presence: p.counts_as_presence,
    triggers_an_passthrough: p.triggers_an_passthrough,
    color_bg: p.color_bg,
    color_fg: p.color_fg,
    source_mode: p.source_mode,
    is_active: p.is_active,
    is_system: false,
  };
  const q = p.id
    ? supabase.from("ref_legendes").update(payload).eq("id", p.id)
    : supabase.from("ref_legendes").insert(payload);
  const { data, error } = await q.select("id").maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Enregistrement refusé (droits)." };
  revalidateHr();
  return { ok: true, data: { id: data.id } };
}
