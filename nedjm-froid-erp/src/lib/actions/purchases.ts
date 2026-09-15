"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  idSchema,
  numberSequenceSchema,
  orderFromProformaSchema,
  proformaSchema,
  proformaStatusSchema,
  receiptSchema,
  situationTypeSchema,
  stampRuleSchema,
  supplierInvoiceSchema,
  supplierPaymentReverseSchema,
  supplierPaymentSchema,
  supplierSchema,
} from "@/lib/validations/purchases";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type Supplier = {
  id: string;
  code: string;
  legal_name: string;
  trade_name: string | null;
  nif: string | null;
  nis: string | null;
  rc: string | null;
  ai: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  contact_name: string | null;
  payment_terms_days: number;
  bank_details: string | null;
  active: boolean;
  notes: string | null;
};

export type SituationType = {
  id: string;
  code: string;
  label_fr: string;
  label_ar: string | null;
  includes_supply: boolean;
  includes_installation: boolean;
  active: boolean;
  sort_order: number;
};

export type StampRule = {
  id: string;
  code: string;
  label_fr: string;
  calculation_mode: "FIXED" | "PERCENT" | "BRACKETS";
  calculation_base: "HT" | "TVA" | "TTC";
  fixed_amount: number | null;
  rate: number | null;
  brackets: { from: number; to: number | null; amount: number }[];
  payment_method_id: string | null;
  valid_from: string | null;
  valid_to: string | null;
  priority: number;
  active: boolean;
  legal_reference: string | null;
};

export type NumberSequence = {
  document_type: "PROFORMA" | "ORDER" | "RECEIPT" | "SUPPLIER_INVOICE";
  prefix: string;
  padding: number;
  include_year: boolean;
  next_value: number;
};

export type PurchasingLine = {
  id: string;
  item_code: string;
  designation: string;
  unit: string;
  quantity: number;
  supply_unit_price_ht: number;
  installation_unit_price_ht: number;
  unit_price_ht: number;
  total_ht: number;
  tax_rate_id: string | null;
  tax_rate: number;
  tax_amount: number;
  situation_type_id: string | null;
};

export type Proforma = {
  id: string;
  proforma_number: string;
  supplier_id: string;
  site_id: string | null;
  supplier_reference: string | null;
  proforma_date: string;
  validity_date: string | null;
  status: "DRAFT" | "APPROVED" | "CANCELLED";
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  delivery_terms: string | null;
  payment_terms: string | null;
  supplier_name: string;
  lines: PurchasingLine[];
};

export type PurchaseOrderLine = PurchasingLine & {
  order_id: string;
  received_quantity: number;
  invoiced_quantity: number;
};

export type PurchaseOrder = {
  id: string;
  order_number: string;
  proforma_id: string | null;
  supplier_id: string;
  site_id: string | null;
  order_date: string;
  expected_delivery_date: string | null;
  delivery_address: string | null;
  status: string;
  revision: number;
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  supplier_name: string;
  lines: PurchaseOrderLine[];
};

export type PurchaseReceipt = {
  id: string;
  receipt_number: string;
  order_id: string;
  receipt_date: string;
  delivery_note_number: string | null;
  received_by_name: string | null;
  status: string;
  order_number: string;
};

export type SupplierPayment = {
  id: string;
  payment_date: string;
  amount: number;
  direction: number;
  reference: string | null;
  reversal_of: string | null;
};

export type SupplierInvoice = {
  id: string;
  internal_number: string;
  supplier_invoice_number: string;
  supplier_id: string;
  order_id: string;
  invoice_date: string;
  due_date: string | null;
  status: string;
  total_supply_ht: number;
  total_installation_ht: number;
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  retention_rate: number;
  retention_amount: number;
  retention_status: "NONE" | "HELD" | "RELEASED";
  retention_due_date: string | null;
  stamp_amount: number;
  net_payable: number;
  supplier_name: string;
  order_number: string;
  open_amount: number;
  payments: SupplierPayment[];
};

export type PurchaseHubData = {
  suppliers: Supplier[];
  situations: SituationType[];
  stampRules: StampRule[];
  sequences: NumberSequence[];
  proformas: Proforma[];
  orders: PurchaseOrder[];
  receipts: PurchaseReceipt[];
  invoices: SupplierInvoice[];
  taxRates: { id: string; code: string; label_fr: string; rate: number }[];
  accounts: { id: string; code: string; name: string; account_type: string }[];
  paymentMethods: { id: string; code: string; label_fr: string; account_scope: string }[];
  sites: { id: string; code: string; name_fr: string }[];
};

function refreshPurchases() {
  revalidatePath("/achats");
  revalidatePath("/achats/parametres");
  revalidatePath("/finance");
}

