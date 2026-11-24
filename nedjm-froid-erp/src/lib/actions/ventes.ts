"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { createClient } from "@/lib/supabase/server";
import { computeInvoiceTotals, computeLineHt } from "@/lib/ventes/compute";
import type {
  SalDocKindRow,
  SalInvoiceLineRow,
  SalInvoiceRow,
  SalesRegisterRow,
} from "@/lib/ventes/db-types";
import { salInvoiceSaveSchema, salPaymentSchema } from "@/lib/validations/ventes";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export type VentesClientOption = {
  id: string;
  nom_fr: string;
  adresse: string | null;
  nif: string | null;
  article_imposition: string | null;
  rc: string | null;
  telephone: string | null;
};

export type VentesContractOption = {
  id: string;
  contract_number: string;
  status: string;
};

export type VentesListOption = {
  id: string;
  list_key: string;
  label: string;
};

export type VentesDefaults = {
  tax_rate: number;
  retention_rate: number;
  stamp_amount: number;
};

export type VentesDashboard = {
  rows: SalesRegisterRow[];
  kinds: SalDocKindRow[];
  clients: VentesClientOption[];
  banks: VentesListOption[];
  etabliePar: VentesListOption[];
  paymentModes: VentesListOption[];
  defaults: VentesDefaults;
  today: string;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canAdmin: boolean;
  /** Encaissement interne (sal_invoice_payments) — pas de lien Banque/Caisse. */
  canEncaisser: boolean;
};

export type SalInvoiceDetail = {
  invoice: SalInvoiceRow;
  lines: SalInvoiceLineRow[];
};

function fail(error: { message: string; code?: string } | string): ActionResult<never> {
  const message = typeof error === "string" ? error : error.message;
  const code = typeof error === "string" ? undefined : error.code;
  if (code === "23505") {
    return { ok: false, error: "Ce numéro de facture existe déjà pour l'exercice." };
  }
  return {
    ok: false,
    error:
      code === "42501" || message.toLowerCase().includes("permission")
        ? "Accès refusé (droits Ventes / Finance)."
        : message,
  };
}

function algiersToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Algiers",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function refresh() {
  revalidatePath("/ventes");
}

async function can(action: "create" | "read" | "update" | "delete"): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sal_can", { p_action: action });
  if (!error) return !!data;
  const fin = await supabase.rpc("fin_can_access", { p_action: action, p_site_id: null });
  return !fin.error && !!fin.data;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function blank(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t ? t : null;
}

function mapRegisterRow(raw: Record<string, unknown>): SalesRegisterRow {
  return {
    source: raw.source === "CONTRACT" ? "CONTRACT" : "SAL",
    id: String(raw.id),
    invoice_number: String(raw.invoice_number ?? ""),
    issue_date: String(raw.issue_date ?? "").slice(0, 10),
    doc_kind: String(raw.doc_kind ?? ""),
    status: String(raw.status ?? ""),
    client_id: raw.client_id ? String(raw.client_id) : null,
    client_name: String(raw.client_name ?? "—"),
    contract_id: raw.contract_id ? String(raw.contract_id) : null,
    contract_ref: raw.contract_ref ? String(raw.contract_ref) : null,
    period_label: raw.period_label ? String(raw.period_label) : null,
    expected_bank_label: raw.expected_bank_label ? String(raw.expected_bank_label) : null,
    total_ht: num(raw.total_ht),
    total_tva: num(raw.total_tva),
    retention_amount: num(raw.retention_amount),
    stamp_amount: num(raw.stamp_amount),
    net_payable: num(raw.net_payable),
    paid_ttc: num(raw.paid_ttc),
    due_ttc: num(raw.due_ttc),
    last_payment_date: raw.last_payment_date ? String(raw.last_payment_date).slice(0, 10) : null,
    exo_attestation_no: raw.exo_attestation_no ? String(raw.exo_attestation_no) : null,
    fiscal_year: Math.trunc(num(raw.fiscal_year)) || new Date().getFullYear(),
    created_at: String(raw.created_at ?? ""),
  };
}

