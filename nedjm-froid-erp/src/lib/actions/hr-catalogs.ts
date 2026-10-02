"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import {
  catalogItemSchema,
  catalogKindSchema,
  legendCoefficientRequestSchema,
  legendUpsertSchema,
} from "@/lib/validations/hr";
import { legendCoefficientAt, type LegendCoefficientVersion } from "@/lib/hr/legend-coefficient";
import { loadLegendCoefficientVersions } from "@/lib/hr/legends-at";

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
  /** Dated versions (D14); `coefficient` is the one in force this month. */
  coefficient_versions: LegendCoefficientVersion[];
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

const SUPER_ADMIN_ONLY = "Réservé à SUPER_ADMIN. · محصور في SUPER_ADMIN.";

function catalogCode(label: string) {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export async function addWorkRegime(input: {
  label_fr: string;
}): Promise<ActionResult<CatalogItem>> {
  const workspace = await getWorkspaceProfile();
  if (!workspace?.isSuperAdmin) return { ok: false, error: SUPER_ADMIN_ONLY };
  const label = input.label_fr.trim().slice(0, 160);
  const base = catalogCode(label);
  if (!label || !base) return { ok: false, error: "Libellé du régime obligatoire." };
  const supabase = await createClient();
  const { data: existing, error: readErr } = await supabase
    .from("hr_catalogs")
    .select("code, label_fr, sort_order")
    .eq("kind", "work_regime");
  if (readErr) return { ok: false, error: readErr.message };
  const rows = existing ?? [];
  if (rows.some((r) => r.label_fr.trim().toLowerCase() === label.toLowerCase())) {
    return { ok: false, error: "Ce régime existe déjà." };
  }
  const codes = new Set(rows.map((r) => r.code));
  let code = base;
  for (let n = 2; codes.has(code); n += 1) code = `${base.slice(0, 36)}_${n}`;
  const sort_order = rows.reduce((max, r) => Math.max(max, r.sort_order ?? 0), 0) + 10;
  const { data, error } = await supabase
    .from("hr_catalogs")
    .insert({ kind: "work_regime", code, label_fr: label, label_ar: label, extra: {}, sort_order, is_active: true })
    .select("id, kind, code, label_ar, label_fr, extra, color_bg, color_fg, sort_order, is_active")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Enregistrement refusé (droits)." };
  revalidateHr();
  return { ok: true, data: { ...data, extra: (data.extra ?? {}) as Record<string, unknown> } };
}

/** A regime still named on a contract is archived instead of deleted, so the contract keeps its label. */
export async function removeWorkRegime(
  id: string,
): Promise<ActionResult<{ id: string; archived: boolean }>> {
  const workspace = await getWorkspaceProfile();
  if (!workspace?.isSuperAdmin) return { ok: false, error: SUPER_ADMIN_ONLY };
  const supabase = await createClient();
  const { data: row, error: readErr } = await supabase
    .from("hr_catalogs")
    .select("id, kind, code")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!row || row.kind !== "work_regime") return { ok: false, error: "Régime introuvable." };
  const { count, error: usedErr } = await supabase
    .from("hr_contracts")
    .select("id", { count: "exact", head: true })
    .eq("work_regime_code", row.code);
  if (usedErr) return { ok: false, error: usedErr.message };
  const q = count
    ? supabase.from("hr_catalogs").update({ is_active: false }).eq("id", id)
    : supabase.from("hr_catalogs").delete().eq("id", id);
  const { data, error } = await q.select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Suppression refusée." };
  revalidateHr();
  return { ok: true, data: { id, archived: Boolean(count) } };
}

export async function listLegends(): Promise<ActionResult<LegendRow[]>> {
  const supabase = await createClient();
  const [{ data, error }, versions] = await Promise.all([
    supabase
      .from("ref_legendes")
      .select(
        "id, code, label_fr, label_ar, coefficient, counts_as_presence, triggers_an_passthrough, color_bg, color_fg, source_mode, is_active, is_system",
      )
      .order("code"),
    loadLegendCoefficientVersions(supabase),
  ]);
  if (error) return { ok: false, error: error.message };
  if (!versions.ok) return versions;
  const today = new Date().toISOString().slice(0, 10);
  return {
    ok: true,
    data: ((data ?? []) as Omit<LegendRow, "coefficient_versions">[]).map((l) => {
      const list = versions.data.get(l.id) ?? [];
      return {
        ...l,
        coefficient: legendCoefficientAt(list, today, Number(l.coefficient)),
        coefficient_versions: list,
      };
    }),
  };
}

/**
 * Asks for a new coefficient from a given month (decision D14). Nothing changes until the decision;
 * months already validated or closed keep the old coefficient.
 */
export async function requestLegendCoefficientChange(
  input: unknown,
): Promise<ActionResult<{ decision_id: string }>> {
  const parsed = legendCoefficientRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const p = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_legend_coefficient_request", {
    p_legend: p.legend_id,
    p_coefficient: p.coefficient,
    p_month: p.month,
    p_reason: p.reason,
  });
  if (error) return { ok: false, error: error.message };
  if (typeof data !== "string") return { ok: false, error: "Demande non enregistrée." };
  revalidatePath("/decisions");
  revalidatePath("/referentiels/legendes");
  return { ok: true, data: { decision_id: data } };
}

function legendWriteError(message: string): string {
  if (message.includes("hr_attendance_legend_code_fkey")) {
    return "Ce code est déjà utilisé dans le pointage. Il ne peut pas être renommé : enregistrez un nouveau code.";
  }
  if (message.includes("coefficient")) {
    return "Coefficient refusé par la base (0 à 999,999). Exemple : 0,5.";
  }
  return message;
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
  const fields = {
    label_fr: p.label_fr,
    label_ar: p.label_ar,
    coefficient: p.coefficient,
    counts_as_presence: p.counts_as_presence,
    triggers_an_passthrough: p.triggers_an_passthrough,
    color_bg: p.color_bg,
    color_fg: p.color_fg,
    source_mode: p.source_mode,
    is_active: p.is_active,
  };

  // The coefficient of an existing code changes only through a dated D14 request.
  const { coefficient: _initialOnly, ...updatable } = fields;
  void _initialOnly;
  const updateById = async (id: string) => {
    const { data, error } = await supabase
      .from("ref_legendes")
      .update(updatable)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false as const, error: legendWriteError(error.message) };
    if (!data) return { ok: false as const, error: "Enregistrement refusé (droits)." };
    revalidateHr();
    return { ok: true as const, data: { id: data.id } };
  };

  if (p.id) {
    const { data: current, error: readErr } = await supabase
      .from("ref_legendes")
      .select("code")
      .eq("id", p.id)
      .maybeSingle();
    if (readErr) return { ok: false, error: legendWriteError(readErr.message) };
    if (current && current.code === p.code) return updateById(p.id);
  }

  const { data: sameCode, error: sameErr } = await supabase
    .from("ref_legendes")
    .select("id")
    .eq("code", p.code)
    .maybeSingle();
  if (sameErr) return { ok: false, error: legendWriteError(sameErr.message) };
  if (sameCode) {
    return {
      ok: false,
      error: "Ce code existe déjà. Sélectionnez-le dans la liste pour modifier son coefficient.",
    };
  }

  const { data, error } = await supabase
    .from("ref_legendes")
    .insert({ ...fields, code: p.code, is_system: false })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: legendWriteError(error.message) };
  if (!data) return { ok: false, error: "Enregistrement refusé (droits)." };
  revalidateHr();
  return { ok: true, data: { id: data.id } };
}