function fail(error: { message: string; code?: string }): ActionResult<never> {
  return {
    ok: false,
    error:
      error.code === "42501" || error.message.toLowerCase().includes("permission")
        ? "Accès refusé par les droits Achats."
        : error.message,
  };
}

function relation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function getPurchaseHubData(): Promise<ActionResult<PurchaseHubData>> {
  const supabase = await createClient();
  const [
    suppliers,
    situations,
    stamps,
    sequences,
    proformas,
    orders,
    receipts,
    invoices,
    taxRates,
    accounts,
    methods,
    sites,
  ] = await Promise.all([
    supabase.from("pur_suppliers").select("*").order("legal_name"),
    supabase.from("ref_situation_types").select("*").order("sort_order").order("code"),
    supabase.from("fin_stamp_rules").select("*").order("priority").order("code"),
    supabase.from("pur_number_sequences").select("*").order("document_type"),
    supabase
      .from("pur_proformas")
      .select("*, supplier:pur_suppliers(legal_name), lines:pur_proforma_lines(*)")
      .order("proforma_date", { ascending: false })
      .limit(300),
    supabase
      .from("pur_orders")
      .select(`
        *, supplier:pur_suppliers(legal_name),
        lines:pur_order_lines(
          *,
          receipt_lines:pur_receipt_lines(accepted_quantity, receipt:pur_receipts(status)),
          invoice_lines:pur_supplier_invoice_lines(quantity, invoice:pur_supplier_invoices(status))
        )
      `)
      .order("order_date", { ascending: false })
      .limit(300),
    supabase
      .from("pur_receipts")
      .select("*, order:pur_orders(order_number)")
      .order("receipt_date", { ascending: false })
      .limit(500),
    supabase
      .from("pur_supplier_invoices")
      .select(`
        *, supplier:pur_suppliers(legal_name), order:pur_orders(order_number),
        payments:pur_supplier_payments(id, payment_date, amount, direction, reference, reversal_of)
      `)
      .order("invoice_date", { ascending: false })
      .limit(500),
    supabase.from("fin_tax_rates").select("id, code, label_fr, rate").eq("active", true).order("rate"),
    supabase.from("fin_accounts").select("id, code, name, account_type").eq("active", true).order("code"),
    supabase.from("fin_payment_methods").select("id, code, label_fr, account_scope").eq("active", true).order("sort_order"),
    supabase.from("ref_sites").select("id, code, name_fr").eq("is_active", true).order("code"),
  ]);

  const error = [
    suppliers.error,
    situations.error,
    stamps.error,
    sequences.error,
    proformas.error,
    orders.error,
    receipts.error,
    invoices.error,
    taxRates.error,
    accounts.error,
    methods.error,
    sites.error,
  ].find(Boolean);
  if (error) return fail(error);

  const mappedOrders: PurchaseOrder[] = (orders.data ?? []).map((order) => ({
    ...order,
    total_ht: Number(order.total_ht),
    total_tva: Number(order.total_tva),
    total_ttc: Number(order.total_ttc),
    supplier_name: relation(order.supplier)?.legal_name ?? "—",
    lines: (order.lines ?? []).map((line) => ({
      ...line,
      quantity: Number(line.quantity),
      supply_unit_price_ht: Number(line.supply_unit_price_ht),
      installation_unit_price_ht: Number(line.installation_unit_price_ht),
      unit_price_ht: Number(line.unit_price_ht),
      total_ht: Number(line.total_ht),
      tax_rate: Number(line.tax_rate),
      tax_amount: Number(line.tax_amount),
      received_quantity: (line.receipt_lines ?? []).reduce(
        (sum, entry) => sum + (relation(entry.receipt)?.status === "POSTED" ? Number(entry.accepted_quantity) : 0),
        0,
      ),
      invoiced_quantity: (line.invoice_lines ?? []).reduce(
        (sum, entry) => sum + (relation(entry.invoice)?.status === "POSTED" ? Number(entry.quantity) : 0),
        0,
      ),
    })),
  })) as PurchaseOrder[];

  const mappedInvoices: SupplierInvoice[] = (invoices.data ?? []).map((invoice) => {
    const payments = (invoice.payments ?? []).map((payment) => ({
      ...payment,
      amount: Number(payment.amount),
      direction: Number(payment.direction),
    }));
    const releasedRetention =
      invoice.retention_status === "RELEASED" ? Number(invoice.retention_amount) : 0;
    const paid = payments.reduce((sum, payment) => sum + payment.amount * payment.direction, 0);
    return {
      ...invoice,
      total_supply_ht: Number(invoice.total_supply_ht),
      total_installation_ht: Number(invoice.total_installation_ht),
      total_ht: Number(invoice.total_ht),
      total_tva: Number(invoice.total_tva),
      total_ttc: Number(invoice.total_ttc),
      retention_rate: Number(invoice.retention_rate),
      retention_amount: Number(invoice.retention_amount),
      stamp_amount: Number(invoice.stamp_amount),
      net_payable: Number(invoice.net_payable),
      supplier_name: relation(invoice.supplier)?.legal_name ?? "—",
      order_number: relation(invoice.order)?.order_number ?? "—",
      open_amount: Math.max(Number(invoice.net_payable) + releasedRetention - paid, 0),
      payments,
    };
  }) as SupplierInvoice[];

  return {
    ok: true,
    data: {
      suppliers: (suppliers.data ?? []).map((row) => ({
        ...row,
        payment_terms_days: Number(row.payment_terms_days),
      })) as Supplier[],
      situations: (situations.data ?? []) as SituationType[],
      stampRules: (stamps.data ?? []).map((row) => ({
        ...row,
        fixed_amount: row.fixed_amount == null ? null : Number(row.fixed_amount),
        rate: row.rate == null ? null : Number(row.rate),
        brackets: Array.isArray(row.brackets) ? row.brackets : [],
      })) as StampRule[],
      sequences: (sequences.data ?? []).map((row) => ({
        ...row,
        padding: Number(row.padding),
        next_value: Number(row.next_value),
      })) as NumberSequence[],
      proformas: (proformas.data ?? []).map((row) => ({
        ...row,
        total_ht: Number(row.total_ht),
        total_tva: Number(row.total_tva),
        total_ttc: Number(row.total_ttc),
        supplier_name: relation(row.supplier)?.legal_name ?? "—",
        lines: (row.lines ?? []).map((line) => ({
          ...line,
          quantity: Number(line.quantity),
          supply_unit_price_ht: Number(line.supply_unit_price_ht),
          installation_unit_price_ht: Number(line.installation_unit_price_ht),
          unit_price_ht: Number(line.unit_price_ht),
          total_ht: Number(line.total_ht),
          tax_rate: Number(line.tax_rate),
          tax_amount: Number(line.tax_amount),
        })),
      })) as Proforma[],
      orders: mappedOrders,
      receipts: (receipts.data ?? []).map((row) => ({
        ...row,
        order_number: relation(row.order)?.order_number ?? "—",
      })) as PurchaseReceipt[],
      invoices: mappedInvoices,
      taxRates: (taxRates.data ?? []).map((row) => ({ ...row, rate: Number(row.rate) })),
      accounts: accounts.data ?? [],
      paymentMethods: methods.data ?? [],
      sites: sites.data ?? [],
    },
  };
}

