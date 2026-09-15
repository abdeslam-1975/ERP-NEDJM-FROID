import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type {
  WorkspaceProfile,
  WorkspaceRole,
  WorkspaceSite,
} from "@/lib/auth/types";

export const ACTIVE_SITE_COOKIE = "nf_active_site_id";

type RoleJoin = {
  id: string;
  code: string;
  label_fr: string;
  hierarchy_level: number;
  require_mfa: boolean;
};

type SiteJoin = {
  id: string;
  code: string;
  name_fr: string;
  name_ar: string | null;
  wilaya: string | null;
  is_active: boolean;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Loads auth.users + sys_users + sys_user_site_roles + ref_sites.
 * Site scoping uses ref_sites (Phase 1A schema) — there is no sys_sites table.
 */
export async function getWorkspaceProfile(): Promise<WorkspaceProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("sys_users")
    .select("id, email, full_name, status, locale")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return null;
  }

  if (profile.status !== "ACTIVE") {
    return null;
  }

  const { data: assignments, error: assignError } = await supabase
    .from("sys_user_site_roles")
    .select(
      `
      id,
      site_id,
      role:sys_roles ( id, code, label_fr, hierarchy_level, require_mfa ),
      site:ref_sites ( id, code, name_fr, name_ar, wilaya, is_active )
    `,
    )
    .eq("user_id", user.id);

  if (assignError) {
    return {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      status: profile.status,
      locale: profile.locale,
      isSuperAdmin: false,
      roles: [],
      accessibleSites: [],
      activeSite: null,
      hasGlobalScope: false,
    };
  }

  const rows = assignments ?? [];

  const roles: WorkspaceRole[] = rows.map((row) => {
    const role = one(row.role as RoleJoin | RoleJoin[] | null);
    const site = one(row.site as SiteJoin | SiteJoin[] | null);
    return {
      assignmentId: row.id as string,
      roleId: role?.id ?? "",
      roleCode: role?.code ?? "UNKNOWN",
      roleLabelFr: role?.label_fr ?? "Rôle inconnu",
      hierarchyLevel: role?.hierarchy_level ?? 0,
      requireMfa: role?.require_mfa ?? false,
      siteId: (row.site_id as string | null) ?? null,
      siteCode: site?.code ?? null,
      siteNameFr: site?.name_fr ?? null,
      siteNameAr: site?.name_ar ?? null,
    };
  });

  const isSuperAdmin = roles.some(
    (r) => r.roleCode === "SUPER_ADMIN" && r.siteId === null,
  );
  const hasGlobalScope = roles.some((r) => r.siteId === null);

  let accessibleSites: WorkspaceSite[] = [];

  if (isSuperAdmin || hasGlobalScope) {
    const { data: allSites, error: sitesError } = await supabase
      .from("ref_sites")
      .select("id, code, name_fr, name_ar, wilaya")
      .eq("is_active", true)
      .order("code");

    if (!sitesError) {
      accessibleSites =
        allSites?.map((s) => ({
          id: s.id,
          code: s.code,
          nameFr: s.name_fr,
          nameAr: s.name_ar,
          wilaya: s.wilaya,
        })) ?? [];
    }
  } else {
    const seen = new Set<string>();
    for (const row of rows) {
      const site = one(row.site as SiteJoin | SiteJoin[] | null);
      if (!site || !site.is_active || seen.has(site.id)) continue;
      seen.add(site.id);
      accessibleSites.push({
        id: site.id,
        code: site.code,
        nameFr: site.name_fr,
        nameAr: site.name_ar,
        wilaya: site.wilaya,
      });
    }
  }

  const cookieStore = await cookies();
  const preferredSiteId = cookieStore.get(ACTIVE_SITE_COOKIE)?.value ?? null;
  const activeSite =
    accessibleSites.find((s) => s.id === preferredSiteId) ??
    accessibleSites[0] ??
    null;

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    status: profile.status,
    locale: profile.locale,
    isSuperAdmin,
    roles,
    accessibleSites,
    activeSite,
    hasGlobalScope,
  };
}