function mapInvoice(raw: Record<string, unknown>): SalInvoiceRow {
  return {
    id: String(raw.id),
    doc_kind: String(raw.doc_kind ?? ""),
    number: String(raw.number ?? ""),
    fiscal_year: Math.trunc(num(raw.fiscal_year)),
    issue_date: String(raw.issue_date ?? "").slice(0, 10),
    client_id: String(raw.client_id),
    contract_id: raw.contract_id ? String(raw.contract_id) : null,
    client_name: String(raw.client_name ?? ""),
    client_address: raw.client_address ? String(raw.client_address) : null,
    client_nif: raw.client_nif ? String(raw.client_nif) : null,
    client_article: raw.client_article ? String(raw.client_article) : null,
    client_rc: raw.client_rc ? String(raw.client_rc) : null,
    client_phone: raw.client_phone ? String(raw.client_phone) : null,
    contract_ref: raw.contract_ref ? String(raw.contract_ref) : null,
    period_label: raw.period_label ? String(raw.period_label) : null,
    established_by: raw.established_by ? String(raw.established_by) : null,
    expected_bank_label: raw.expected_bank_label ? String(raw.expected_bank_label) : null,
    situation_type_id: raw.situation_type_id ? String(raw.situation_type_id) : null,
    tax_mode: (raw.tax_mode as SalInvoiceRow["tax_mode"]) || "TAXABLE",
    tax_rate: num(raw.tax_rate),
    exo_attestation_no: raw.exo_attestation_no ? String(raw.exo_attestation_no) : null,
    exo_attestation_date: raw.exo_attestation_date
      ? String(raw.exo_attestation_date).slice(0, 10)
      : null,
    currency: String(raw.currency ?? "DZD"),
    status: raw.status as SalInvoiceRow["status"],
    total_ht: num(raw.total_ht),
    total_tva: num(raw.total_tva),
    retention_rate: num(raw.retention_rate),
    retention_amount: num(raw.retention_amount),
    stamp_rule_id: raw.stamp_rule_id ? String(raw.stamp_rule_id) : null,
    stamp_amount: num(raw.stamp_amount),
    net_payable: num(raw.net_payable),
    note: raw.note ? String(raw.note) : null,
    source: (raw.source as SalInvoiceRow["source"]) || "MANUAL",
    import_batch_id: raw.import_batch_id ? String(raw.import_batch_id) : null,
    issued_at: raw.issued_at ? String(raw.issued_at) : null,
    cancelled_at: raw.cancelled_at ? String(raw.cancelled_at) : null,
    created_by: raw.created_by ? String(raw.created_by) : null,
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
  };
}

function mapLine(raw: Record<string, unknown>): SalInvoiceLineRow {
  return {
    id: String(raw.id),
    invoice_id: String(raw.invoice_id),
    line_no: Math.trunc(num(raw.line_no)),
    item_code: raw.item_code ? String(raw.item_code) : null,
    designation: String(raw.designation ?? ""),
    unit: raw.unit ? String(raw.unit) : null,
    qty: num(raw.qty),
    unit_price_ht: num(raw.unit_price_ht),
    pose_price_ht: num(raw.pose_price_ht),
    line_ht: num(raw.line_ht),
    tax_rate_id: raw.tax_rate_id ? String(raw.tax_rate_id) : null,
    source_invoice_ref: raw.source_invoice_ref ? String(raw.source_invoice_ref) : null,
    source_invoice_id: raw.source_invoice_id ? String(raw.source_invoice_id) : null,
    source_amount: num(raw.source_amount),
    created_at: String(raw.created_at ?? ""),
  };
}

