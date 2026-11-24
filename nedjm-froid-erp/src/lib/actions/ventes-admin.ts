"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { workspaceHasRole } from "@/lib/auth/require-roles";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { VentesClientOption } from "@/lib/actions/ventes";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export type VentesAdminUser = {
  id: string;
  email: string;
  name: string;
  status: string;
  ventes_active: boolean;
  can_saisie: boolean;
  can_emit: boolean;
  can_encaisser: boolean;
  can_cancel: boolean;
  can_admin: boolean;
  can_export: boolean;
  is_finance_admin: boolean;
};

export type VentesListItem = {
  id: string;
  list_key: "BANK_EXPECTED" | "ETABLIE_PAR" | "PAYMENT_MODE" | string;
  label: string;
  sort_order: number;
  active: boolean;
};

export type VentesAdminDefaults = {
  tax_rate: number;
  retention_rate: number;
  stamp_amount: number;
};

export type VentesAdminBundle = {
  users: VentesAdminUser[];
  clients: VentesClientOption[];
  lists: VentesListItem[];
  defaults: VentesAdminDefaults;
  canManageAdmin: boolean;
};

function fail(error: { message: string; code?: string } | string): ActionResult<never> {
  const message = typeof error === "string" ? error : error.message;
  const code = typeof error === "string" ? undefined : error.code;
  if (code === "23505") {
    return { ok: false, error: "Cette valeur existe déjà." };
  }
  return {
    ok: false,
    error:
      code === "42501" || message.toLowerCase().includes("permission")
        ? "Accès refusé (droits Admin Ventes)."
        : message,
  };
}

function refresh() {
  revalidatePath("/ventes");
}

async function rpcBool(
  supabase: Awaited<ReturnType<typeof createClient>>,
  name: "sal_can" | "sal_is_admin",
  args?: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await supabase.rpc(name, args ?? {});
  if (error) return false;
  return !!data;
}

async function requireVentesAdmin(): Promise<
  ActionResult<{ workspace: NonNullable<Awaited<ReturnType<typeof getWorkspaceProfile>>> }>
> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return fail("Session requise.");
  const supabase = await createClient();
  const isAdmin = await rpcBool(supabase, "sal_is_admin");
  if (
    !isAdmin &&
    !workspace.isSuperAdmin &&
    !workspaceHasRole(workspace, ["ADMIN_FINANCE", "GERANT"])
  ) {
    return fail("Réservé à l'administrateur Ventes.");
  }
  return { ok: true, data: { workspace } };
}

function mapClient(c: Record<string, unknown>): VentesClientOption {
  return {
    id: String(c.id),
    nom_fr: String(c.nom_fr ?? ""),
    adresse: c.adresse ? String(c.adresse) : null,
    nif: c.nif ? String(c.nif) : null,
    article_imposition: c.article_imposition ? String(c.article_imposition) : null,
    rc: c.rc ? String(c.rc) : null,
    telephone: c.telephone ? String(c.telephone) : null,
  };
}

