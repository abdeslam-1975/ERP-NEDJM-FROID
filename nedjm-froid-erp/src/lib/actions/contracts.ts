"use server";

import { revalidatePath } from "next/cache";
import {
  elGassiDefaultAttributes,
  normalizeContractAttributes,
  type ContractAttributes,
} from "@/lib/contracts/attributes-schema";
import {
  lineTotal,
  resolveCaution,
  resolveTotalHt,
  sumItemsHt,
} from "@/lib/contracts/financial";
import {
  requireContractAccess,
  requireContractWrite,
} from "@/lib/auth/require-roles";
import { createClient } from "@/lib/supabase/server";
import {
  attributesReplaceSchema,
  canvaImportSchema,
  consumptionPostSchema,
  contractItemDeleteSchema,
  contractItemSchema,
  contractUpsertSchema,
  invoiceDraftSchema,
  invoiceIdSchema,
} from "@/lib/validations/contract";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ContractItem = {
  id: string;
  item_type: "LABOR" | "SPARE_PART";
  item_code: string;
  designation: string;
  unit: string;
  quantity: number;
  unit_price_ht: number;
  total_price_ht: number;
  sort_order: number;
  consumed_qty?: number;
  remaining_qty?: number;
  pct_consumed?: number | null;
  invoiced_qty?: number;
  billable_qty?: number;
};

export type ConsumptionMovement = {
  id: string;
  contract_id: string;
  contract_item_id: string;
  direction: "CONSUME" | "REVERSE";
  quantity: number;
  movement_date: string;
  note: string | null;
  created_at: string;
  item_code?: string;
  designation?: string;
  item_type?: "LABOR" | "SPARE_PART";
};

export type ContractInvoice = {
  id: string;
  contract_id: string;
  invoice_number: string;
  invoice_date: string;
  status: "BROUILLON" | "EMISE" | "ANNULEE";
  total_ht: number;
  note: string | null;
  issued_at: string | null;
  created_at: string;
  lines?: ContractInvoiceLine[];
};

export type ContractInvoiceLine = {
  id: string;
  contract_item_id: string;
  item_code: string;
  designation: string;
  unit: string;
  quantity: number;
  unit_price_ht: number;
  total_price_ht: number;
};

export type ContractListRow = {
  id: string;
  contract_number: string;
  client_name: string;
  site_id: string;
  site_name: string | null;
  start_date: string;
  end_date: string;
  ods_date: string | null;
  total_amount_ht: number;
  caution_rate: number;
  caution_amount: number;
  status: string;
  attributes: ContractAttributes;
  labor_count: number;
  spare_count: number;
};

export type ContractDetail = ContractListRow & { items: ContractItem[] };

function revalidateContract(id?: string) {
  revalidatePath("/referentiels/contrats");
  revalidatePath("/commercial/contrats");
  if (id) revalidatePath(`/referentiels/contrats/${id}`);
}

async function recalculateFinancials(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contractId: string,
  attrs: ContractAttributes,
  cautionRate: number,
  cautionAmount: number,
  manualTotal: number,
): Promise<{
  total_amount_ht: number;
  caution_rate: number;
  caution_amount: number;
}> {
  const { data: items } = await supabase
    .from("contract_items")
    .select("item_type, total_price_ht")
    .eq("contract_id", contractId);

  const rows = items ?? [];
  const laborHt = sumItemsHt(
    rows.filter((i) => i.item_type === "LABOR"),
  );
  const spareHt = sumItemsHt(
    rows.filter((i) => i.item_type === "SPARE_PART"),
  );

  const total_amount_ht = resolveTotalHt({
    mode: attrs.financial.total_mode,
    manualTotal,
    laborHt,
    spareHt,
  });

  const caution = resolveCaution({
    sync: attrs.financial.caution_sync,
    totalHt: total_amount_ht,
    rate: cautionRate,
    amount: cautionAmount,
  });

  return {
    total_amount_ht,
    caution_rate: caution.rate,
    caution_amount: caution.amount,
  };
}