async function suggestNumber(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fiscalYear: number,
): Promise<string> {
  const { data } = await supabase
    .from("sal_invoices")
    .select("number")
    .eq("fiscal_year", fiscalYear)
    .order("created_at", { ascending: false })
    .limit(200);
  let max = 0;
  for (const row of data ?? []) {
    const n = Number(String((row as { number?: string }).number ?? "").replace(/\D/g, ""));
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return String(max + 1);
}

export async function getVentesDashboard(): Promise<ActionResult<VentesDashboard>> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return fail("Session requise.");

  const supabase = await createClient();
  const [
    canRead,
    canCreate,
    canUpdate,
    canDelete,
    canAdminRes,
    registerRes,
    kindsRes,
    clientsRes,
    listsRes,
    settingsRes,
  ] = await Promise.all([
    can("read"),
    can("create"),
    can("update"),
    can("delete"),
    supabase.rpc("sal_is_admin"),
    supabase
      .from("v_sales_register")
      .select(
        "source, id, invoice_number, issue_date, doc_kind, status, client_id, client_name, contract_id, contract_ref, period_label, expected_bank_label, total_ht, total_tva, retention_amount, stamp_amount, net_payable, paid_ttc, due_ttc, last_payment_date, exo_attestation_no, fiscal_year, created_at",
      )
      .order("issue_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("sal_doc_kinds")
      .select("code, label_fr, label_ar, has_pose, is_rg_release, is_free_amount, active, sort_order")
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("ref_clients")
      .select("id, nom_fr, adresse, nif, article_imposition, rc, telephone")
      .order("nom_fr")
      .limit(2000),
    supabase
      .from("sal_lists")
      .select("id, list_key, label, sort_order")
      .eq("active", true)
      .order("sort_order")
      .order("label"),
    supabase.from("sal_settings").select("value").eq("key", "defaults").maybeSingle(),
  ]);

  if (!canRead) return fail("Accès refusé (droits Ventes / Finance).");
  if (registerRes.error) return fail(registerRes.error);
  if (kindsRes.error) return fail(kindsRes.error);
  if (clientsRes.error) return fail(clientsRes.error);
  // lists/settings may be missing before migration — degrade gracefully
  const listRows = listsRes.error ? [] : (listsRes.data ?? []);
  const defaultsRaw = (settingsRes.data?.value ?? {}) as Record<string, unknown>;

  const mapList = (key: string): VentesListOption[] =>
    listRows
      .filter((l) => String(l.list_key) === key)
      .map((l) => ({ id: String(l.id), list_key: String(l.list_key), label: String(l.label) }));

  return {
    ok: true,
    data: {
      rows: (registerRes.data ?? []).map((r) => mapRegisterRow(r as Record<string, unknown>)),
      kinds: (kindsRes.data ?? []) as SalDocKindRow[],
      clients: (clientsRes.data ?? []).map((c) => ({
        id: String(c.id),
        nom_fr: String(c.nom_fr ?? ""),
        adresse: c.adresse ? String(c.adresse) : null,
        nif: c.nif ? String(c.nif) : null,
        article_imposition: c.article_imposition ? String(c.article_imposition) : null,
        rc: c.rc ? String(c.rc) : null,
        telephone: c.telephone ? String(c.telephone) : null,
      })),
      banks: mapList("BANK_EXPECTED"),
      etabliePar: mapList("ETABLIE_PAR"),
      paymentModes: mapList("PAYMENT_MODE"),
      defaults: {
        tax_rate: Number(defaultsRaw.tax_rate ?? 0) || 0,
        retention_rate: Number(defaultsRaw.retention_rate ?? 0.1) || 0,
        stamp_amount: Number(defaultsRaw.stamp_amount ?? 0) || 0,
      },
      today: algiersToday(),
      canCreate,
      canUpdate,
      canDelete,
      canAdmin: !canAdminRes.error && !!canAdminRes.data,
      canEncaisser: canUpdate || canCreate,
    },
  };
}

export async function listVentesClientContracts(
  clientId: string,
): Promise<ActionResult<VentesContractOption[]>> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return fail("Session requise.");
  if (!(await can("read"))) return fail("Accès refusé (droits Ventes / Finance).");
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return fail("Client invalide.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ref_contracts")
    .select("id, contract_number, status")
    .eq("client_id", clientId)
    .order("contract_number");
  if (error) return fail(error);
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: String(r.id),
      contract_number: String(r.contract_number ?? ""),
      status: String(r.status ?? ""),
    })),
  };
}

export async function getSalInvoiceDetail(
  invoiceId: string,
): Promise<ActionResult<SalInvoiceDetail>> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return fail("Session requise.");
  if (!(await can("read"))) return fail("Accès refusé (droits Ventes / Finance).");
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) return fail("Facture invalide.");

  const supabase = await createClient();
  const [invRes, linesRes] = await Promise.all([
    supabase.from("sal_invoices").select("*").eq("id", invoiceId).maybeSingle(),
    supabase
      .from("sal_invoice_lines")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("line_no"),
  ]);
  if (invRes.error) return fail(invRes.error);
  if (!invRes.data) return fail("Facture introuvable.");
  if (linesRes.error) return fail(linesRes.error);

  return {
    ok: true,
    data: {
      invoice: mapInvoice(invRes.data as Record<string, unknown>),
      lines: (linesRes.data ?? []).map((l) => mapLine(l as Record<string, unknown>)),
    },
  };
}

