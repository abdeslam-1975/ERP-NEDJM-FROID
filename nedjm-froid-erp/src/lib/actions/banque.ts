"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { workspaceHasRole } from "@/lib/auth/require-roles";
import {
  formatDateIso,
  sumCautionCredits,
  withRunningBalances,
} from "@/lib/banque/ledger";
import type {
  BanqueAccount,
  BanqueDashboard,
  BanqueDeletedLine,
  BanqueLine,
  BanqueLists,
} from "@/lib/banque/types";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  banqueImportSchema,
  banqueLineSchema,
  banqueListItemSchema,
  banqueRapprochementSchema,
  banqueVirementSchema,
} from "@/lib/validations/banque";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

function fail(error: { message: string; code?: string } | string): ActionResult<never> {
  const message = typeof error === "string" ? error : error.message;
  const code = typeof error === "string" ? undefined : error.code;
  return {
    ok: false,
    error:
      code === "42501" || message.toLowerCase().includes("permission")
        ? "Accès refusé par les droits financiers (RBAC)."
        : message,
  };
}

function refresh() {
  revalidatePath("/finance");
  revalidatePath("/finance/parametres");
  revalidatePath("/parametres/finance");
}

function algiersToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Algiers",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function can(action: "create" | "read" | "update" | "delete"): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fin_can_access", {
    p_action: action,
    p_site_id: null,
  });
  if (error) return false;
  return !!data;
}

export async function getBanqueDashboard(accountId?: string | null): Promise<ActionResult<BanqueDashboard>> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return fail("Session requise.");
  const supabase = await createClient();

  const [accountsRes, listsRes, canCreate, canUpdate, canDelete] = await Promise.all([
    supabase
      .from("fin_accounts")
      .select("id, code, name, active, opening_balance, opening_date, bank_name, account_number, rib")
      .eq("account_type", "BANK")
      .order("code"),
    supabase
      .from("fin_bank_lists")
      .select("list_key, label, sort_order")
      .eq("active", true)
      .order("sort_order")
      .order("label"),
    can("create"),
    can("update"),
    can("delete"),
  ]);

  if (accountsRes.error) return fail(accountsRes.error);
  if (listsRes.error) return fail(listsRes.error);

  const rawAccounts = accountsRes.data ?? [];
  const accounts: BanqueAccount[] = [];
  for (const a of rawAccounts) {
    const { data: bal, error: balErr } = await supabase.rpc("fin_bank_sheet_balance", {
      p_account_id: a.id,
    });
    if (balErr) return fail(balErr);
    accounts.push({
      id: a.id,
      code: a.code,
      name: a.name,
      active: a.active,
      opening_balance: Number(a.opening_balance),
      opening_date: a.opening_date,
      bank_name: a.bank_name,
      account_number: a.account_number,
      rib: a.rib,
      balance: Number(bal ?? a.opening_balance),
    });
  }

  const activeBanks = accounts.filter((a) => a.active);
  const selected =
    (accountId && activeBanks.find((a) => a.id === accountId)) ||
    activeBanks[0] ||
    null;

  let lines: BanqueLine[] = [];
  let totalSoum = 0;
  let totalFin = 0;

  if (selected) {
    const linesRes = await supabase
      .from("fin_bank_lines")
      .select(
        "id, account_id, display_no, op_date, value_date, affectation, bc_label, bc_url, mode_label, mode_url, fac_label, fac_url, libelle, debit, credit, frais, reconciled, line_kind, transfer_group_id",
      )
      .eq("account_id", selected.id)
      .is("deleted_at", null)
      .order("op_date", { ascending: true })
      .order("created_at", { ascending: true });
    if (linesRes.error) return fail(linesRes.error);

    const asc = (linesRes.data ?? []).map((row) => ({
      id: row.id as string,
      account_id: row.account_id as string,
      display_no: Number(row.display_no) || 0,
      op_date: String(row.op_date),
      value_date: String(row.value_date),
      affectation: String(row.affectation ?? ""),
      bc_label: String(row.bc_label ?? ""),
      bc_url: (row.bc_url as string | null) ?? null,
      mode_label: String(row.mode_label ?? ""),
      mode_url: (row.mode_url as string | null) ?? null,
      fac_label: String(row.fac_label ?? ""),
      fac_url: (row.fac_url as string | null) ?? null,
      libelle: String(row.libelle),
      debit: Number(row.debit),
      credit: Number(row.credit),
      frais: Number(row.frais),
      reconciled: !!row.reconciled,
      line_kind: row.line_kind as BanqueLine["line_kind"],
      transfer_group_id: (row.transfer_group_id as string | null) ?? null,
    }));

    const withSolde = withRunningBalances(selected.opening_balance, asc);
    lines = [...withSolde].reverse();
  }

  for (const account of activeBanks) {
    const cautionRes = await supabase
      .from("fin_bank_lines")
      .select("libelle, credit")
      .eq("account_id", account.id)
      .is("deleted_at", null);
    if (cautionRes.error) return fail(cautionRes.error);
    const rows = (cautionRes.data ?? []).map((r) => ({
      libelle: String(r.libelle),
      credit: Number(r.credit),
    }));
    totalSoum += sumCautionCredits(rows, "S-CAUTION");
    totalFin += sumCautionCredits(rows, "B-CAUTION");
  }

  const lists: BanqueLists = {
    affectations: [],
    fournisseurs: [],
    modes: [],
  };
  for (const row of listsRes.data ?? []) {
    if (row.list_key === "AFFECTATION") lists.affectations.push(row.label);
    if (row.list_key === "FOURNISSEUR") lists.fournisseurs.push(row.label);
    if (row.list_key === "MODE") lists.modes.push(row.label);
  }

  return {
    ok: true,
    data: {
      accounts,
      lines,
      lists,
      totalSolde: activeBanks.reduce((s, a) => s + a.balance, 0),
      totalSoum,
      totalFin,
      canCreate,
      canUpdate,
      canDelete,
      canRestore: canDelete,
      today: algiersToday(),
      selectedAccountId: selected?.id ?? null,
    },
  };
}