export async function listContracts(): Promise<ActionResult<ContractListRow[]>> {
  const gate = await requireContractAccess();
  if (!gate.ok) return { ok: false, error: gate.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ref_contracts")
    .select(
      `
      id, contract_number, client_name, site_id, start_date, end_date, ods_date,
      total_amount_ht, caution_rate, caution_amount, status, attributes,
      site:ref_sites ( name_fr ),
      items:contract_items ( id, item_type )
    `,
    )
    .order("contract_number");

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    data: (data ?? []).map((c) => {
      const site = Array.isArray(c.site) ? c.site[0] : c.site;
      const items = (c.items ?? []) as { id: string; item_type: string }[];
      return {
        id: c.id,
        contract_number: c.contract_number,
        client_name: c.client_name,
        site_id: c.site_id,
        site_name: site?.name_fr ?? null,
        start_date: c.start_date,
        end_date: c.end_date,
        ods_date: c.ods_date,
        total_amount_ht: Number(c.total_amount_ht),
        caution_rate: Number(c.caution_rate),
        caution_amount: Number(c.caution_amount),
        status: c.status,
        attributes: normalizeContractAttributes(c.attributes),
        labor_count: items.filter((i) => i.item_type === "LABOR").length,
        spare_count: items.filter((i) => i.item_type === "SPARE_PART").length,
      };
    }),
  };
}