export async function saveSalInvoice(
  input: unknown,
): Promise<ActionResult<{ id: string; number: string; status: string; net_payable: number }>> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return fail("Session requise.");

  const parsed = salInvoiceSaveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const p = parsed.data;
  const isNew = !p.id;
  if (isNew && !(await can("create"))) return fail("Création refusée (droits Ventes).");
  if (!isNew && !(await can("update"))) return fail("Modification refusée (droits Ventes).");

  const fiscalYear = Number(p.issue_date.slice(0, 4));
  const totals = computeInvoiceTotals({
    doc_kind: p.doc_kind,
    tax_rate: p.tax_rate,
    retention_rate: p.retention_rate,
    stamp_amount: p.stamp_amount,
    lines: p.lines,
  });
  if (!(totals.net_payable >= 0) || !(totals.total_ht > 0)) {
    return fail("Montant HT invalide — vérifiez les lignes.");
  }

  const supabase = await createClient();
  let number = (p.number || "").trim();
  if (!number) number = await suggestNumber(supabase, fiscalYear);

  const header = {
    doc_kind: p.doc_kind,
    number,
    fiscal_year: fiscalYear,
    issue_date: p.issue_date,
    client_id: p.client_id,
    contract_id: p.contract_id || null,
    client_name: p.client_name.trim(),
    client_address: blank(p.client_address),
    client_nif: blank(p.client_nif),
    client_article: blank(p.client_article),
    client_rc: blank(p.client_rc),
    client_phone: blank(p.client_phone),
    contract_ref: blank(p.contract_ref),
    period_label: blank(p.period_label),
    established_by: blank(p.established_by),
    expected_bank_label: blank(p.expected_bank_label),
    tax_mode: totals.tax_mode,
    tax_rate: p.tax_rate,
    exo_attestation_no: blank(p.exo_attestation_no),
    exo_attestation_date: p.exo_attestation_date || null,
    retention_rate: p.retention_rate,
    retention_amount: totals.retention_amount,
    stamp_amount: totals.stamp_amount,
    total_ht: totals.total_ht,
    total_tva: totals.total_tva,
    net_payable: totals.net_payable,
    note: blank(p.note),
    source: "MANUAL" as const,
  };

  const lineRows = p.lines.map((line, idx) => ({
    line_no: idx + 1,
    item_code: blank(line.item_code),
    designation: line.designation.trim(),
    unit: blank(line.unit),
    qty: p.doc_kind === "SIT" ? 1 : line.qty,
    unit_price_ht: line.unit_price_ht,
    pose_price_ht: p.doc_kind === "FP" ? line.pose_price_ht : 0,
    line_ht: computeLineHt(p.doc_kind, line),
    source_invoice_ref: blank(line.source_invoice_ref),
    source_amount: line.source_amount || 0,
  }));

  let invoiceId = p.id ?? "";

  if (isNew) {
    const insertRes = await supabase
      .from("sal_invoices")
      .insert({
        ...header,
        status: "BROUILLON",
        created_by: workspace.id,
      })
      .select("id, number, status")
      .single();
    if (insertRes.error) return fail(insertRes.error);
    invoiceId = String(insertRes.data.id);
  } else {
    const existing = await supabase
      .from("sal_invoices")
      .select("id, status")
      .eq("id", p.id!)
      .maybeSingle();
    if (existing.error) return fail(existing.error);
    if (!existing.data) return fail("Facture introuvable.");
    if (existing.data.status !== "BROUILLON") {
      return fail("Seuls les brouillons sont modifiables.");
    }
    const upd = await supabase.from("sal_invoices").update(header).eq("id", p.id!).eq("status", "BROUILLON");
    if (upd.error) return fail(upd.error);
    const del = await supabase.from("sal_invoice_lines").delete().eq("invoice_id", p.id!);
    if (del.error) return fail(del.error);
  }

  const linesIns = await supabase.from("sal_invoice_lines").insert(
    lineRows.map((l) => ({ ...l, invoice_id: invoiceId })),
  );
  if (linesIns.error) {
    if (isNew) {
      await supabase.from("sal_invoices").delete().eq("id", invoiceId).eq("status", "BROUILLON");
    }
    return fail(linesIns.error);
  }

  let status = "BROUILLON";
  if (p.issue) {
    if (!(await can("update")) && !isNew) {
      // already checked update for edit; for new+issue need update OR create is enough if create implies issue
    }
    const issueRes = await supabase
      .from("sal_invoices")
      .update({ status: "EMISE", issued_at: new Date().toISOString() })
      .eq("id", invoiceId)
      .eq("status", "BROUILLON")
      .select("status")
      .maybeSingle();
    if (issueRes.error) return fail(issueRes.error);
    if (!issueRes.data) return fail("Émission impossible.");
    status = "EMISE";
  }

  await supabase.from("sal_audit").insert({
    actor: workspace.id,
    action: p.issue ? "ISSUE" : isNew ? "CREATE" : "UPDATE",
    entity: "sal_invoices",
    entity_id: invoiceId,
    detail: `Facture ${number} (${p.doc_kind})`,
    payload: { number, doc_kind: p.doc_kind, net_payable: totals.net_payable, status },
  });

  refresh();
  return {
    ok: true,
    data: {
      id: invoiceId,
      number,
      status,
      net_payable: totals.net_payable,
    },
  };
}

