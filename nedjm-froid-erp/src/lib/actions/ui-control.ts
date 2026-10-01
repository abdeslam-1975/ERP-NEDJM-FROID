"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { createClient } from "@/lib/supabase/server";
import { NAV_GROUPS_TABSET, UI_NAV_GROUPS, findItem, findTabset, isGroupKey, itemKey } from "@/lib/ui/registry";
import { EMPTY_THEME, isHexColor, type UiOverride, type UiTheme } from "@/lib/ui/resolve";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export type UiControlRole = { id: string; code: string; label_fr: string; label_ar: string | null; is_active: boolean };

export type UiControlData = {
  roles: UiControlRole[];
  hidden: { role_id: string; item_key: string }[];
  overrides: Record<string, UiOverride>;
  theme: UiTheme;
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

function keysOfTabset(tabset: string): string[] | null {
  if (tabset === NAV_GROUPS_TABSET) return UI_NAV_GROUPS.map((g) => g.key);
  const def = findTabset(tabset);
  return def ? def.items.map((i) => itemKey(def.key, i.id)) : null;
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
    supabase.from("sys_ui_theme").select("brand_color, sidebar_color, app_name, app_subtitle").eq("id", 1).maybeSingle(),
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
      theme: (theme.data as UiTheme | null) ?? EMPTY_THEME,
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
      label_fr: cleanText(item.label_fr, 80),
      label_ar: cleanText(item.label_ar, 80),
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

export async function saveUiTheme(input: UiTheme): Promise<ActionResult<UiTheme>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  for (const color of [input.brand_color, input.sidebar_color]) {
    if (color !== null && !isHexColor(color)) return { ok: false, error: "Couleur invalide (format #RRGGBB)." };
  }
  const theme: UiTheme = {
    brand_color: input.brand_color,
    sidebar_color: input.sidebar_color,
    app_name: cleanText(input.app_name, 40),
    app_subtitle: cleanText(input.app_subtitle, 60),
  };
  const supabase = await createClient();
  const { error } = await supabase.from("sys_ui_theme").upsert({ id: 1, ...theme }, { onConflict: "id" });
  if (error) return { ok: false, error: error.message };
  done();
  return { ok: true, data: theme };
}
