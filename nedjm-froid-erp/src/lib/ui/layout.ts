import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { EMPTY_USER_PREFS, parseDesign, parseUserPrefs } from "@/lib/ui/design";
import { ACCESS_KEYS, hiddenKeysForAccess } from "@/lib/ui/registry";
import {
  DEFAULT_LAYOUT,
  EMPTY_THEME,
  hiddenKeysForRoles,
  isHexColor,
  type UiLayoutData,
  type UiOverride,
  type UiPersonalOrder,
  type UiTheme,
} from "@/lib/ui/resolve";

type PersonalRow = { item_key: string; sort_order: number; group_key: string | null; label_fr?: string | null };

/** The user's own order; without the label_fr column (migration 20261015090000 not applied) the names are left out. */
async function readPersonalOrder(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const withLabels = await supabase
    .from("sys_ui_user_order")
    .select("item_key, sort_order, group_key, label_fr")
    .eq("user_id", userId);
  if (!withLabels.error) return { data: (withLabels.data ?? []) as PersonalRow[], error: null };
  const plain = await supabase.from("sys_ui_user_order").select("item_key, sort_order, group_key").eq("user_id", userId);
  return { data: (plain.data ?? []) as PersonalRow[], error: plain.error };
}

/**
 * Interface choices for the signed-in user, read once per request. Any read failure (for example the
 * sys_ui_* tables not migrated yet) falls back to the default interface: everything visible, default look.
 */
export const getUiLayout = cache(async function getUiLayout(): Promise<UiLayoutData> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return DEFAULT_LAYOUT;
  const supabase = await createClient();
  const roleIds = [...new Set(workspace.roles.map((r) => r.roleId))];
  try {
    const [hiddenRes, accessRes, overridesRes, themeRes, prefsRes, personalRes] = await Promise.all([
      workspace.isSuperAdmin || !roleIds.length
        ? Promise.resolve({ data: [] as { role_id: string; item_key: string }[], error: null })
        : supabase.from("sys_ui_role_hidden").select("role_id, item_key").in("role_id", roleIds),
      workspace.isSuperAdmin
        ? Promise.resolve({ data: null as { allowed: string[] } | null, error: null })
        : supabase.from("sys_ui_user_access").select("allowed").eq("user_id", workspace.id).maybeSingle(),
      supabase.from("sys_ui_item_overrides").select("item_key, sort_order, label_fr, label_ar, group_key"),
      // "*" so that a database without the design columns still returns the colours.
      supabase.from("sys_ui_theme").select("*").eq("id", 1).maybeSingle(),
      supabase.from("sys_ui_user_prefs").select("mode, density").eq("user_id", workspace.id).maybeSingle(),
      readPersonalOrder(supabase, workspace.id),
    ]);
    const overrides: Record<string, UiOverride> = {};
    if (!overridesRes.error) {
      for (const row of overridesRes.data ?? []) {
        overrides[row.item_key] = {
          sort_order: row.sort_order,
          label_fr: row.label_fr,
          label_ar: row.label_ar,
          group_key: row.group_key,
        };
      }
    }
    const personal: Record<string, UiPersonalOrder> = {};
    if (!personalRes.error) {
      for (const row of personalRes.data ?? []) {
        personal[row.item_key] = { sort_order: row.sort_order, group_key: row.group_key, label_fr: row.label_fr ?? null };
      }
    }
    const raw = themeRes.error ? null : (themeRes.data as (UiTheme & Record<string, unknown>) | null);
    const theme: UiTheme = raw
      ? {
          brand_color: isHexColor(raw.brand_color) ? raw.brand_color : null,
          sidebar_color: isHexColor(raw.sidebar_color) ? raw.sidebar_color : null,
          app_name: raw.app_name?.trim() || null,
          app_subtitle: raw.app_subtitle?.trim() || null,
        }
      : EMPTY_THEME;
    const roleHidden = hiddenRes.error ? [] : hiddenKeysForRoles(hiddenRes.data ?? [], roleIds);
    const access = accessRes.error ? null : accessRes.data;
    return {
      unrestricted: workspace.isSuperAdmin,
      hidden: access
        ? [...roleHidden.filter((key) => !ACCESS_KEYS.has(key)), ...hiddenKeysForAccess(access.allowed ?? [])]
        : roleHidden,
      overrides,
      personal,
      theme,
      design: parseDesign(raw),
      prefs: prefsRes.error ? EMPTY_USER_PREFS : parseUserPrefs(prefsRes.data),
    };
  } catch {
    return { ...DEFAULT_LAYOUT, unrestricted: workspace.isSuperAdmin };
  }
});
