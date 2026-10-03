"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { createClient } from "@/lib/supabase/server";
import { ACCESS_KEYS } from "@/lib/ui/registry";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export type AccessUser = {
  id: string;
  full_name: string;
  email: string;
  status: string;
  roles: string[];
  superAdmin: boolean;
  /** null: no custom access, the account follows its roles. */
  allowed: string[] | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireSuperAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const ws = await getWorkspaceProfile();
  if (!ws) return { ok: false, error: "Session expirée." };
  if (!ws.isSuperAdmin) return { ok: false, error: "Réservé au SUPER_ADMIN." };
  return { ok: true };
}

const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export async function loadUserAccess(): Promise<ActionResult<AccessUser[]>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const [users, links, access] = await Promise.all([
    supabase.from("sys_users").select("id, full_name, email, status").order("full_name"),
    supabase.from("sys_user_site_roles").select("user_id, role:sys_roles ( code )"),
    supabase.from("sys_ui_user_access").select("user_id, allowed"),
  ]);
  const failed = users.error ?? links.error ?? access.error;
  if (failed) {
    return {
      ok: false,
      error: /sys_ui_user_access/.test(failed.message)
        ? "Table des accès absente : appliquez la migration 20261023100000_ui_user_access."
        : failed.message,
    };
  }
  const roles = new Map<string, Set<string>>();
  for (const l of links.data ?? []) {
    const code = one(l.role as { code: string } | { code: string }[] | null)?.code;
    if (!code) continue;
    const set = roles.get(l.user_id) ?? new Set<string>();
    set.add(code);
    roles.set(l.user_id, set);
  }
  const allowed = new Map((access.data ?? []).map((a) => [a.user_id as string, (a.allowed as string[]) ?? []]));
  return {
    ok: true,
    data: (users.data ?? []).map((u) => {
      const codes = [...(roles.get(u.id) ?? [])].sort();
      return {
        id: u.id,
        full_name: u.full_name,
        email: String(u.email),
        status: String(u.status),
        roles: codes,
        superAdmin: codes.includes("SUPER_ADMIN"),
        allowed: allowed.get(u.id) ?? null,
      };
    }),
  };
}

/** `allowed: null` removes the custom access (the account follows its roles again). */
export async function saveUserAccess(input: { userId: string; allowed: string[] | null }): Promise<ActionResult> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  if (!UUID_RE.test(input.userId)) return { ok: false, error: "Compte invalide." };
  const supabase = await createClient();
  if (input.allowed === null) {
    const { error } = await supabase.from("sys_ui_user_access").delete().eq("user_id", input.userId);
    if (error) return { ok: false, error: error.message };
  } else {
    const allowed = [...new Set(input.allowed)].filter((k) => ACCESS_KEYS.has(k)).sort();
    const { error } = await supabase
      .from("sys_ui_user_access")
      .upsert({ user_id: input.userId, allowed }, { onConflict: "user_id" });
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