async function upsertRow(
  table: "pur_suppliers" | "ref_situation_types" | "fin_stamp_rules",
  payload: Record<string, unknown>,
  id?: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const query = id
    ? supabase.from(table).update(payload).eq("id", id)
    : supabase.from(table).insert(payload);
  const { data, error } = await query.select("id").maybeSingle();
  if (error) return fail(error);
  if (!data) return { ok: false, error: "Écriture refusée." };
  refreshPurchases();
  return { ok: true, data: { id: data.id } };
}

export async function upsertSupplier(input: unknown) {
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Fournisseur invalide" } as ActionResult<never>;
  const { id, ...payload } = parsed.data;
  return upsertRow("pur_suppliers", payload, id);
}

export async function upsertSituationType(input: unknown) {
  const parsed = situationTypeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Type invalide" } as ActionResult<never>;
  const { id, ...payload } = parsed.data;
  return upsertRow("ref_situation_types", payload, id);
}

export async function upsertStampRule(input: unknown) {
  const parsed = stampRuleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Règle invalide" } as ActionResult<never>;
  const { id, ...payload } = parsed.data;
  return upsertRow("fin_stamp_rules", payload, id);
}

export async function updateNumberSequence(input: unknown): Promise<ActionResult> {
  const parsed = numberSequenceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Séquence invalide" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("pur_number_sequences")
    .update(parsed.data)
    .eq("document_type", parsed.data.document_type);
  if (error) return fail(error);
  refreshPurchases();
  return { ok: true, data: undefined };
}

export async function createProforma(input: unknown): Promise<ActionResult<{ id: string; number: string }>> {
  const parsed = proformaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Proforma invalide" };
  const value = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pur_create_proforma", {
    p_supplier_id: value.supplier_id,
    p_site_id: value.site_id ?? undefined,
    p_proforma_number: value.proforma_number,
    p_supplier_reference: value.supplier_reference ?? undefined,
    p_proforma_date: value.proforma_date,
    p_validity_date: value.validity_date ?? undefined,
    p_currency_code: value.currency_code,
    p_delivery_terms: value.delivery_terms ?? undefined,
    p_payment_terms: value.payment_terms ?? undefined,
    p_attachment_url: value.attachment_url ?? undefined,
    p_note: value.note ?? undefined,
    p_lines: value.lines,
  });
  if (error) return fail(error);
  refreshPurchases();
  const result = (data ?? {}) as Record<string, unknown>;
  return { ok: true, data: { id: String(result.id), number: String(result.number) } };
}

