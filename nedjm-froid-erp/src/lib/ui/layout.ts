import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import {
  DEFAULT_LAYOUT,
  EMPTY_THEME,
  hiddenKeysForRoles,
  isHexColor,
  type UiLayoutData,
  type UiOverride,
  type UiTheme,
} from "@/lib/ui/resolve";

/**
 * Interface choices for the signed-in user, read once per request. Any read failure (for example the
 * sys_ui_* tables not migrated yet) falls back to the default interface: everything visible.
 */
export const getUiLayout = cache(async function getUiLayout(): Promise<UiLayoutData> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return DEFAULT_LAYOUT;
  const supabase = await createClient();
  const roleIds = [...new Set(workspace.roles.map((r) => r.roleId))];
  try {
    const [hiddenRes, overridesRes, themeRes] = await Promise.all([
      workspace.isSuperAdmin || !roleIds.length
        ? Promise.resolve({ data: [] as { role_id: string; item_key: string }[], error: null })
        : supabase.from("sys_ui_role_hidden").select("role_id, item_key").in("role_id", roleIds),
      supabase.from("sys_ui_item_overrides").select("item_key, sort_order, label_fr, label_ar, group_key"),
      supabase.from("sys_ui_theme").select("brand_color, sidebar_color, app_name, app_subtitle").eq("id", 1).maybeSingle(),
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
    const raw = themeRes.error ? null : (themeRes.data as UiTheme | null);
    const theme: UiTheme = raw
      ? {
          brand_color: isHexColor(raw.brand_color) ? raw.brand_color : null,
          sidebar_color: isHexColor(raw.sidebar_color) ? raw.sidebar_color : null,
          app_name: raw.app_name?.trim() || null,
          app_subtitle: raw.app_subtitle?.trim() || null,
        }
      : EMPTY_THEME;
    return {
      unrestricted: workspace.isSuperAdmin,
      hidden: hiddenRes.error ? [] : hiddenKeysForRoles(hiddenRes.data ?? [], roleIds),
      overrides,
      theme,
    };
  } catch {
    return { ...DEFAULT_LAYOUT, unrestricted: workspace.isSuperAdmin };
  }
});