export async function getVentesAdmin(): Promise<ActionResult<VentesAdminBundle>> {
  const gate = await requireVentesAdmin();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  const [usersRes, rightsRes, clientsRes, listsRes, settingsRes, linksRes] = await Promise.all([
    supabase.from("sys_users").select("id, email, full_name, status").order("full_name"),
    supabase
      .from("sal_rights")
      .select(
        "user_id, ventes_active, can_saisie, can_emit, can_encaisser, can_cancel, can_admin, can_export",
      ),
    supabase
      .from("ref_clients")
      .select("id, nom_fr, adresse, nif, article_imposition, rc, telephone")
      .order("nom_fr")
      .limit(3000),
    supabase
      .from("sal_lists")
      .select("id, list_key, label, sort_order, active")
      .order("list_key")
      .order("sort_order")
      .order("label"),
    supabase.from("sal_settings").select("key, value").eq("key", "defaults").maybeSingle(),
    supabase.from("sys_user_site_roles").select("user_id, role:sys_roles ( code )"),
  ]);

  if (usersRes.error) return fail(usersRes.error);
  if (rightsRes.error) return fail(rightsRes.error);
  if (clientsRes.error) return fail(clientsRes.error);
  if (listsRes.error) return fail(listsRes.error);
  if (settingsRes.error) return fail(settingsRes.error);
  if (linksRes.error) return fail(linksRes.error);

  const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const financeByUser = new Map<string, boolean>();
  for (const link of linksRes.data ?? []) {
    const code = one(link.role as { code: string } | { code: string }[] | null)?.code;
    if (!code) continue;
    if (["SUPER_ADMIN", "ADMIN_FINANCE", "GERANT"].includes(code)) {
      financeByUser.set(link.user_id, true);
    }
  }

  const rightsByUser = new Map(
    (rightsRes.data ?? []).map((r) => [String(r.user_id), r] as const),
  );

  const users: VentesAdminUser[] = [];
  for (const u of usersRes.data ?? []) {
    const rights = rightsByUser.get(u.id);
    const isFinance = financeByUser.get(u.id) === true;
    if (!rights && !isFinance) continue;
    users.push({
      id: u.id,
      email: String(u.email ?? ""),
      name: String(u.full_name ?? ""),
      status: String(u.status ?? "ACTIVE"),
      ventes_active: rights ? !!rights.ventes_active : isFinance,
      can_saisie: rights ? !!rights.can_saisie : isFinance,
      can_emit: rights ? !!rights.can_emit : isFinance,
      can_encaisser: rights ? !!rights.can_encaisser : isFinance,
      can_cancel: rights ? !!rights.can_cancel : isFinance,
      can_admin: rights ? !!rights.can_admin : isFinance,
      can_export: rights ? !!rights.can_export : true,
      is_finance_admin: isFinance,
    });
  }

  const defaultsRaw = (settingsRes.data?.value ?? {}) as Record<string, unknown>;
  const defaults: VentesAdminDefaults = {
    tax_rate: Number(defaultsRaw.tax_rate ?? 0) || 0,
    retention_rate: Number(defaultsRaw.retention_rate ?? 0.1) || 0,
    stamp_amount: Number(defaultsRaw.stamp_amount ?? 0) || 0,
  };

  return {
    ok: true,
    data: {
      users,
      clients: (clientsRes.data ?? []).map((c) => mapClient(c as Record<string, unknown>)),
      lists: (listsRes.data ?? []) as VentesListItem[],
      defaults,
      canManageAdmin: true,
    },
  };
}

export async function upsertVentesClient(input: {
  id?: string;
  nom_fr: string;
  adresse?: string;
  nif?: string;
  article_imposition?: string;
  rc?: string;
  telephone?: string;
}): Promise<ActionResult<{ id: string }>> {
  const gate = await requireVentesAdmin();
  if (!gate.ok) return gate;

  const nom = input.nom_fr.trim();
  if (nom.length < 2) return fail("Nom client obligatoire.");

  const fields = {
    nom_fr: nom,
    adresse: input.adresse?.trim() || null,
    nif: input.nif?.trim() || null,
    article_imposition: input.article_imposition?.trim() || null,
    rc: input.rc?.trim() || null,
    telephone: input.telephone?.trim() || null,
  };

  const supabase = await createClient();
  if (input.id) {
    const { data, error } = await supabase
      .from("ref_clients")
      .update(fields)
      .eq("id", input.id)
      .select("id")
      .maybeSingle();
    if (error) return fail(error);
    if (!data) return fail("Mise à jour client refusée.");
    refresh();
    return { ok: true, data: { id: data.id } };
  }

  const { data, error } = await supabase.from("ref_clients").insert(fields).select("id").single();
  if (error) return fail(error);
  refresh();
  return { ok: true, data: { id: data.id } };
}

export async function saveVentesRights(
  users: Array<{
    id: string;
    ventes_active: boolean;
    can_saisie: boolean;
    can_emit: boolean;
    can_encaisser: boolean;
    can_cancel: boolean;
    can_admin: boolean;
    can_export: boolean;
  }>,
): Promise<ActionResult<{ count: number }>> {
  const gate = await requireVentesAdmin();
  if (!gate.ok) return gate;
  const { workspace } = gate.data;
  const supabase = await createClient();

  let count = 0;
  for (const u of users) {
    if (!/^[0-9a-f-]{36}$/i.test(u.id)) continue;
    const { error } = await supabase.from("sal_rights").upsert(
      {
        user_id: u.id,
        ventes_active: !!u.ventes_active,
        can_saisie: !!u.can_saisie,
        can_emit: !!u.can_emit,
        can_encaisser: !!u.can_encaisser,
        can_cancel: !!u.can_cancel,
        can_admin: !!u.can_admin,
        can_export: !!u.can_export,
        updated_by: workspace.id,
      },
      { onConflict: "user_id" },
    );
    if (error) return fail(error);
    count += 1;
  }
  refresh();
  return { ok: true, data: { count } };
}