export async function deleteSalInvoiceDraft(
  invoiceId: string,
): Promise<ActionResult<{ id: string }>> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return fail("Session requise.");
  if (!(await can("delete")) && !(await can("update"))) {
    return fail("Suppression refusée (droits Ventes).");
  }
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) return fail("Facture invalide.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sal_invoices")
    .delete()
    .eq("id", invoiceId)
    .eq("status", "BROUILLON")
    .select("id")
    .maybeSingle();
  if (error) return fail(error);
  if (!data) return fail("Brouillon introuvable (ou déjà émis).");

  await supabase.from("sal_audit").insert({
    actor: workspace.id,
    action: "DELETE_DRAFT",
    entity: "sal_invoices",
    entity_id: invoiceId,
    detail: "Suppression brouillon",
    payload: {},
  });
  refresh();
  return { ok: true, data: { id: invoiceId } };
}

/**
 * Encaissement interne Ventes uniquement.
 * Écrit sal_invoice_payments — sans fin_transactions / Banque / Caisse.
 */
export async function recordSalPayment(
  input: unknown,
): Promise<
  ActionResult<{ id: string; invoice_id: string; amount_ttc: number; due_ttc: number }>
> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return fail("Session requise.");
  if (!(await can("update")) && !(await can("create"))) {
    return fail("Encaissement refusé (droits Ventes).");
  }

  const parsed = salPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const p = parsed.data;
  const supabase = await createClient();

  const invRes = await supabase
    .from("sal_invoices")
    .select("id, number, status, net_payable, total_ht, total_tva")
    .eq("id", p.invoice_id)
    .maybeSingle();
  if (invRes.error) return fail(invRes.error);
  if (!invRes.data) return fail("Facture introuvable (module Ventes uniquement).");
  if (invRes.data.status !== "EMISE") {
    return fail("Seules les factures émises peuvent être encaissées.");
  }

  const paidRes = await supabase
    .from("sal_invoice_payments")
    .select("amount_ttc, direction")
    .eq("invoice_id", p.invoice_id);
  if (paidRes.error) return fail(paidRes.error);
  const paid = (paidRes.data ?? []).reduce(
    (s, row) => s + num(row.amount_ttc) * (Number(row.direction) || 1),
    0,
  );
  const net = num(invRes.data.net_payable);
  const due = Math.round((Math.max(0, net - paid) + Number.EPSILON) * 100) / 100;
  if (p.amount_ttc > due + 0.009) {
    return fail(`Montant supérieur au reste dû (${due.toFixed(2)} DA).`);
  }

  const totalHt = num(invRes.data.total_ht);
  const totalTva = num(invRes.data.total_tva);
  const base = totalHt + totalTva;
  let amountHt = p.amount_ttc;
  let amountTva = 0;
  if (base > 0.009) {
    amountHt = Math.round(((p.amount_ttc * totalHt) / base) * 100) / 100;
    amountTva = Math.round((p.amount_ttc - amountHt) * 100) / 100;
  }

  const noteParts = [
    blank(p.method_label) ? `Mode: ${p.method_label.trim()}` : null,
    blank(p.account_label) ? `Banque: ${p.account_label.trim()}` : null,
    blank(p.note),
  ].filter(Boolean);

  const insertRes = await supabase
    .from("sal_invoice_payments")
    .insert({
      invoice_id: p.invoice_id,
      payment_date: p.payment_date,
      account_id: null,
      payment_method_id: null,
      amount_ht: amountHt,
      amount_tva: amountTva,
      amount_ttc: p.amount_ttc,
      direction: 1,
      financial_transaction_id: null,
      bank_line_id: null,
      reference: blank(p.reference) ?? blank(p.account_label),
      note: noteParts.length ? noteParts.join(" · ") : null,
      created_by: workspace.id,
    })
    .select("id")
    .single();
  if (insertRes.error) return fail(insertRes.error);

  const newDue = Math.round((Math.max(0, due - p.amount_ttc) + Number.EPSILON) * 100) / 100;

  await supabase.from("sal_audit").insert({
    actor: workspace.id,
    action: "PAYMENT",
    entity: "sal_invoice_payments",
    entity_id: insertRes.data.id,
    detail: `Encaissement ${p.amount_ttc} DA — facture ${invRes.data.number}`,
    payload: {
      invoice_id: p.invoice_id,
      amount_ttc: p.amount_ttc,
      isolated: true,
      linked_finance: false,
    },
  });

  refresh();
  return {
    ok: true,
    data: {
      id: String(insertRes.data.id),
      invoice_id: p.invoice_id,
      amount_ttc: p.amount_ttc,
      due_ttc: newDue,
    },
  };
}