export async function listDeletedBanqueLines(
  accountId?: string | null,
): Promise<ActionResult<{ rows: BanqueDeletedLine[] }>> {
  if (!(await can("delete"))) {
    return fail("Accès réservé : restauration (droit supprimer Banque).");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fin_bank_list_deleted_lines", {
    p_account_id: accountId && /^[0-9a-f-]{36}$/i.test(accountId) ? accountId : null,
    p_limit: 150,
  });
  if (error) {
    const msg = error.message || "";
    if (/schema cache|could not find the function|PGRST202/i.test(msg)) {
      return fail(
        "Fonctions corbeille Banque invisibles pour l'API. Appliquez la migration banque_restore_deleted (ou NOTIFY pgrst, 'reload schema').",
      );
    }
    return fail(error);
  }

  const rows: BanqueDeletedLine[] = (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    account_id: String(row.account_id),
    account_name: String(row.account_name ?? ""),
    display_no: Number(row.display_no) || 0,
    op_date: String(row.op_date ?? ""),
    value_date: String(row.value_date ?? ""),
    affectation: String(row.affectation ?? ""),
    libelle: String(row.libelle ?? ""),
    debit: Number(row.debit) || 0,
    credit: Number(row.credit) || 0,
    frais: Number(row.frais) || 0,
    line_kind: (String(row.line_kind || "MANUAL") as BanqueDeletedLine["line_kind"]),
    transfer_group_id: (row.transfer_group_id as string | null) ?? null,
    deleted_at: String(row.deleted_at ?? ""),
  }));

  return { ok: true, data: { rows } };
}

