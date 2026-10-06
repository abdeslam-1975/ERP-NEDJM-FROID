"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { VIEW_AS_COOKIE, getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { PERM_FIELDS } from "@/lib/auth/rbac-fields";
import {
  NON_DELEGABLE_SCREENS,
  NO_RIGHTS,
  RIGHTS_ITEM_KEYS,
  TWIN_KEYS,
  type PermFlags,
  type RoleRightsPayload,
  type ScreenInfo,
} from "@/lib/auth/role-rights";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export type RoleRightsRole = {
  id: string;
  code: string;
  label: string;
  users: number;
  sitesOnly: boolean;
  siteScopedAllowed: boolean;
  hidden: string[];
  perms: Record<string, PermFlags>;
};

export type RoleRightsData = {
  canEdit: boolean;
  roles: RoleRightsRole[];
  screens: ScreenInfo[];
  /** Catalogue keys already reviewed (empty: nothing is new). */
  seen: string[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function withTwins(keys: string[]): string[] {
  return [...new Set(keys.flatMap((k) => [k, ...(TWIN_KEYS[k] ?? [])]))];
}

export async function loadRoleRights(): Promise<ActionResult<RoleRightsData>> {
  const ws = await getWorkspaceProfile();
  if (!ws) return { ok: false, error: "Session expirée." };
  const canRead = ws.isSuperAdmin || ws.roles.some((r) => r.roleCode === "GERANT");
  if (!canRead) return { ok: false, error: "Réservé au SUPER_ADMIN et au gérant." };
  const supabase = await createClient();
  const [roles, links, users, hidden, screens, perms, seen] = await Promise.all([
    supabase
      .from("sys_roles")
      .select("id, code, label_fr, site_scoped_allowed, sites_only, is_active")
      .order("hierarchy_level", { ascending: false }),
    supabase.from("sys_user_site_roles").select("user_id, role_id"),
    supabase.from("sys_users").select("id").eq("status", "ACTIVE"),
    supabase.from("sys_ui_role_hidden").select("role_id, item_key"),
    supabase.from("sys_screens").select("id, code, module, label_fr").eq("is_active", true).order("sort_order"),
    supabase.from("sys_permissions").select(`role_id, screen_id, ${PERM_FIELDS.join(", ")}`),
    supabase.from("sys_ui_catalog_seen").select("item_key"),
  ]);
  const failed = roles.error ?? links.error ?? users.error ?? hidden.error ?? screens.error ?? perms.error ?? seen.error;
  if (failed) {
    return {
      ok: false,
      error: /sites_only|sys_ui_catalog_seen/.test(failed.message)
        ? "La migration 20261030090000_role_rights n'est pas encore appliquée."
        : failed.message,
    };
  }

  let seenKeys = (seen.data ?? []).map((r) => r.item_key as string);
  if (!seenKeys.length && ws.isSuperAdmin) {
    const rows = [...RIGHTS_ITEM_KEYS].map((item_key) => ({ item_key }));
    const { error } = await supabase.from("sys_ui_catalog_seen").upsert(rows, { onConflict: "item_key", ignoreDuplicates: true });
    if (!error) seenKeys = [...RIGHTS_ITEM_KEYS];
  }

  const active = new Set((users.data ?? []).map((u) => u.id as string));
  const counts = new Map<string, Set<string>>();
  for (const l of links.data ?? []) {
    if (!active.has(l.user_id)) continue;
    counts.set(l.role_id, (counts.get(l.role_id) ?? new Set()).add(l.user_id));
  }
  const screenCode = new Map((screens.data ?? []).map((s) => [s.id as string, s.code as string]));
  const permRows = (perms.data ?? []) as unknown as ({ role_id: string; screen_id: string } & PermFlags)[];

  return {
    ok: true,
    data: {
      canEdit: ws.isSuperAdmin,
      seen: seenKeys,
      screens: (screens.data ?? []).map((s) => ({ code: s.code, module: s.module, label_fr: s.label_fr })),
      roles: (roles.data ?? [])
        .filter((r) => r.is_active && r.code !== "SUPER_ADMIN")
        .map((r) => {
          const rolePerms: Record<string, PermFlags> = {};
          for (const p of permRows) {
            const code = p.role_id === r.id ? screenCode.get(p.screen_id) : undefined;
            if (!code) continue;
            rolePerms[code] = Object.fromEntries(PERM_FIELDS.map((f) => [f, Boolean(p[f])])) as PermFlags;
          }
          return {
            id: r.id,
            code: r.code,
            label: r.label_fr,
            users: counts.get(r.id)?.size ?? 0,
            sitesOnly: Boolean(r.sites_only),
            siteScopedAllowed: Boolean(r.site_scoped_allowed),
            hidden: (hidden.data ?? []).filter((h) => h.role_id === r.id).map((h) => h.item_key),
            perms: rolePerms,
          };
        }),
    },
  };
}

export async function saveRoleRights(input: { role_id: string; payload: RoleRightsPayload }): Promise<ActionResult> {
  const ws = await getWorkspaceProfile();
  if (!ws) return { ok: false, error: "Session expirée." };
  if (!ws.isSuperAdmin) return { ok: false, error: "Réservé au SUPER_ADMIN." };
  if (!UUID_RE.test(input.role_id)) return { ok: false, error: "Rôle invalide." };
  const { hide, show, perms, sitesOnly, reviewed } = input.payload;
  for (const key of [...hide, ...show, ...reviewed]) {
    if (!RIGHTS_ITEM_KEYS.has(key)) return { ok: false, error: `Élément inconnu : ${key}` };
  }
  if (hide.some((k) => show.includes(k))) return { ok: false, error: "Élément à la fois ouvert et fermé." };

  const supabase = await createClient();
  const { data: role, error: roleError } = await supabase
    .from("sys_roles")
    .select("id, code, label_fr, site_scoped_allowed, sites_only")
    .eq("id", input.role_id)
    .maybeSingle();
  if (roleError) return { ok: false, error: roleError.message };
  if (!role) return { ok: false, error: "Rôle introuvable." };
  if (role.code === "SUPER_ADMIN") return { ok: false, error: "Le SUPER_ADMIN a toujours tous les droits." };

  const screenRows: { screen_id: string; flags: PermFlags }[] = [];
  if (perms.length) {
    const { data: screens, error } = await supabase
      .from("sys_screens")
      .select("id, code")
      .eq("is_active", true)
      .in("code", perms.map((p) => p.screen));
    if (error) return { ok: false, error: error.message };
    const ids = new Map((screens ?? []).map((s) => [s.code as string, s.id as string]));
    for (const p of perms) {
      const id = ids.get(p.screen);
      if (!id || NON_DELEGABLE_SCREENS.includes(p.screen)) return { ok: false, error: `Écran non modifiable : ${p.screen}` };
      const flags = { ...NO_RIGHTS };
      for (const f of PERM_FIELDS) flags[f] = p.flags[f] === true;
      if (PERM_FIELDS.some((f) => flags[f])) flags.can_read = true;
      screenRows.push({ screen_id: id, flags });
    }
  }

  if (sitesOnly !== null && sitesOnly !== role.sites_only) {
    if (sitesOnly && !role.site_scoped_allowed) {
      return { ok: false, error: `Le rôle ${role.label_fr} ne peut pas être lié à un chantier.` };
    }
    const { error } = await supabase.from("sys_roles").update({ sites_only: sitesOnly }).eq("id", role.id);
    if (error) return { ok: false, error: error.message };
  }

  const hideKeys = withTwins(hide);
  const showKeys = withTwins(show);
  if (hideKeys.length) {
    const { error } = await supabase
      .from("sys_ui_role_hidden")
      .upsert(hideKeys.map((item_key) => ({ role_id: role.id, item_key })), { onConflict: "role_id,item_key", ignoreDuplicates: true });
    if (error) return { ok: false, error: error.message };
  }
  if (showKeys.length) {
    const { error } = await supabase.from("sys_ui_role_hidden").delete().eq("role_id", role.id).in("item_key", showKeys);
    if (error) return { ok: false, error: error.message };
  }

  if (screenRows.length) {
    const { error } = await supabase
      .from("sys_permissions")
      .upsert(screenRows.map((r) => ({ role_id: role.id, screen_id: r.screen_id, ...r.flags })), { onConflict: "role_id,screen_id" });
    if (error) return { ok: false, error: error.message };
  }

  const reviewedKeys = withTwins(reviewed);
  if (reviewedKeys.length) {
    const { data: others, error: othersError } = await supabase
      .from("sys_roles")
      .select("id")
      .neq("code", "SUPER_ADMIN")
      .neq("id", role.id);
    if (othersError) return { ok: false, error: othersError.message };
    const rows = (others ?? []).flatMap((o) => reviewedKeys.map((item_key) => ({ role_id: o.id as string, item_key })));
    if (rows.length) {
      const { error } = await supabase.from("sys_ui_role_hidden").upsert(rows, { onConflict: "role_id,item_key", ignoreDuplicates: true });
      if (error) return { ok: false, error: error.message };
    }
    const { error } = await supabase
      .from("sys_ui_catalog_seen")
      .upsert(reviewedKeys.map((item_key) => ({ item_key })), { onConflict: "item_key", ignoreDuplicates: true });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function startViewAs(roleId: string): Promise<ActionResult> {
  const ws = await getWorkspaceProfile();
  if (!ws) return { ok: false, error: "Session expirée." };
  if (!ws.isSuperAdmin && !ws.viewAs) return { ok: false, error: "Réservé au SUPER_ADMIN." };
  if (!UUID_RE.test(roleId)) return { ok: false, error: "Rôle invalide." };
  const supabase = await createClient();
  const { data: role, error } = await supabase.from("sys_roles").select("code, is_active").eq("id", roleId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!role || !role.is_active || role.code === "SUPER_ADMIN") return { ok: false, error: "Rôle introuvable ou inactif." };
  (await cookies()).set(VIEW_AS_COOKIE, roleId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 4 * 60 * 60,
  });
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function stopViewAs(): Promise<ActionResult> {
  (await cookies()).delete(VIEW_AS_COOKIE);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
