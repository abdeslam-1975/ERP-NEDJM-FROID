"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  cashAdvanceExpenseSchema,
  cashAdvanceCancelSchema,
  cashAdvanceSchema,
  cashAdvanceSettleSchema,
  financeAccountSchema,
  financeCategorySchema,
  financeConfigDeleteSchema,
  financeMethodSchema,
  financeMovementSchema,
  financeReconcileSchema,
  financeReverseSchema,
  financeTaxRateSchema,
  financeTransferSchema,
} from "@/lib/validations/finance";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type FinanceAccount = {
  id: string;
  code: string;
  name: string;
  account_type: "BANK" | "CASH";
  site_id: string | null;
  currency_code: string;
  bank_name: string | null;
  account_number: string | null;
  rib: string | null;
  opening_balance: number;
  opening_date: string;
  allow_negative: boolean;
  active: boolean;
  notes: string | null;
  balance: number;
};

export type FinanceTaxRate = {
  id: string;
  code: string;
  label_fr: string;
  rate: number;
  active: boolean;
  is_default: boolean;
  valid_from: string | null;
  valid_to: string | null;
};

export type FinancePaymentMethod = {
  id: string;
  code: string;
  label_fr: string;
  account_scope: "BANK" | "CASH" | "BOTH";
  legacy_contract_method: string | null;
  active: boolean;
  sort_order: number;
};

export type FinanceCategory = {
  id: string;
  code: string;
  label_fr: string;
  direction: "IN" | "OUT" | "BOTH";
  account_scope: "BANK" | "CASH" | "BOTH";
  active: boolean;
  sort_order: number;
};

export type FinanceTransaction = {
  id: string;
  account_id: string;
  movement_date: string;
  direction: "IN" | "OUT";
  amount: number;
  reference: string | null;
  description: string;
  counterparty: string | null;
  source_type: string;
  reversal_of: string | null;
  reconciled_at: string | null;
  reconciliation_reference: string | null;
  account_name: string;
  category_label: string | null;
  method_label: string | null;
  is_reversed: boolean;
};

export type CashAdvanceExpense = {
  id: string;
  expense_date: string;
  amount: number;
  description: string;
  receipt_reference: string | null;
  attachment_url: string | null;
  category_id: string;
  category_label: string;
};

export type CashAdvance = {
  id: string;
  advance_number: string;
  cash_account_id: string;
  beneficiary_employee_id: string | null;
  beneficiary_name: string;
  issue_date: string;
  amount: number;
  purpose: string;
  status: "OPEN" | "SETTLED" | "CANCELLED";
  settled_at: string | null;
  settlement_note: string | null;
  account_name: string;
  expenses: CashAdvanceExpense[];
  expense_total: number;
  remaining: number;
};

export type FinancePeriodLock = {
  id: string;
  site_id: string | null;
  account_id: string | null;
  start_date: string;
  end_date: string;
  reason: string | null;
  unlocked_at: string | null;
  account_name: string | null;
};

export type FinanceHubData = {
  accounts: FinanceAccount[];
  taxRates: FinanceTaxRate[];
  methods: FinancePaymentMethod[];
  categories: FinanceCategory[];
  transactions: FinanceTransaction[];
  advances: CashAdvance[];
  periodLocks: FinancePeriodLock[];
  sites: { id: string; code: string; name_fr: string }[];
  employees: { id: string; matricule: string; first_name: string; last_name: string }[];
};

function refreshFinance() {
  revalidatePath("/finance");
  revalidatePath("/finance/parametres");
  revalidatePath("/referentiels/contrats");
}