export async function restoreBanqueLine(
  lineId: string,
): Promise<ActionResult<{ message: string }>> {
  if (!/^[0-9a-f-]{36}$/i.test(lineId)) return fail("Opération invalide.");
  if (!(await can("delete"))) {
    return fail("Accès réservé : restauration (droit supprimer Banque).");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("fin_bank_restore_line", { p_line_id: lineId });
  if (error) {
    const msg = error.message || "";
    if (/schema cache|could not find the function|PGRST202/i.test(msg)) {
      return fail(
        "Fonction restauration Banque invisible. Appliquez la migration banque_restore_deleted.",
      );
    }
    return fail(error);
  }

  const check = await supabase
    .from("fin_bank_lines")
    .select("id, display_no, deleted_at")
    .eq("id", lineId)
    .maybeSingle();
  if (check.error) return fail(check.error);
  if (!check.data || check.data.deleted_at) {
    return fail("Restauration non confirmée en base.");
  }

  refresh();
  const no = Number(check.data.display_no) || 0;
  return {
    ok: true,
    data: {
      message: no
        ? `Opération restaurée (N° ${no}). Les numéros ont été réordonnés.`
        : "Opération restaurée.",
    },
  };
}

export async function saveBanqueLine(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = banqueLineSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Opération invalide.");
  const p = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fin_bank_save_line", {
    p_account_id: p.account_id,
    p_line_id: p.id ?? null,
    p_op_date: p.op_date,
    p_affectation: p.affectation,
    p_libelle: p.libelle,
    p_debit: p.debit,
    p_credit: p.credit,
    p_frais: p.frais,
    p_bc_label: p.bc_label,
    p_bc_url: p.bc_url,
    p_mode_label: p.mode_label,
    p_mode_url: p.mode_url,
    p_fac_label: p.fac_label,
    p_fac_url: p.fac_url,
    p_line_kind: p.line_kind,
    p_value_date: p.value_date ?? p.op_date,
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: { id: String((data as { id?: string })?.id ?? "") } };
}

export async function deleteBanqueLine(lineId: string): Promise<ActionResult> {
  if (!/^[0-9a-f-]{36}$/i.test(lineId)) return fail("Opération invalide.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fin_bank_delete_line", { p_line_id: lineId });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}

export async function executeBanqueVirement(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = banqueVirementSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Virement invalide.");
  const p = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fin_bank_execute_virement", {
    p_from_account_id: p.from_account_id,
    p_to_account_id: p.to_account_id,
    p_amount: p.amount,
    p_op_date: p.op_date,
  });
  if (error) return fail(error);
  refresh();
  return {
    ok: true,
    data: { id: String((data as { transfer_group_id?: string })?.transfer_group_id ?? "") },
  };
}

export async function setBanqueRapprochement(input: unknown): Promise<ActionResult> {
  const parsed = banqueRapprochementSchema.safeParse(input);
  if (!parsed.success) return fail("Rapprochement invalide.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fin_bank_set_rapprochement", {
    p_line_id: parsed.data.line_id,
    p_reconciled: parsed.data.reconciled,
    p_value_date: parsed.data.value_date ?? null,
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}

export async function importBanqueReleve(input: unknown): Promise<ActionResult<{ matched: number; added: number }>> {
  const parsed = banqueImportSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Relevé invalide.");
  const rows = parsed.data.rows.map((r) => ({
    dateOp: r.dateOp,
    dateVal: r.dateVal ?? r.dateOp,
    libelle: r.libelle,
    debit: r.debit,
    credit: r.credit,
  }));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fin_bank_import_releve", {
    p_account_id: parsed.data.account_id,
    p_rows: rows,
  });
  if (error) return fail(error);
  refresh();
  const payload = (data ?? {}) as { matched?: number; added?: number };
  return {
    ok: true,
    data: { matched: Number(payload.matched ?? 0), added: Number(payload.added ?? 0) },
  };
}

export async function addBanqueListItem(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = banqueListItemSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Paramètre invalide.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fin_bank_add_list_item", {
    p_list_key: parsed.data.list_key,
    p_label: parsed.data.label,
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: { id: String((data as { id?: string })?.id ?? "") } };
}