export async function setProformaStatus(input: unknown): Promise<ActionResult> {
  const parsed = proformaStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Transition invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("pur_set_proforma_status", {
    p_proforma_id: parsed.data.proforma_id,
    p_status: parsed.data.status,
  });
  if (error) return fail(error);
  refreshPurchases();
  return { ok: true, data: undefined };
}

export async function createOrderFromProforma(input: unknown): Promise<ActionResult<{ id: string; number: string }>> {
  const parsed = orderFromProformaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Commande invalide" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pur_create_order_from_proforma", {
    p_proforma_id: parsed.data.proforma_id,
    p_order_number: parsed.data.order_number,
    p_order_date: parsed.data.order_date,
    p_expected_delivery_date: parsed.data.expected_delivery_date ?? undefined,
    p_delivery_address: parsed.data.delivery_address ?? undefined,
    p_note: parsed.data.note ?? undefined,
  });
  if (error) return fail(error);
  refreshPurchases();
  const result = (data ?? {}) as Record<string, unknown>;
  return { ok: true, data: { id: String(result.id), number: String(result.number) } };
}

export async function postReceipt(input: unknown): Promise<ActionResult<{ id: string; number: string }>> {
  const parsed = receiptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Réception invalide" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pur_post_receipt", {
    p_order_id: parsed.data.order_id,
    p_receipt_number: parsed.data.receipt_number,
    p_receipt_date: parsed.data.receipt_date,
    p_delivery_note_number: parsed.data.delivery_note_number ?? undefined,
    p_received_by_name: parsed.data.received_by_name ?? undefined,
    p_note: parsed.data.note ?? undefined,
    p_lines: parsed.data.lines,
  });
  if (error) return fail(error);
  refreshPurchases();
  const result = (data ?? {}) as Record<string, unknown>;
  return { ok: true, data: { id: String(result.id), number: String(result.number) } };
}

export async function postSupplierInvoice(input: unknown): Promise<ActionResult<{ id: string; number: string }>> {
  const parsed = supplierInvoiceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Facture invalide" };
  const value = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pur_post_supplier_invoice", {
    p_order_id: value.order_id,
    p_internal_number: value.internal_number,
    p_supplier_invoice_number: value.supplier_invoice_number,
    p_invoice_date: value.invoice_date,
    p_due_date: value.due_date ?? undefined,
    p_retention_rate: value.retention_rate,
    p_retention_due_date: value.retention_due_date ?? undefined,
    p_stamp_rule_id: value.stamp_rule_id ?? undefined,
    p_receipt_ids: value.receipt_ids,
    p_attachment_url: value.attachment_url ?? undefined,
    p_note: value.note ?? undefined,
    p_lines: value.lines,
  });
  if (error) return fail(error);
  refreshPurchases();
  const result = (data ?? {}) as Record<string, unknown>;
  return { ok: true, data: { id: String(result.id), number: String(result.number) } };
}

export async function postSupplierPayment(input: unknown): Promise<ActionResult> {
  const parsed = supplierPaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Paiement invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("pur_post_supplier_payment", {
    p_invoice_id: parsed.data.invoice_id,
    p_account_id: parsed.data.account_id,
    p_payment_method_id: parsed.data.payment_method_id,
    p_amount: parsed.data.amount,
    p_payment_date: parsed.data.payment_date,
    p_reference: parsed.data.reference ?? undefined,
    p_note: parsed.data.note ?? undefined,
  });
  if (error) return fail(error);
  refreshPurchases();
  return { ok: true, data: undefined };
}

export async function releaseSupplierRetention(invoiceId: string): Promise<ActionResult> {
  const parsed = idSchema.safeParse(invoiceId);
  if (!parsed.success) return { ok: false, error: "Facture invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("pur_release_supplier_retention", { p_invoice_id: parsed.data });
  if (error) return fail(error);
  refreshPurchases();
  return { ok: true, data: undefined };
}

export async function reverseSupplierPayment(input: unknown): Promise<ActionResult> {
  const parsed = supplierPaymentReverseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Extourne invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("pur_reverse_supplier_payment", {
    p_payment_id: parsed.data.payment_id,
    p_reversal_date: parsed.data.reversal_date,
    p_reason: parsed.data.reason,
  });
  if (error) return fail(error);
  refreshPurchases();
  return { ok: true, data: undefined };
}