export async function createVentesAdminUser(input: {
  email: string;
  password: string;
  name: string;
  asAdmin: boolean;
}): Promise<ActionResult<{ id: string }>> {
  const gate = await requireVentesAdmin();
  if (!gate.ok) return gate;
  const { workspace } = gate.data;

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const password = input.password;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Email invalide.");
  if (!name || name.length < 2) return fail("Nom complet requis.");
  if (!password || password.length < 8) return fail("Mot de passe: 8 caractères minimum.");
  if (input.asAdmin && !workspace.isSuperAdmin && !workspaceHasRole(workspace, ["ADMIN_FINANCE"])) {
    return fail("Seul un administrateur finance / SUPER_ADMIN peut créer un Admin Ventes.");
  }

  const supabase = await createClient();
  const { data: role, error: roleErr } = await supabase
    .from("sys_roles")
    .select("id, code, hierarchy_level, site_scoped_allowed, sites_only, is_active")
    .eq("code", "GERANT")
    .eq("is_active", true)
    .maybeSingle();
  if (roleErr || !role) return fail("Rôle GERANT introuvable.");

  let siteId: string | null = null;
  if (role.sites_only) {
    siteId =
      workspace.activeSite?.id ??
      workspace.roles.find((r) => r.siteId)?.siteId ??
      workspace.accessibleSites[0]?.id ??
      null;
    if (!siteId) return fail("Aucun chantier actif pour rattacher l'utilisateur.");
  } else if (!role.site_scoped_allowed) {
    siteId = null;
  }

  let service;
  try {
    service = createServiceClient();
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Service role indisponible.");
  }

  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (createErr || !created.user) {
    return fail(createErr?.message ?? "Échec création du compte.");
  }
  const userId = created.user.id;

  const { error: profileErr } = await service.from("sys_users").upsert(
    {
      id: userId,
      email,
      full_name: name,
      status: "ACTIVE",
      locale: "fr",
      must_reset_password: true,
    },
    { onConflict: "id" },
  );
  if (profileErr) {
    await service.auth.admin.deleteUser(userId);
    return fail(profileErr.message);
  }

  const { error: assignErr } = await supabase.from("sys_user_site_roles").insert({
    user_id: userId,
    role_id: role.id,
    site_id: siteId,
    created_by: workspace.id,
  });
  if (assignErr) {
    await service.from("sys_users").delete().eq("id", userId);
    await service.auth.admin.deleteUser(userId);
    return fail(assignErr.message);
  }

  const asAdmin = !!input.asAdmin;
  const { error: rightsErr } = await supabase.from("sal_rights").upsert({
    user_id: userId,
    ventes_active: true,
    can_saisie: true,
    can_emit: true,
    can_encaisser: asAdmin,
    can_cancel: asAdmin,
    can_admin: asAdmin,
    can_export: true,
    updated_by: workspace.id,
  });
  if (rightsErr) return fail(rightsErr);

  refresh();
  return { ok: true, data: { id: userId } };
}

export async function addVentesListItem(input: {
  list_key: "BANK_EXPECTED" | "ETABLIE_PAR" | "PAYMENT_MODE";
  label: string;
}): Promise<ActionResult<{ id: string }>> {
  const gate = await requireVentesAdmin();
  if (!gate.ok) return gate;
  const label = input.label.trim();
  if (!label) return fail("Libellé obligatoire.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sal_lists")
    .insert({ list_key: input.list_key, label, sort_order: 100, active: true })
    .select("id")
    .single();
  if (error) return fail(error);
  refresh();
  return { ok: true, data: { id: data.id } };
}

export async function setVentesListItemActive(
  id: string,
  active: boolean,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireVentesAdmin();
  if (!gate.ok) return gate;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("Élément invalide.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sal_lists")
    .update({ active })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return fail(error);
  if (!data) return fail("Élément introuvable.");
  refresh();
  return { ok: true, data: { id: data.id } };
}

export async function saveVentesDefaults(
  defaults: VentesAdminDefaults,
): Promise<ActionResult<{ ok: true }>> {
  const gate = await requireVentesAdmin();
  if (!gate.ok) return gate;
  const { workspace } = gate.data;
  const tax = Number(defaults.tax_rate);
  const ret = Number(defaults.retention_rate);
  const stamp = Number(defaults.stamp_amount);
  if (!(tax >= 0 && tax <= 1)) return fail("Taux TVA invalide (0–1).");
  if (!(ret >= 0 && ret <= 1)) return fail("% RG invalide (0–1).");
  if (!(stamp >= 0)) return fail("Timbre invalide.");

  const supabase = await createClient();
  const { error } = await supabase.from("sal_settings").upsert({
    key: "defaults",
    value: { tax_rate: tax, retention_rate: ret, stamp_amount: stamp },
    updated_by: workspace.id,
    updated_at: new Date().toISOString(),
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: { ok: true } };
}