export async function toggleBanqueAccountActive(
  accountId: string,
  active: boolean,
): Promise<ActionResult> {
  if (!/^[0-9a-f-]{36}$/i.test(accountId)) return fail("Compte invalide.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("fin_accounts")
    .update({ active })
    .eq("id", accountId)
    .eq("account_type", "BANK");
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}

/** Create a bank account by display name (Apps Script addNewBank). */
export async function createBanqueAccount(nameInput: string): Promise<ActionResult<{ id: string }>> {
  const name = nameInput.trim();
  if (!name || name.length > 160) return fail("Nom de banque invalide.");
  if (!(await can("update"))) return fail("Accès refusé par les droits financiers (RBAC).");

  const supabase = await createClient();
  const existing = await supabase
    .from("fin_accounts")
    .select("id")
    .eq("account_type", "BANK")
    .eq("name", name)
    .maybeSingle();
  if (existing.data) return fail("Cette banque existe déjà !");

  const baseCode = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
  const code = `B-${baseCode || "BANQUE"}`.slice(0, 40);

  const { data, error } = await supabase
    .from("fin_accounts")
    .insert({
      code,
      name,
      account_type: "BANK",
      currency_code: "DZD",
      bank_name: name,
      opening_balance: 0,
      opening_date: "2025-12-31",
      allow_negative: false,
      active: true,
      notes: "Créée depuis ADMIN · GESTION BANQUES",
    })
    .select("id")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      const retryCode = `${code}-${Date.now().toString(36).slice(-4)}`.slice(0, 40);
      const second = await supabase
        .from("fin_accounts")
        .insert({
          code: retryCode,
          name,
          account_type: "BANK",
          currency_code: "DZD",
          bank_name: name,
          opening_balance: 0,
          opening_date: "2025-12-31",
          allow_negative: false,
          active: true,
          notes: "Créée depuis ADMIN · GESTION BANQUES",
        })
        .select("id")
        .maybeSingle();
      if (second.error) return fail(second.error);
      if (!second.data) return fail("Création refusée.");
      refresh();
      return { ok: true, data: { id: second.data.id } };
    }
    return fail(error);
  }
  if (!data) return fail("Création refusée.");
  refresh();
  return { ok: true, data: { id: data.id } };
}

export type BanqueAdminUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
};

/** Users with finance rights — visual equivalent of Apps Script Users sheet. */
export async function listBanqueAdminUsers(): Promise<ActionResult<BanqueAdminUser[]>> {
  if (!(await can("update"))) return fail("Accès refusé par les droits financiers (RBAC).");
  const supabase = await createClient();
  const [usersRes, linksRes] = await Promise.all([
    supabase.from("sys_users").select("id, email, full_name, status").eq("status", "ACTIVE").order("full_name"),
    supabase.from("sys_user_site_roles").select("user_id, role:sys_roles ( code )"),
  ]);
  if (usersRes.error) return fail(usersRes.error);
  if (linksRes.error) return fail(linksRes.error);

  const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const rolesByUser = new Map<string, Set<string>>();
  for (const link of linksRes.data ?? []) {
    const code = one(link.role as { code: string } | { code: string }[] | null)?.code;
    if (!code) continue;
    const set = rolesByUser.get(link.user_id) ?? new Set<string>();
    set.add(code);
    rolesByUser.set(link.user_id, set);
  }

  const rows: BanqueAdminUser[] = [];
  for (const u of usersRes.data ?? []) {
    const codes = rolesByUser.get(u.id) ?? new Set();
    const finance = [...codes].filter((c) =>
      ["SUPER_ADMIN", "ADMIN_FINANCE", "GERANT"].includes(c),
    );
    if (finance.length === 0) continue;
    rows.push({
      id: u.id,
      email: String(u.email ?? ""),
      name: String(u.full_name ?? ""),
      role:
        finance.includes("SUPER_ADMIN") || finance.includes("ADMIN_FINANCE") ? "admin" : "user",
      status: String(u.status ?? "ACTIVE"),
    });
  }
  return { ok: true, data: rows };
}