export async function getContract(
  id: string,
): Promise<ActionResult<ContractDetail>> {
  const gate = await requireContractAccess();
  if (!gate.ok) return { ok: false, error: gate.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ref_contracts")
    .select(
      `
      id, contract_number, client_name, site_id, start_date, end_date, ods_date,
      total_amount_ht, caution_rate, caution_amount, status, attributes,
      site:ref_sites ( name_fr ),
      items:contract_items (
        id, item_type, item_code, designation, unit,
        quantity, unit_price_ht, total_price_ht, sort_order
      )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Contrat introuvable." };

  const site = Array.isArray(data.site) ? data.site[0] : data.site;
  const rawItems = (data.items ?? []) as ContractItem[];

  const { data: movements } = await supabase
    .from("contract_consumption_movements")
    .select("contract_item_id, direction, quantity")
    .eq("contract_id", id);

  const consumedByItem = new Map<string, number>();
  for (const m of movements ?? []) {
    const delta =
      m.direction === "REVERSE" ? -Number(m.quantity) : Number(m.quantity);
    consumedByItem.set(
      m.contract_item_id,
      (consumedByItem.get(m.contract_item_id) ?? 0) + delta,
    );
  }

  const { data: issuedLines } = await supabase
    .from("contract_invoice_lines")
    .select(
      "contract_item_id, quantity, invoice:contract_invoices!inner(contract_id, status)",
    )
    .eq("invoice.contract_id", id)
    .eq("invoice.status", "EMISE");

  const invoicedByItem = new Map<string, number>();
  for (const l of issuedLines ?? []) {
    invoicedByItem.set(
      l.contract_item_id,
      (invoicedByItem.get(l.contract_item_id) ?? 0) + Number(l.quantity),
    );
  }

  const items = rawItems
    .map((i) => {
      const contractual = Number(i.quantity);
      const consumed = consumedByItem.get(i.id) ?? 0;
      const remaining = contractual - consumed;
      const invoiced = invoicedByItem.get(i.id) ?? 0;
      const billable = Math.max(0, consumed - invoiced);
      return {
        ...i,
        quantity: contractual,
        unit_price_ht: Number(i.unit_price_ht),
        total_price_ht: Number(i.total_price_ht),
        consumed_qty: consumed,
        remaining_qty: remaining,
        pct_consumed:
          contractual === 0 ? null : Math.round((consumed / contractual) * 10000) / 100,
        invoiced_qty: invoiced,
        billable_qty: billable,
      };
    })
    .sort(
      (a, b) =>
        a.sort_order - b.sort_order || a.item_code.localeCompare(b.item_code),
    );

  return {
    ok: true,
    data: {
      id: data.id,
      contract_number: data.contract_number,
      client_name: data.client_name,
      site_id: data.site_id,
      site_name: site?.name_fr ?? null,
      start_date: data.start_date,
      end_date: data.end_date,
      ods_date: data.ods_date,
      total_amount_ht: Number(data.total_amount_ht),
      caution_rate: Number(data.caution_rate),
      caution_amount: Number(data.caution_amount),
      status: data.status,
      attributes: normalizeContractAttributes(data.attributes),
      labor_count: items.filter((i) => i.item_type === "LABOR").length,
      spare_count: items.filter((i) => i.item_type === "SPARE_PART").length,
      items,
    },
  };
}

export async function upsertContract(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireContractWrite();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = contractUpsertSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Données invalides",
    };
  }
  const p = parsed.data;
  const supabase = await createClient();

  let attrs = elGassiDefaultAttributes();
  if (p.id) {
    const { data: existing } = await supabase
      .from("ref_contracts")
      .select("attributes")
      .eq("id", p.id)
      .maybeSingle();
    if (!existing) return { ok: false, error: "Contrat introuvable." };
    attrs = normalizeContractAttributes(existing.attributes);
  }

  attrs = {
    ...attrs,
    financial: {
      ...attrs.financial,
      total_mode: p.total_mode,
      caution_sync: p.caution_sync,
      tva_exempt: p.tva_exempt,
      tva_articles: p.tva_articles
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean),
      tva_standard_rate: p.tva_standard_rate,
    },
  };

  if (p.id) {
    const fin = await recalculateFinancials(
      supabase,
      p.id,
      attrs,
      p.caution_rate,
      p.caution_amount,
      p.total_amount_ht,
    );

    const { data, error } = await supabase
      .from("ref_contracts")
      .update({
        contract_number: p.contract_number,
        client_name: p.client_name,
        site_id: p.site_id,
        start_date: p.start_date,
        end_date: p.end_date,
        ods_date: p.ods_date,
        status: p.status,
        attributes: attrs,
        total_amount_ht: fin.total_amount_ht,
        caution_rate: fin.caution_rate,
        caution_amount: fin.caution_amount,
      })
      .eq("id", p.id)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Mise à jour refusée (RLS)." };
    revalidateContract(data.id);
    return { ok: true, data: { id: data.id } };
  }

  const caution = resolveCaution({
    sync: attrs.financial.caution_sync,
    totalHt: p.total_amount_ht,
    rate: p.caution_rate,
    amount: p.caution_amount,
  });

  const { data, error } = await supabase
    .from("ref_contracts")
    .insert({
      contract_number: p.contract_number,
      client_name: p.client_name,
      site_id: p.site_id,
      start_date: p.start_date,
      end_date: p.end_date,
      ods_date: p.ods_date,
      status: p.status,
      attributes: attrs,
      total_amount_ht: p.total_amount_ht,
      caution_rate: caution.rate,
      caution_amount: caution.amount,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Ce numéro de contrat existe déjà." };
    }
    return { ok: false, error: error.message };
  }

  revalidateContract(data.id);
  return { ok: true, data: { id: data.id } };
}

export async function replaceContractAttributes(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireContractWrite();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = attributesReplaceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Attributes invalides",
    };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("ref_contracts")
    .select("id, caution_rate, caution_amount, total_amount_ht")
    .eq("id", parsed.data.contract_id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Contrat introuvable." };

  const attrs = parsed.data.attributes;
  const fin = await recalculateFinancials(
    supabase,
    existing.id,
    attrs,
    Number(existing.caution_rate),
    Number(existing.caution_amount),
    Number(existing.total_amount_ht),
  );

  const { data, error } = await supabase
    .from("ref_contracts")
    .update({
      attributes: attrs,
      total_amount_ht: fin.total_amount_ht,
      caution_rate: fin.caution_rate,
      caution_amount: fin.caution_amount,
    })
    .eq("id", existing.id)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Mise à jour refusée (RLS)." };
  revalidateContract(data.id);
  return { ok: true, data: { id: data.id } };
}

async function afterItemsChange(contractId: string) {
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("ref_contracts")
    .select("attributes, caution_rate, caution_amount, total_amount_ht")
    .eq("id", contractId)
    .maybeSingle();
  if (!c) return;

  const attrs = normalizeContractAttributes(c.attributes);
  const fin = await recalculateFinancials(
    supabase,
    contractId,
    attrs,
    Number(c.caution_rate),
    Number(c.caution_amount),
    Number(c.total_amount_ht),
  );

  await supabase
    .from("ref_contracts")
    .update({
      total_amount_ht: fin.total_amount_ht,
      caution_rate: fin.caution_rate,
      caution_amount: fin.caution_amount,
    })
    .eq("id", contractId);
}

export async function upsertContractItem(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireContractWrite();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = contractItemSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Ligne invalide",
    };
  }
  const p = parsed.data;
  const total = lineTotal(p.quantity, p.unit_price_ht);
  const supabase = await createClient();

  if (p.id) {
    const { data, error } = await supabase
      .from("contract_items")
      .update({
        item_code: p.item_code,
        designation: p.designation,
        unit: p.unit,
        quantity: p.quantity,
        unit_price_ht: p.unit_price_ht,
        total_price_ht: total,
        sort_order: p.sort_order,
      })
      .eq("id", p.id)
      .eq("contract_id", p.contract_id)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Mise à jour refusée (RLS)." };
  } else {
    const { data, error } = await supabase
      .from("contract_items")
      .insert({
        contract_id: p.contract_id,
        item_type: p.item_type,
        item_code: p.item_code,
        designation: p.designation,
        unit: p.unit,
        quantity: p.quantity,
        unit_price_ht: p.unit_price_ht,
        total_price_ht: total,
        sort_order: p.sort_order,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        return { ok: false, error: "item_code déjà utilisé sur ce contrat." };
      }
      return { ok: false, error: error.message };
    }
    await afterItemsChange(p.contract_id);
    revalidateContract(p.contract_id);
    return { ok: true, data: { id: data.id } };
  }

  await afterItemsChange(p.contract_id);
  revalidateContract(p.contract_id);
  return { ok: true, data: { id: p.id! } };
}

export async function deleteContractItem(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireContractWrite();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = contractItemDeleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Identifiant invalide" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contract_items")
    .delete()
    .eq("id", parsed.data.id)
    .eq("contract_id", parsed.data.contract_id)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Suppression refusée (RLS)." };

  await afterItemsChange(parsed.data.contract_id);
  revalidateContract(parsed.data.contract_id);
  return { ok: true, data: { id: data.id } };
}

/** Full canva import — REPLACE labor + spare sheets (atomic RPC). */
export async function importFullCanva(
  input: unknown,
): Promise<ActionResult<{ labor: number; spares: number }>> {
  const gate = await requireContractWrite();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = canvaImportSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Import invalide",
    };
  }

  const { contract_id, labor, spares } = parsed.data;
  const supabase = await createClient();

  const laborPayload = labor.map((r, idx) => ({
    item_code: r.item_code.trim().toUpperCase(),
    designation: r.designation.trim(),
    unit: r.unit || "JOUR",
    quantity: r.quantity,
    unit_price_ht: r.unit_price_ht,
    total_price_ht:
      r.total_price_ht ?? lineTotal(r.quantity, r.unit_price_ht),
    sort_order: idx + 1,
  }));

  const sparePayload = spares.map((r, idx) => ({
    item_code: r.item_code.trim().toUpperCase(),
    designation: r.designation.trim(),
    unit: r.unit || "U",
    quantity: r.quantity,
    unit_price_ht: r.unit_price_ht,
    total_price_ht:
      r.total_price_ht ?? lineTotal(r.quantity, r.unit_price_ht),
    sort_order: idx + 1,
  }));

  const { data, error } = await supabase.rpc("ref_contract_import_canva", {
    p_contract_id: contract_id,
    p_labor: laborPayload,
    p_spares: sparePayload,
  });

  if (error) {
    return {
      ok: false,
      error:
        error.message.includes("Permission denied")
          ? "Import refusé (RLS / droits contrats)."
          : error.message.includes("does not exist")
            ? "RPC canva absente — appliquez la migration P2 sur Supabase."
            : error.message,
    };
  }

  const result = (data ?? {}) as {
    labor?: number;
    spares?: number;
  };

  revalidateContract(contract_id);
  return {
    ok: true,
    data: {
      labor: Number(result.labor ?? laborPayload.length),
      spares: Number(result.spares ?? sparePayload.length),
    },
  };
}

export async function listSitesForContracts(): Promise<
  ActionResult<{ id: string; code: string; name_fr: string }[]>
> {
  const gate = await requireContractAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ref_sites")
    .select("id, code, name_fr")
    .eq("is_active", true)
    .order("code");
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data ?? [] };
}

export async function listConsumptionMovements(
  contractId: string,
): Promise<ActionResult<ConsumptionMovement[]>> {
  const gate = await requireContractAccess();
  if (!gate.ok) return { ok: false, error: gate.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contract_consumption_movements")
    .select(
      `
      id, contract_id, contract_item_id, direction, quantity,
      movement_date, note, created_at,
      item:contract_items ( item_code, designation, item_type )
    `,
    )
    .eq("contract_id", contractId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    data: (data ?? []).map((row) => {
      const item = Array.isArray(row.item) ? row.item[0] : row.item;
      return {
        id: row.id,
        contract_id: row.contract_id,
        contract_item_id: row.contract_item_id,
        direction: row.direction as "CONSUME" | "REVERSE",
        quantity: Number(row.quantity),
        movement_date: row.movement_date,
        note: row.note,
        created_at: row.created_at,
        item_code: item?.item_code,
        designation: item?.designation,
        item_type: item?.item_type as "LABOR" | "SPARE_PART" | undefined,
      };
    }),
  };
}

export async function postConsumption(
  input: unknown,
): Promise<
  ActionResult<{
    id: string;
    consumed_qty: number;
    remaining_qty: number;
    pct_consumed: number | null;
  }>
> {
  const gate = await requireContractWrite();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = consumptionPostSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Données invalides",
    };
  }

  const p = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ref_contract_post_consumption", {
    p_contract_id: p.contract_id,
    p_contract_item_id: p.contract_item_id,
    p_direction: p.direction,
    p_quantity: p.quantity,
    p_movement_date: p.movement_date ?? undefined,
    p_note: p.note ?? undefined,
  });

  if (error) {
    return {
      ok: false,
      error: error.message.includes("Over-consumption")
        ? "Dépassement bloqué : quantité > reste contractuel."
        : error.message.includes("Consumption allowed only")
          ? "Consommation autorisée uniquement si le contrat est Validé ou En cours."
          : error.message.includes("Reverse blocked")
            ? "Annulation impossible : quantité > consommé."
            : error.message,
    };
  }

  const result = (data ?? {}) as {
    id?: string;
    consumed_qty?: number;
    remaining_qty?: number;
    pct_consumed?: number | null;
  };

  revalidateContract(p.contract_id);
  return {
    ok: true,
    data: {
      id: String(result.id ?? ""),
      consumed_qty: Number(result.consumed_qty ?? 0),
      remaining_qty: Number(result.remaining_qty ?? 0),
      pct_consumed:
        result.pct_consumed == null ? null : Number(result.pct_consumed),
    },
  };
}

export async function listContractInvoices(
  contractId: string,
): Promise<ActionResult<ContractInvoice[]>> {
  const gate = await requireContractAccess();
  if (!gate.ok) return { ok: false, error: gate.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contract_invoices")
    .select(
      `
      id, contract_id, invoice_number, invoice_date, status, total_ht,
      note, issued_at, created_at,
      lines:contract_invoice_lines (
        id, contract_item_id, item_code, designation, unit,
        quantity, unit_price_ht, total_price_ht
      )
    `,
    )
    .eq("contract_id", contractId)
    .order("invoice_date", { ascending: false });

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    data: (data ?? []).map((inv) => ({
      id: inv.id,
      contract_id: inv.contract_id,
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date,
      status: inv.status as ContractInvoice["status"],
      total_ht: Number(inv.total_ht),
      note: inv.note,
      issued_at: inv.issued_at,
      created_at: inv.created_at,
      lines: ((inv.lines ?? []) as ContractInvoiceLine[]).map((l) => ({
        ...l,
        quantity: Number(l.quantity),
        unit_price_ht: Number(l.unit_price_ht),
        total_price_ht: Number(l.total_price_ht),
      })),
    })),
  };
}

export async function createInvoiceDraft(
  input: unknown,
): Promise<ActionResult<{ id: string; total_ht: number; lines: number }>> {
  const gate = await requireContractWrite();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = invoiceDraftSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Données invalides",
    };
  }

  const p = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ref_contract_create_invoice_draft", {
    p_contract_id: p.contract_id,
    p_invoice_number: p.invoice_number,
    p_invoice_date: p.invoice_date,
    p_lines: p.lines,
    p_note: p.note ?? undefined,
  });

  if (error) {
    return {
      ok: false,
      error: error.message.includes("billable")
        ? "Quantité > facturable (consommé − déjà facturé)."
        : error.message.includes("Invoicing allowed only")
          ? "Facturation autorisée uniquement si Validé ou En cours."
          : error.message,
    };
  }

  const result = (data ?? {}) as { id?: string; total_ht?: number; lines?: number };
  revalidateContract(p.contract_id);
  return {
    ok: true,
    data: {
      id: String(result.id ?? ""),
      total_ht: Number(result.total_ht ?? 0),
      lines: Number(result.lines ?? 0),
    },
  };
}

export async function issueInvoice(
  input: unknown,
): Promise<ActionResult<{ id: string; status: string }>> {
  const gate = await requireContractWrite();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = invoiceIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ref_contract_issue_invoice", {
    p_invoice_id: parsed.data.invoice_id,
  });

  if (error) {
    return {
      ok: false,
      error: error.message.includes("Cannot issue")
        ? "Émission refusée : quantité non facturable (consommation insuffisante)."
        : error.message,
    };
  }

  const result = (data ?? {}) as { id?: string; status?: string };
  revalidateContract(parsed.data.contract_id);
  return {
    ok: true,
    data: { id: String(result.id ?? ""), status: String(result.status ?? "EMISE") },
  };
}

export async function cancelInvoice(
  input: unknown,
): Promise<ActionResult<{ id: string; status: string }>> {
  const gate = await requireContractWrite();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = invoiceIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ref_contract_cancel_invoice", {
    p_invoice_id: parsed.data.invoice_id,
  });

  if (error) return { ok: false, error: error.message };

  const result = (data ?? {}) as { id?: string; status?: string };
  revalidateContract(parsed.data.contract_id);
  return {
    ok: true,
    data: { id: String(result.id ?? ""), status: String(result.status ?? "ANNULEE") },
  };
}