/** Annulation d'un encaissement via écriture inverse (append-only). */
export async function reverseSalPayment(
  paymentId: string,
): Promise<ActionResult<{ id: string }>> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return fail("Session requise.");
  if (!(await can("update")) && !(await can("delete"))) {
    return fail("Annulation refusée (droits Ventes).");
  }
  if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return fail("Paiement invalide.");

  const supabase = await createClient();
  const { data: pay, error } = await supabase
    .from("sal_invoice_payments")
    .select(
      "id, invoice_id, payment_date, amount_ht, amount_tva, amount_ttc, direction, reversal_of",
    )
    .eq("id", paymentId)
    .maybeSingle();
  if (error) return fail(error);
  if (!pay) return fail("Paiement introuvable.");
  if (Number(pay.direction) !== 1) return fail("Ce mouvement n'est pas un encaissement.");
  if (pay.reversal_of) return fail("Paiement déjà lié à une annulation.");

  const existingRev = await supabase
    .from("sal_invoice_payments")
    .select("id")
    .eq("reversal_of", paymentId)
    .limit(1)
    .maybeSingle();
  if (existingRev.error) return fail(existingRev.error);
  if (existingRev.data) return fail("Encaissement déjà annulé.");

  const ins = await supabase
    .from("sal_invoice_payments")
    .insert({
      invoice_id: pay.invoice_id,
      payment_date: algiersToday(),
      amount_ht: num(pay.amount_ht),
      amount_tva: num(pay.amount_tva),
      amount_ttc: num(pay.amount_ttc),
      direction: -1,
      financial_transaction_id: null,
      bank_line_id: null,
      account_id: null,
      payment_method_id: null,
      reversal_of: pay.id,
      reference: `ANNULATION ${String(pay.id).slice(0, 8)}`,
      note: "Annulation encaissement interne Ventes",
      created_by: workspace.id,
    })
    .select("id")
    .single();
  if (ins.error) return fail(ins.error);

  await supabase.from("sal_audit").insert({
    actor: workspace.id,
    action: "PAYMENT_REVERSE",
    entity: "sal_invoice_payments",
    entity_id: ins.data.id,
    detail: `Annulation paiement ${paymentId}`,
    payload: { reversal_of: paymentId, isolated: true },
  });

  refresh();
  return { ok: true, data: { id: String(ins.data.id) } };
}