async function requireBanqueUserAdmin(): Promise<
  ActionResult<{ workspace: NonNullable<Awaited<ReturnType<typeof getWorkspaceProfile>>> }>
> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return fail("Session requise.");
  if (!(await can("update"))) return fail("Accès refusé par les droits financiers (RBAC).");
  if (
    !workspace.isSuperAdmin &&
    !workspaceHasRole(workspace, ["ADMIN_FINANCE", "GERANT"])
  ) {
    return fail("Réservé à l'administrateur Banque (admin).");
  }
  return { ok: true, data: { workspace } };
}

/**
 * Apps Script addNewUser — crée un compte ERP + rôle finance.
 * role "admin" → ADMIN_FINANCE ; "user" → GERANT.
 */
export async function createBanqueAdminUser(input: {
  email: string;
  password: string;
  name: string;
  role: "admin" | "user";
}): Promise<ActionResult<{ id: string }>> {
  const gate = await requireBanqueUserAdmin();
  if (!gate.ok) return gate;
  const { workspace } = gate.data;

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const password = input.password;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Email invalide.");
  if (!name || name.length < 2) return fail("Nom complet requis.");
  if (!password || password.length < 8) return fail("Mot de passe: 8 caractères minimum.");
  if (input.role !== "admin" && input.role !== "user") return fail("Rôle invalide.");

  const roleCode = input.role === "admin" ? "ADMIN_FINANCE" : "GERANT";
  if (roleCode === "ADMIN_FINANCE" && !workspace.isSuperAdmin) {
    return fail("Seul un SUPER_ADMIN peut créer un Administrateur finance.");
  }

  const supabase = await createClient();
  const { data: role, error: roleErr } = await supabase
    .from("sys_roles")
    .select("id, code, hierarchy_level, site_scoped_allowed, sites_only, is_active")
    .eq("code", roleCode)
    .eq("is_active", true)
    .maybeSingle();
  if (roleErr || !role) return fail(`Rôle ${roleCode} introuvable.`);

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

  refresh();
  revalidatePath("/parametres/utilisateurs");
  return { ok: true, data: { id: userId } };
}

/** Apps Script deleteUser — suppression ERP (auth + profil). */
export async function deleteBanqueAdminUser(userId: string): Promise<ActionResult<{ id: string }>> {
  const gate = await requireBanqueUserAdmin();
  if (!gate.ok) return gate;
  const { workspace } = gate.data;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return fail("Utilisateur invalide.");
  if (userId === workspace.id) return fail("Vous ne pouvez pas supprimer votre propre compte.");

  let service;
  try {
    service = createServiceClient();
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Service role indisponible.");
  }

  const { data: links } = await service
    .from("sys_user_site_roles")
    .select("role:sys_roles ( code, hierarchy_level )")
    .eq("user_id", userId);
  const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  for (const link of links ?? []) {
    const role = one(
      link.role as { code: string; hierarchy_level: number } | { code: string; hierarchy_level: number }[] | null,
    );
    if (role?.code === "SUPER_ADMIN" || (role?.hierarchy_level ?? 0) >= 90) {
      return fail("Impossible de supprimer un SUPER_ADMIN depuis Banque.");
    }
    if ((role?.hierarchy_level ?? 0) >= 80 && !workspace.isSuperAdmin) {
      return fail("Seul un SUPER_ADMIN peut supprimer ce compte.");
    }
  }

  const { data: target, error: loadErr } = await service
    .from("sys_users")
    .select("id, email, full_name")
    .eq("id", userId)
    .maybeSingle();
  if (loadErr) return fail(loadErr);
  if (!target) return fail("Utilisateur introuvable.");

  const { error } = await service.rpc("erp_delete_user", { p_user_id: userId });
  if (error) return fail(error.message);

  refresh();
  revalidatePath("/parametres/utilisateurs");
  return { ok: true, data: { id: userId } };
}

/** Helper for UI edit forms: normalize FR date cells to ISO. */
export async function normalizeBanqueDate(value: string): Promise<string> {
  return formatDateIso(value);
}
