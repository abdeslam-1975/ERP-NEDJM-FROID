"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { createClient } from "@/lib/supabase/server";
import { findItem, findTabset, isGroupKey, keysOfTabset } from "@/lib/ui/registry";
import { DESIGN_OPTIONS, isDesignValue, parseDesign, type DesignSettings } from "@/lib/ui/design";
import { EMPTY_THEME, isHexColor, type UiOverride, type UiTheme } from "@/lib/ui/resolve";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export type UiControlRole = { id: string; code: string; label_fr: string; label_ar: string | null; is_active: boolean };

export type UiControlData = {
  roles: UiControlRole[];
  hidden: { role_id: string; item_key: string }[];
  overrides: Record<string, UiOverride>;
  theme: UiTheme;
  design: DesignSettings | null;
  /** False while migration 20261013090000_ui_design is not applied (only the colours can be saved). */
  designReady: boolean;
};

async function requireSuperAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const ws = await getWorkspaceProfile();
  if (!ws) return { ok: false, error: "Session expirée." };
  if (!ws.isSuperAdmin) return { ok: false, error: "Réservé au SUPER_ADMIN." };
  return { ok: true };
}

function done() {
  revalidatePath("/", "layout");
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export async function loadUiControl(): Promise<ActionResult<UiControlData>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const [roles, hidden, overrides, theme] = await Promise.all([
    supabase.from("sys_roles").select("id, code, label_fr, label_ar, is_active").order("hierarchy_level", { ascending: false }),
    supabase.from("sys_ui_role_hidden").select("role_id, item_key"),
    supabase.from("sys_ui_item_overrides").select("item_key, sort_order, label_fr, label_ar, group_key"),
    supabase.from("sys_ui_theme").select("*").eq("id", 1).maybeSingle(),
  ]);
  const failed = roles.error ?? hidden.error ?? overrides.error ?? theme.error;
  if (failed) {
    return {
      ok: false,
      error: /sys_ui_/.test(failed.message)
        ? "Les tables de l'interface ne sont pas encore installées : appliquez la migration 20261012090000_ui_control."
        : failed.message,
    };
  }
  const themeRow = theme.data as (UiTheme & Record<string, unknown>) | null;
  const map: Record<string, UiOverride> = {};
  for (const row of overrides.data ?? []) {
    map[row.item_key] = { sort_order: row.sort_order, label_fr: row.label_fr, label_ar: row.label_ar, group_key: row.group_key };
  }
  return {
    ok: true,
    data: {
      roles: roles.data ?? [],
      hidden: hidden.data ?? [],
      overrides: map,
      theme: themeRow
        ? {
            brand_color: themeRow.brand_color ?? null,
            sidebar_color: themeRow.sidebar_color ?? null,
            app_name: themeRow.app_name ?? null,
            app_subtitle: themeRow.app_subtitle ?? null,
          }
        : EMPTY_THEME,
      design: parseDesign(themeRow),
      designReady: themeRow ? "button_style" in themeRow : false,
    },
  };
}

export async function setRoleItemsHidden(input: {
  role_id: string;
  item_keys: string[];
  hidden: boolean;
}): Promise<ActionResult<{ count: number }>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  const keys = [...new Set(input.item_keys)];
  if (!keys.length) return { ok: true, data: { count: 0 } };
  for (const key of keys) {
    const found = findItem(key);
    if (!found) return { ok: false, error: `Élément inconnu : ${key}` };
    if (found.item.locked && input.hidden) return { ok: false, error: `« ${found.item.labelFr} » ne peut pas être masqué.` };
  }
  const supabase = await createClient();
  const { data: role, error: roleError } = await supabase.from("sys_roles").select("id, code").eq("id", input.role_id).maybeSingle();
  if (roleError) return { ok: false, error: roleError.message };
  if (!role) return { ok: false, error: "Rôle introuvable." };
  if (role.code === "SUPER_ADMIN") return { ok: false, error: "Le SUPER_ADMIN voit toujours toute l'interface." };

  if (input.hidden) {
    const rows = keys.map((item_key) => ({ role_id: role.id, item_key }));
    const { error } = await supabase
      .from("sys_ui_role_hidden")
      .upsert(rows, { onConflict: "role_id,item_key", ignoreDuplicates: true });
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("sys_ui_role_hidden").delete().eq("role_id", role.id).in("item_key", keys);
    if (error) return { ok: false, error: error.message };
  }
  done();
  return { ok: true, data: { count: keys.length } };
}