function fail(error: { message: string; code?: string }): ActionResult<never> {
  return {
    ok: false,
    error:
      error.code === "42501" || error.message.toLowerCase().includes("permission")
        ? "Accès refusé par les droits financiers (RBAC)."
        : error.message,
  };
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function getFinanceHubData(): Promise<ActionResult<FinanceHubData>> {
  const supabase = await createClient();
  const [
    accountsResult,
    ratesResult,
    methodsResult,
    categoriesResult,
    transactionsResult,
    advancesResult,
    locksResult,
    sitesResult,
    employeesResult,
  ] = await Promise.all([
    supabase.from("fin_accounts").select("*").order("account_type").order("code"),
    supabase.from("fin_tax_rates").select("*").order("rate"),
    supabase.from("fin_payment_methods").select("*").order("sort_order").order("code"),
    supabase.from("fin_categories").select("*").order("sort_order").order("code"),
    supabase
      .from("fin_transactions")
      .select(`
        id, account_id, movement_date, direction, amount, reference, description,
        counterparty, source_type, reversal_of, reconciled_at, reconciliation_reference,
        account:fin_accounts(name),
        category:fin_categories(label_fr),
        method:fin_payment_methods(label_fr),
        reversals:fin_transactions!reversal_of(id)
      `)
      .order("movement_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("fin_cash_advances")
      .select(`
        id, advance_number, cash_account_id, beneficiary_employee_id,
        beneficiary_name, issue_date, amount, purpose, status, settled_at, settlement_note,
        account:fin_accounts(name),
        expenses:fin_cash_advance_expenses(
          id, expense_date, amount, description, receipt_reference, attachment_url, category_id,
          category:fin_categories(label_fr)
        )
      `)
      .order("issue_date", { ascending: false })
      .limit(200),
    supabase
      .from("fin_period_locks")
      .select("id, site_id, account_id, start_date, end_date, reason, unlocked_at, account:fin_accounts(name)")
      .order("start_date", { ascending: false }),
    supabase.from("ref_sites").select("id, code, name_fr").eq("is_active", true).order("code"),
    supabase
      .from("hr_employees")
      .select("id, matricule, first_name, last_name")
      .eq("status", "ACTIVE")
      .order("last_name"),
  ]);

  const firstError = [
    accountsResult.error,
    ratesResult.error,
    methodsResult.error,
    categoriesResult.error,
    transactionsResult.error,
    advancesResult.error,
    locksResult.error,
    sitesResult.error,
    employeesResult.error,
  ].find(Boolean);
  if (firstError) return fail(firstError);

  const accounts = await Promise.all(
    (accountsResult.data ?? []).map(async (a) => {
      const { data: balance } = await supabase.rpc("fin_account_balance", {
        p_account_id: a.id,
        p_as_of: undefined,
      });
      return {
        ...a,
        opening_balance: Number(a.opening_balance),
        balance: Number(balance ?? a.opening_balance),
      } as FinanceAccount;
    }),
  );

  const transactions: FinanceTransaction[] = (transactionsResult.data ?? []).map((t) => ({
    id: t.id,
    account_id: t.account_id,
    movement_date: t.movement_date,
    direction: t.direction as FinanceTransaction["direction"],
    amount: Number(t.amount),
    reference: t.reference,
    description: t.description,
    counterparty: t.counterparty,
    source_type: t.source_type,
    reversal_of: t.reversal_of,
    reconciled_at: t.reconciled_at,
    reconciliation_reference: t.reconciliation_reference,
    account_name: one(t.account)?.name ?? "—",
    category_label: one(t.category)?.label_fr ?? null,
    method_label: one(t.method)?.label_fr ?? null,
    is_reversed: (t.reversals ?? []).length > 0,
  }));

  const advances: CashAdvance[] = (advancesResult.data ?? []).map((a) => {
    const expenses = (a.expenses ?? []).map((e) => ({
      id: e.id,
      expense_date: e.expense_date,
      amount: Number(e.amount),
      description: e.description,
      receipt_reference: e.receipt_reference,
      attachment_url: e.attachment_url,
      category_id: e.category_id,
      category_label: one(e.category)?.label_fr ?? "—",
    }));
    const expenseTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
    return {
      ...a,
      amount: Number(a.amount),
      account_name: one(a.account)?.name ?? "—",
      expenses,
      expense_total: expenseTotal,
      remaining: Number(a.amount) - expenseTotal,
    } as CashAdvance;
  });

  return {
    ok: true,
    data: {
      accounts,
      taxRates: (ratesResult.data ?? []).map((r) => ({ ...r, rate: Number(r.rate) })),
      methods: (methodsResult.data ?? []) as FinancePaymentMethod[],
      categories: (categoriesResult.data ?? []) as FinanceCategory[],
      transactions,
      advances,
      periodLocks: (locksResult.data ?? []).map((l) => ({
        ...l,
        account_name: one(l.account)?.name ?? null,
      })) as FinancePeriodLock[],
      sites: sitesResult.data ?? [],
      employees: employeesResult.data ?? [],
    },
  };
}

async function saveRow(
  table: "fin_accounts" | "fin_tax_rates" | "fin_payment_methods" | "fin_categories",
  id: string | undefined,
  payload: Record<string, unknown>,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const query = id
    ? supabase.from(table).update(payload).eq("id", id)
    : supabase.from(table).insert(payload);
  const { data, error } = await query.select("id").maybeSingle();
  if (error) return fail(error);
  if (!data) return { ok: false, error: "Enregistrement refusé." };
  refreshFinance();
  return { ok: true, data: { id: data.id } };
}

export async function upsertFinanceAccount(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = financeAccountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Compte invalide." };
  const { id, ...payload } = parsed.data;
  return saveRow("fin_accounts", id, payload);
}

export async function upsertFinanceTaxRate(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = financeTaxRateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "TVA invalide." };
  const { id, ...payload } = parsed.data;
  return saveRow("fin_tax_rates", id, payload);
}

export async function upsertFinanceMethod(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = financeMethodSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Mode invalide." };
  const { id, ...payload } = parsed.data;
  return saveRow("fin_payment_methods", id, payload);
}

export async function upsertFinanceCategory(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = financeCategorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Catégorie invalide." };
  const { id, ...payload } = parsed.data;
  return saveRow("fin_categories", id, payload);
}

export async function deleteFinanceConfig(input: unknown): Promise<ActionResult> {
  const parsed = financeConfigDeleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Paramètre invalide." };
  const tables = {
    tax_rate: "fin_tax_rates",
    payment_method: "fin_payment_methods",
    category: "fin_categories",
  } as const;
  const supabase = await createClient();
  const { error } = await supabase.from(tables[parsed.data.entity]).delete().eq("id", parsed.data.id);
  if (error) {
    return {
      ok: false,
      error: error.code === "23503" ? "Paramètre déjà utilisé : désactivez-le au lieu de le supprimer." : error.message,
    };
  }
  refreshFinance();
  return { ok: true, data: undefined };
}

export async function postFinanceMovement(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = financeMovementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Mouvement invalide." };
  const p = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fin_post_transaction", {
    p_account_id: p.account_id,
    p_direction: p.direction,
    p_amount: p.amount,
    p_movement_date: p.movement_date,
    p_description: p.description,
    p_category_id: p.category_id ?? undefined,
    p_payment_method_id: p.payment_method_id ?? undefined,
    p_reference: p.reference ?? undefined,
    p_counterparty: p.counterparty ?? undefined,
  });
  if (error) return fail(error);
  refreshFinance();
  return { ok: true, data: { id: String((data as { id?: string })?.id ?? "") } };
}

