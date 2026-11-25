"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { createClient } from "@/lib/supabase/server";
import { frenchAmountWords } from "@/lib/hr/doc-format";
import { computeOrderLineHt, computeOrderTotals } from "@/lib/ventes/order-compute";
import type { SalOrderLineRow, SalOrderRow } from "@/lib/ventes/order-types";
import { salOrderSaveSchema } from "@/lib/validations/ventes-orders";
import type { VentesClientOption, VentesContractOption, VentesListOption } from "@/lib/actions/ventes";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export type SalOrderListItem = Pick<
  SalOrderRow,
  | "id"
  | "order_number"
  | "order_date"
  | "client_name"
  | "status"
  | "total_ht"
  | "total_tva"
  | "retention_amount"
  | "stamp_amount"
  | "net_payable"
  | "has_pose"
  | "payment_terms"
>;

export type SalOrdersDashboard = {
  orders: SalOrderListItem[];
  clients: VentesClientOption[];
  etabliePar: VentesListOption[];
  today: string;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
};

export type SalOrderDetail = {
  order: SalOrderRow;
  lines: SalOrderLineRow[];
};

function fail(error: { message: string; code?: string } | string): ActionResult<never> {
  const message = typeof error === "string" ? error : error.message;
  const code = typeof error === "string" ? undefined : error.code;
  if (code === "23505") {
    return { ok: false, error: "Ce numéro de bon de commande existe déjà pour l'exercice." };
  }
  return {
    ok: false,
    error:
      code === "42501" || message.toLowerCase().includes("permission")
        ? "Accès refusé (droits Ventes)."
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

function blank(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t ? t : null;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapOrder(raw: Record<string, unknown>): SalOrderRow {
  return {
    id: String(raw.id),
    order_number: String(raw.order_number ?? ""),
    fiscal_year: num(raw.fiscal_year),
    order_date: String(raw.order_date ?? "").slice(0, 10),
    client_id: String(raw.client_id),
    contract_id: raw.contract_id ? String(raw.contract_id) : null,
    client_name: String(raw.client_name ?? ""),
    client_address: (raw.client_address as string | null) ?? null,
    client_nif: (raw.client_nif as string | null) ?? null,
    client_article: (raw.client_article as string | null) ?? null,
    client_rc: (raw.client_rc as string | null) ?? null,
    client_phone: (raw.client_phone as string | null) ?? null,
    contract_ref: (raw.contract_ref as string | null) ?? null,
    payment_terms: (raw.payment_terms as string | null) ?? null,
    delivery_delay: (raw.delivery_delay as string | null) ?? null,
    buyer_name: (raw.buyer_name as string | null) ?? null,
    established_by: (raw.established_by as string | null) ?? null,
    has_pose: !!raw.has_pose,
    tax_rate: num(raw.tax_rate),
    discount_amount: num(raw.discount_amount),
    retention_rate: num(raw.retention_rate),
    retention_amount: num(raw.retention_amount),
    stamp_amount: num(raw.stamp_amount),
    total_ht: num(raw.total_ht),
    total_ht_net: num(raw.total_ht_net),
    total_tva: num(raw.total_tva),
    total_ttc: num(raw.total_ttc),
    net_payable: num(raw.net_payable),
    amount_in_words: (raw.amount_in_words as string | null) ?? null,
    note: (raw.note as string | null) ?? null,
    status: (raw.status as SalOrderRow["status"]) || "BROUILLON",
    issued_at: (raw.issued_at as string | null) ?? null,
    cancelled_at: (raw.cancelled_at as string | null) ?? null,
    created_at: String(raw.created_at ?? ""),
  };
}

async function suggestOrderNumber(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fiscalYear: number,
): Promise<string> {
  const { data } = await supabase
    .from("sal_orders")
    .select("order_number")
    .eq("fiscal_year", fiscalYear)
    .order("created_at", { ascending: false })
    .limit(50);
  let max = 0;
  for (const row of data ?? []) {
    const m = String(row.order_number ?? "").match(/(\d+)\s*$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return String(max + 1);
}

export async function getSalOrdersDashboard(): Promise<ActionResult<SalOrdersDashboard>> {
  if (!(await can("read"))) return fail("Accès refusé (droits Ventes).");
  const supabase = await createClient();

  const [ordersRes, clientsRes, listsRes] = await Promise.all([
    supabase
      .from("sal_orders")
      .select(
        "id, order_number, order_date, client_name, status, total_ht, total_tva, retention_amount, stamp_amount, net_payable, has_pose, payment_terms",
      )
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("ref_clients")
      .select("id, nom_fr, adresse, nif, article_imposition, rc, telephone")
      .order("nom_fr")
      .limit(1000),
    supabase
      .from("sal_lists")
      .select("id, list_key, label")
      .eq("list_key", "etablie_par")
      .eq("active", true)
      .order("sort_order"),
  ]);

  if (ordersRes.error) {
    if (ordersRes.error.message.toLowerCase().includes("does not exist")) {
      return {
        ok: true,
        data: {
          orders: [],
          clients: [],
          etabliePar: [],
          today: algiersToday(),
          canCreate: false,
          canUpdate: false,
          canDelete: false,
        },
      };
    }
    return fail(ordersRes.error);
  }

  const clients: VentesClientOption[] = (clientsRes.data ?? []).map((c) => ({
    id: String(c.id),
    nom_fr: String(c.nom_fr),
    adresse: (c.adresse as string | null) ?? null,
    nif: (c.nif as string | null) ?? null,
    article_imposition: (c.article_imposition as string | null) ?? null,
    rc: (c.rc as string | null) ?? null,
    telephone: (c.telephone as string | null) ?? null,
  }));

  const etabliePar: VentesListOption[] = (listsRes.data ?? []).map((r) => ({
    id: String(r.id),
    list_key: String(r.list_key),
    label: String(r.label),
  }));

  return {
    ok: true,
    data: {
      orders: (ordersRes.data ?? []).map((r) => ({
        id: String(r.id),
        order_number: String(r.order_number),
        order_date: String(r.order_date).slice(0, 10),
        client_name: String(r.client_name),
        status: r.status as SalOrderListItem["status"],
        total_ht: num(r.total_ht),
        total_tva: num(r.total_tva),
        retention_amount: num(r.retention_amount),
        stamp_amount: num(r.stamp_amount),
        net_payable: num(r.net_payable),
        has_pose: !!r.has_pose,
        payment_terms: (r.payment_terms as string | null) ?? null,
      })),
      clients,
      etabliePar,
      today: algiersToday(),
      canCreate: await can("create"),
      canUpdate: await can("update"),
      canDelete: await can("delete"),
    },
  };
}

export async function listVentesOrderClientContracts(
  clientId: string,
): Promise<ActionResult<VentesContractOption[]>> {
  if (!clientId || !(await can("read"))) return { ok: true, data: [] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ref_contracts")
    .select("id, contract_number, status")
    .eq("client_id", clientId)
    .order("contract_number")
    .limit(200);
  if (error) return fail(error);
  return {
    ok: true,
    data: (data ?? []).map((c) => ({
      id: String(c.id),
      contract_number: String(c.contract_number),
      status: String(c.status),
    })),
  };
}

export async function getSalOrderDetail(orderId: string): Promise<ActionResult<SalOrderDetail>> {
  if (!(await can("read"))) return fail("Accès refusé (droits Ventes).");
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return fail("Bon de commande invalide.");
  const supabase = await createClient();
  const [orderRes, linesRes] = await Promise.all([
    supabase.from("sal_orders").select("*").eq("id", orderId).maybeSingle(),
    supabase
      .from("sal_order_lines")
      .select("*")
      .eq("order_id", orderId)
      .order("line_no"),
  ]);
  if (orderRes.error) return fail(orderRes.error);
  if (!orderRes.data) return fail("Bon de commande introuvable.");
  if (linesRes.error) return fail(linesRes.error);

  return {
    ok: true,
    data: {
      order: mapOrder(orderRes.data as Record<string, unknown>),
      lines: (linesRes.data ?? []).map((l) => ({
        id: String(l.id),
        order_id: String(l.order_id),
        line_no: num(l.line_no),
        item_code: (l.item_code as string | null) ?? null,
        designation: String(l.designation),
        unit: (l.unit as string | null) ?? null,
        qty: num(l.qty),
        unit_price_ht: num(l.unit_price_ht),
        pose_price_ht: num(l.pose_price_ht),
        line_ht: num(l.line_ht),
        line_tax_rate: num(l.line_tax_rate),
      })),
    },
  };
}

export async function saveSalOrder(
  input: unknown,
): Promise<ActionResult<{ id: string; order_number: string; status: string; net_payable: number }>> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return fail("Session requise.");

  const parsed = salOrderSaveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const p = parsed.data;
  const isNew = !p.id;
  if (isNew && !(await can("create"))) return fail("Création refusée (droits Ventes).");
  if (!isNew && !(await can("update"))) return fail("Modification refusée (droits Ventes).");

  const fiscalYear = Number(p.order_date.slice(0, 4));
  const totals = computeOrderTotals({
    has_pose: p.has_pose,
    tax_rate: p.tax_rate,
    discount_amount: p.discount_amount,
    retention_rate: p.retention_rate,
    stamp_amount: p.stamp_amount,
    lines: p.lines,
  });
  if (!(totals.total_ht > 0)) {
    return fail("Montant HT invalide — vérifiez les lignes.");
  }

  const supabase = await createClient();
  let orderNumber = (p.order_number || "").trim();
  if (!orderNumber) orderNumber = await suggestOrderNumber(supabase, fiscalYear);

  const amountInWords = frenchAmountWords(totals.net_payable);

  const header = {
    order_number: orderNumber,
    fiscal_year: fiscalYear,
    order_date: p.order_date,
    client_id: p.client_id,
    contract_id: p.contract_id || null,
    client_name: p.client_name.trim(),
    client_address: blank(p.client_address),
    client_nif: blank(p.client_nif),
    client_article: blank(p.client_article),
    client_rc: blank(p.client_rc),
    client_phone: blank(p.client_phone),
    contract_ref: blank(p.contract_ref),
    payment_terms: blank(p.payment_terms),
    delivery_delay: blank(p.delivery_delay),
    buyer_name: blank(p.buyer_name),
    established_by: blank(p.established_by),
    has_pose: p.has_pose,
    tax_rate: p.tax_rate,
    discount_amount: totals.discount_amount,
    retention_rate: p.retention_rate,
    retention_amount: totals.retention_amount,
    stamp_amount: totals.stamp_amount,
    total_ht: totals.total_ht,
    total_ht_net: totals.total_ht_net,
    total_tva: totals.total_tva,
    total_ttc: totals.total_ttc,
    net_payable: totals.net_payable,
    amount_in_words: amountInWords,
    note: blank(p.note),
  };

  const lineRows = p.lines.map((line, idx) => ({
    line_no: idx + 1,
    item_code: blank(line.item_code),
    designation: line.designation.trim(),
    unit: blank(line.unit) || "U",
    qty: line.qty,
    unit_price_ht: line.unit_price_ht,
    pose_price_ht: p.has_pose ? line.pose_price_ht : 0,
    line_ht: computeOrderLineHt(line, p.has_pose),
    line_tax_rate: p.tax_rate,
  }));

  let orderId = p.id ?? "";

  if (isNew) {
    const insertRes = await supabase
      .from("sal_orders")
      .insert({
        ...header,
        status: "BROUILLON",
        created_by: workspace.id,
      })
      .select("id, order_number, status")
      .single();
    if (insertRes.error) return fail(insertRes.error);
    orderId = String(insertRes.data.id);
  } else {
    const existing = await supabase
      .from("sal_orders")
      .select("id, status")
      .eq("id", p.id!)
      .maybeSingle();
    if (existing.error) return fail(existing.error);
    if (!existing.data) return fail("Bon de commande introuvable.");
    if (existing.data.status !== "BROUILLON") {
      return fail("Seuls les brouillons sont modifiables.");
    }
    const upd = await supabase
      .from("sal_orders")
      .update(header)
      .eq("id", p.id!)
      .eq("status", "BROUILLON");
    if (upd.error) return fail(upd.error);
    const del = await supabase.from("sal_order_lines").delete().eq("order_id", p.id!);
    if (del.error) return fail(del.error);
  }

  const linesIns = await supabase
    .from("sal_order_lines")
    .insert(lineRows.map((l) => ({ ...l, order_id: orderId })));
  if (linesIns.error) {
    if (isNew) {
      await supabase.from("sal_orders").delete().eq("id", orderId).eq("status", "BROUILLON");
    }
    return fail(linesIns.error);
  }

  let status = "BROUILLON";
  if (p.issue) {
    const issueRes = await supabase
      .from("sal_orders")
      .update({ status: "EMIS", issued_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("status", "BROUILLON")
      .select("status")
      .maybeSingle();
    if (issueRes.error) return fail(issueRes.error);
    if (!issueRes.data) return fail("Émission impossible.");
    status = "EMIS";
  }

  await supabase.from("sal_audit").insert({
    actor: workspace.id,
    action: p.issue ? "ISSUE" : isNew ? "CREATE" : "UPDATE",
    entity: "sal_orders",
    entity_id: orderId,
    detail: `Bon de commande ${orderNumber}`,
    payload: { order_number: orderNumber, net_payable: totals.net_payable, status },
  });

  refresh();
  return {
    ok: true,
    data: {
      id: orderId,
      order_number: orderNumber,
      status,
      net_payable: totals.net_payable,
    },
  };
}

export async function deleteSalOrderDraft(
  orderId: string,
): Promise<ActionResult<{ id: string }>> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return fail("Session requise.");
  if (!(await can("delete")) && !(await can("update"))) {
    return fail("Suppression refusée (droits Ventes).");
  }
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return fail("Bon de commande invalide.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sal_orders")
    .delete()
    .eq("id", orderId)
    .eq("status", "BROUILLON")
    .select("id")
    .maybeSingle();
  if (error) return fail(error);
  if (!data) return fail("Brouillon introuvable (ou déjà émis).");

  await supabase.from("sal_audit").insert({
    actor: workspace.id,
    action: "DELETE_DRAFT",
    entity: "sal_orders",
    entity_id: orderId,
    detail: "Suppression brouillon BC",
    payload: {},
  });
  refresh();
  return { ok: true, data: { id: orderId } };
}

export async function cancelSalOrder(
  orderId: string,
): Promise<ActionResult<{ id: string; status: string }>> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return fail("Session requise.");
  if (!(await can("update"))) return fail("Annulation refusée (droits Ventes).");
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return fail("Bon de commande invalide.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sal_orders")
    .update({ status: "ANNULE", cancelled_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "EMIS")
    .select("id, status, order_number")
    .maybeSingle();
  if (error) return fail(error);
  if (!data) return fail("Bon de commande émis introuvable.");

  await supabase.from("sal_audit").insert({
    actor: workspace.id,
    action: "CANCEL",
    entity: "sal_orders",
    entity_id: orderId,
    detail: `Annulation BC ${data.order_number}`,
    payload: {},
  });
  refresh();
  return { ok: true, data: { id: String(data.id), status: String(data.status) } };
}