export async function saveTabsetLayout(input: {
  tabset: string;
  items: { key: string; label_fr?: string | null; label_ar?: string | null; group_key?: string | null }[];
}): Promise<ActionResult<{ count: number }>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  const allowed = keysOfTabset(input.tabset);
  if (!allowed) return { ok: false, error: "Liste d'onglets inconnue." };
  const fixedLabels = findTabset(input.tabset)?.kind === "toolbar";
  const seen = new Set<string>();
  const rows = [];
  for (const [index, item] of input.items.entries()) {
    if (!allowed.includes(item.key) || seen.has(item.key)) return { ok: false, error: `Élément invalide : ${item.key}` };
    seen.add(item.key);
    const group = input.tabset === "nav" ? (item.group_key ?? null) : null;
    if (group !== null && !isGroupKey(group)) return { ok: false, error: `Groupe inconnu : ${group}` };
    const defaultGroup = input.tabset === "nav" ? findItem(item.key)?.item.group : undefined;
    rows.push({
      item_key: item.key,
      sort_order: (index + 1) * 10,
      label_fr: fixedLabels ? null : cleanText(item.label_fr, 80),
      label_ar: fixedLabels ? null : cleanText(item.label_ar, 80),
      group_key: group && group !== defaultGroup ? group : null,
    });
  }
  const supabase = await createClient();
  const { error } = await supabase.from("sys_ui_item_overrides").upsert(rows, { onConflict: "item_key" });
  if (error) return { ok: false, error: error.message };
  done();
  return { ok: true, data: { count: rows.length } };
}

export async function resetTabsetLayout(input: { tabset: string }): Promise<ActionResult> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  const keys = keysOfTabset(input.tabset);
  if (!keys) return { ok: false, error: "Liste d'onglets inconnue." };
  const supabase = await createClient();
  const { error } = await supabase.from("sys_ui_item_overrides").delete().in("item_key", keys);
  if (error) return { ok: false, error: error.message };
  done();
  return { ok: true, data: undefined };
}

const DESIGN_KEYS = Object.keys(DESIGN_OPTIONS) as (keyof typeof DESIGN_OPTIONS)[];

/**
 * Colours, names and look. `design: null` brings back the original appearance (every column null);
 * with `designReady: false` (migration not applied) only the colours and names are written.
 */
export async function saveUiDesign(input: {
  theme: UiTheme;
  design: DesignSettings | null;
  designReady: boolean;
}): Promise<ActionResult<{ theme: UiTheme; design: DesignSettings | null }>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  for (const color of [input.theme.brand_color, input.theme.sidebar_color]) {
    if (color !== null && !isHexColor(color)) return { ok: false, error: "Couleur invalide (format #RRGGBB)." };
  }
  const theme: UiTheme = {
    brand_color: input.theme.brand_color,
    sidebar_color: input.theme.sidebar_color,
    app_name: cleanText(input.theme.app_name, 40),
    app_subtitle: cleanText(input.theme.app_subtitle, 60),
  };
  const row: Record<string, unknown> = { id: 1, ...theme };
  if (input.designReady) {
    const design = input.design;
    if (design) {
      for (const key of DESIGN_KEYS) {
        if (!isDesignValue(key, design[key])) return { ok: false, error: `Valeur invalide : ${key}` };
      }
      if (typeof design.animations !== "boolean") return { ok: false, error: "Valeur invalide : animations" };
    }
    for (const key of DESIGN_KEYS) row[key] = design ? design[key] : null;
    row.animations = design ? design.animations : null;
  }
  const supabase = await createClient();
  const { error } = await supabase.from("sys_ui_theme").upsert(row, { onConflict: "id" });
  if (error) return { ok: false, error: error.message };
  done();
  return { ok: true, data: { theme, design: input.design } };
}