export async function postFinanceTransfer(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = financeTransferSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Virement invalide." };
  const p = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fin_post_transfer", {
    p_from_account_id: p.from_account_id,
    p_to_account_id: p.to_account_id,
    p_amount: p.amount,
    p_movement_date: p.movement_date,
    p_description: p.description,
    p_reference: p.reference ?? undefined,
  });
  if (error) return fail(error);
  refreshFinance();
  return { ok: true, data: { id: String((data as { transfer_group_id?: string })?.transfer_group_id ?? "") } };
}

export async function reverseFinanceMovement(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = financeReverseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Annulation invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fin_reverse_transaction", {
    p_transaction_id: parsed.data.transaction_id,
    p_reversal_date: parsed.data.reversal_date,
    p_reason: parsed.data.reason,
  });
  if (error) return fail(error);
  refreshFinance();
  return { ok: true, data: { id: String((data as { id?: string })?.id ?? "") } };
}

export async function reverseFinanceTransfer(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = financeReverseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Annulation invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fin_reverse_transfer", {
    p_transaction_id: parsed.data.transaction_id,
    p_reversal_date: parsed.data.reversal_date,
    p_reason: parsed.data.reason,
  });
  if (error) return fail(error);
  refreshFinance();
  return {
    ok: true,
    data: { id: String((data as { transfer_group_id?: string })?.transfer_group_id ?? "") },
  };
}

