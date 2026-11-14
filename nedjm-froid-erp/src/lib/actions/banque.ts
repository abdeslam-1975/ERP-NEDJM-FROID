"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import {
  formatDateIso,
  sumCautionCredits,
  withRunningBalances,
} from "@/lib/banque/ledger";
import type {
  BanqueAccount,
  BanqueDashboard,
  BanqueLine,
  BanqueLists,
} from "@/lib/banque/types";
import { createClient } from "@/lib/supabase/server";
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
      today: algiersToday(),
      selectedAccountId: selected?.id ?? null,
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

/** Helper for UI edit forms: normalize FR date cells to ISO. */
export async function normalizeBanqueDate(value: string): Promise<string> {
  return formatDateIso(value);
}