export async function reconcileFinanceMovement(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = financeReconcileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Rapprochement invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fin_set_reconciliation", {
    p_transaction_id: parsed.data.transaction_id,
    p_reconciled: parsed.data.reconciled,
    p_reference: parsed.data.reference ?? undefined,
  });
  if (error) return fail(error);
  refreshFinance();
  return { ok: true, data: { id: String((data as { id?: string })?.id ?? "") } };
}

export async function issueCashAdvance(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = cashAdvanceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Avance invalide." };
  const p = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fin_issue_cash_advance", {
    p_cash_account_id: p.cash_account_id,
    p_beneficiary_name: p.beneficiary_name,
    p_beneficiary_employee_id: p.beneficiary_employee_id ?? undefined,
    p_amount: p.amount,
    p_issue_date: p.issue_date,
    p_purpose: p.purpose,
  });
  if (error) return fail(error);
  refreshFinance();
  return { ok: true, data: { id: String((data as { id?: string })?.id ?? "") } };
}

export async function addCashAdvanceExpense(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = cashAdvanceExpenseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dépense invalide." };
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return { ok: false, error: "Session requise." };
  const { data, error } = await supabase
    .from("fin_cash_advance_expenses")
    .insert({ ...parsed.data, created_by: authData.user.id })
    .select("id")
    .maybeSingle();
  if (error) return fail(error);
  if (!data) return { ok: false, error: "Ajout refusé." };
  refreshFinance();
  return { ok: true, data: { id: data.id } };
}

export async function deleteCashAdvanceExpense(id: string): Promise<ActionResult> {
  const parsed = financeConfigDeleteSchema.shape.id.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Dépense invalide." };
  const supabase = await createClient();
  const { error } = await supabase.from("fin_cash_advance_expenses").delete().eq("id", parsed.data);
  if (error) return fail(error);
  refreshFinance();
  return { ok: true, data: undefined };
}

export async function settleCashAdvance(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = cashAdvanceSettleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Clôture invalide." };
  const p = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fin_settle_cash_advance", {
    p_advance_id: p.advance_id,
    p_return_amount: p.return_amount,
    p_settlement_date: p.settlement_date,
    p_note: p.note ?? undefined,
  });
  if (error) return fail(error);
  refreshFinance();
  return { ok: true, data: { id: String((data as { id?: string })?.id ?? "") } };
}

export async function cancelCashAdvance(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = cashAdvanceCancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Annulation invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fin_cancel_cash_advance", {
    p_advance_id: parsed.data.advance_id,
    p_cancellation_date: parsed.data.cancellation_date,
    p_reason: parsed.data.reason,
  });
  if (error) return fail(error);
  refreshFinance();
  return { ok: true, data: { id: String((data as { id?: string })?.id ?? "") } };
}

export async function lockFinancePeriod(input: {
  account_id: string;
  start_date: string;
  end_date: string;
  reason?: string;
}): Promise<ActionResult<{ id: string }>> {
  if (
    !financeConfigDeleteSchema.shape.id.safeParse(input.account_id).success ||
    input.end_date < input.start_date
  ) {
    return { ok: false, error: "Période invalide." };
  }
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return { ok: false, error: "Session requise." };
  const account = await supabase.from("fin_accounts").select("site_id").eq("id", input.account_id).maybeSingle();
  if (!account.data) return { ok: false, error: "Compte introuvable." };
  const { data, error } = await supabase
    .from("fin_period_locks")
    .insert({
      account_id: input.account_id,
      site_id: account.data.site_id,
      start_date: input.start_date,
      end_date: input.end_date,
      reason: input.reason?.trim() || null,
      locked_by: authData.user.id,
    })
    .select("id")
    .maybeSingle();
  if (error) return fail(error);
  if (!data) return { ok: false, error: "Verrouillage refusé." };
  refreshFinance();
  return { ok: true, data: { id: data.id } };
}

export async function unlockFinancePeriod(id: string): Promise<ActionResult> {
  const parsed = financeConfigDeleteSchema.shape.id.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Verrou invalide." };
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return { ok: false, error: "Session requise." };
  const { error } = await supabase
    .from("fin_period_locks")
    .update({ unlocked_at: new Date().toISOString(), unlocked_by: authData.user.id })
    .eq("id", parsed.data)
    .is("unlocked_at", null);
  if (error) return fail(error);
  refreshFinance();
  return { ok: true, data: undefined };
}

