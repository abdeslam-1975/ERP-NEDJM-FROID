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
  paymentPostSchema,
  penaltyApplySchema,
  penaltySuggestSchema,
  contractCloseSchema,
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
  tva_rate: number;
  tva_amount: number;
  total_ttc: number;
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

export type ContractBalance = {
  contract_id: string;
  invoiced_ht: number;
  paid_ht: number;
  remaining_ht: number;
  is_solded: boolean;
  open_invoices?: {
    invoice_id: string;
    invoice_number: string;
    invoice_date: string;
    total_ht: number;
    paid_ht: number;
    open_ht: number;
  }[];
};

export type ContractPayment = {
  id: string;
  contract_id: string;
  invoice_id: string | null;
  payment_date: string;
  amount_ht: number;
  method: string;
  reference: string | null;
  note: string | null;
  created_at: string;
};

export type ContractPenaltyEvent = {
  id: string;
  contract_id: string;
  rule_code: string;
  rule_label: string;
  event_date: string;
  amount_ht: number;
  note: string | null;
  created_at: string;
  basis_days?: number | null;
  rule_mode?: string | null;
  hr_employee_id?: string | null;
};

export type HrEmployeeOption = {
  id: string;
  matricule: string;
  first_name: string;
  last_name: string;
  status: string;
};

export type ContractStats = {
  contract_id: string;
  status: string;
  contract_total_ht: number;
  contractual_qty: number;
  consumed_qty: number;
  consumed_ht: number;
  labor_consumed_qty: number;
  spare_consumed_qty: number;
  pct_qty_consumed: number | null;
  pct_ht_consumed: number | null;
  invoiced_ht: number;
  paid_ht: number;
  remaining_ht: number;
  is_solded: boolean;
  pct_invoiced: number | null;
  pct_collected: number | null;
  penalties_ht: number;
  penalties_count: number;
  open_invoices_count: number;
  draft_invoices_count: number;
  close_blockers: string[];
  can_close: boolean;
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
    p_hr_employee_id: p.hr_employee_id ?? undefined,
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
      tva_rate, tva_amount, total_ttc,
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
      tva_rate: Number(inv.tva_rate ?? 0),
      tva_amount: Number(inv.tva_amount ?? 0),
      total_ttc: Number(inv.total_ttc ?? inv.total_ht ?? 0),
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

export async function suggestNextInvoiceNumber(
  contractId: string,
): Promise<ActionResult<{ invoice_number: string }>> {
  const gate = await requireContractAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ref_contract_next_invoice_number", {
    p_contract_id: contractId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { invoice_number: String(data ?? "") } };
}

export async function createInvoiceDraft(
  input: unknown,
): Promise<
  ActionResult<{
    id: string;
    invoice_number: string;
    total_ht: number;
    tva_amount: number;
    total_ttc: number;
    lines: number;
  }>
> {
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
    p_invoice_number: p.invoice_number || "",
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

  const result = (data ?? {}) as {
    id?: string;
    invoice_number?: string;
    total_ht?: number;
    tva_amount?: number;
    total_ttc?: number;
    lines?: number;
  };
  revalidateContract(p.contract_id);
  return {
    ok: true,
    data: {
      id: String(result.id ?? ""),
      invoice_number: String(result.invoice_number ?? p.invoice_number ?? ""),
      total_ht: Number(result.total_ht ?? 0),
      tva_amount: Number(result.tva_amount ?? 0),
      total_ttc: Number(result.total_ttc ?? result.total_ht ?? 0),
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

export async function getContractBalance(
  contractId: string,
): Promise<ActionResult<ContractBalance>> {
  const gate = await requireContractAccess();
  if (!gate.ok) return { ok: false, error: gate.error };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ref_contract_balance", {
    p_contract_id: contractId,
  });
  if (error) return { ok: false, error: error.message };

  const bal = (data ?? {}) as Record<string, unknown>;
  const openRaw = Array.isArray(bal.open_invoices) ? bal.open_invoices : [];
  return {
    ok: true,
    data: {
      contract_id: contractId,
      invoiced_ht: Number(bal.invoiced_ht ?? 0),
      paid_ht: Number(bal.paid_ht ?? 0),
      remaining_ht: Number(bal.remaining_ht ?? 0),
      is_solded: Boolean(bal.is_solded),
      open_invoices: openRaw.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          invoice_id: String(r.invoice_id ?? ""),
          invoice_number: String(r.invoice_number ?? ""),
          invoice_date: String(r.invoice_date ?? ""),
          total_ht: Number(r.total_ht ?? 0),
          paid_ht: Number(r.paid_ht ?? 0),
          open_ht: Number(r.open_ht ?? 0),
        };
      }),
    },
  };
}

export async function listContractPayments(
  contractId: string,
): Promise<ActionResult<ContractPayment[]>> {
  const gate = await requireContractAccess();
  if (!gate.ok) return { ok: false, error: gate.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contract_payments")
    .select(
      "id, contract_id, invoice_id, payment_date, amount_ht, method, reference, note, created_at",
    )
    .eq("contract_id", contractId)
    .order("payment_date", { ascending: false })
    .limit(200);

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    data: (data ?? []).map((p) => ({
      ...p,
      amount_ht: Number(p.amount_ht),
    })),
  };
}

export async function postPayment(
  input: unknown,
): Promise<ActionResult<{ id: string; balance: ContractBalance }>> {
  const gate = await requireContractWrite();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = paymentPostSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Données invalides",
    };
  }

  const p = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ref_contract_post_payment", {
    p_contract_id: p.contract_id,
    p_amount_ht: p.amount_ht,
    p_payment_date: p.payment_date ?? undefined,
    p_method: p.method,
    p_invoice_id: p.invoice_id ?? undefined,
    p_reference: p.reference ?? undefined,
    p_note: p.note ?? undefined,
  });

  if (error) {
    return {
      ok: false,
      error: error.message.includes("exceeds invoice open amount")
        ? "Paiement > reste de la facture sélectionnée."
        : error.message.includes("exceeds remaining receivable")
          ? "Paiement > reste à encaisser du contrat."
          : error.message,
    };
  }

  const result = (data ?? {}) as { id?: string; balance?: Record<string, unknown> };
  const bal = result.balance ?? {};
  const openRaw = Array.isArray(bal.open_invoices) ? bal.open_invoices : [];
  revalidateContract(p.contract_id);
  return {
    ok: true,
    data: {
      id: String(result.id ?? ""),
      balance: {
        contract_id: p.contract_id,
        invoiced_ht: Number(bal.invoiced_ht ?? 0),
        paid_ht: Number(bal.paid_ht ?? 0),
        remaining_ht: Number(bal.remaining_ht ?? 0),
        is_solded: Boolean(bal.is_solded),
        open_invoices: openRaw.map((row) => {
          const r = row as Record<string, unknown>;
          return {
            invoice_id: String(r.invoice_id ?? ""),
            invoice_number: String(r.invoice_number ?? ""),
            invoice_date: String(r.invoice_date ?? ""),
            total_ht: Number(r.total_ht ?? 0),
            paid_ht: Number(r.paid_ht ?? 0),
            open_ht: Number(r.open_ht ?? 0),
          };
        }),
      },
    },
  };
}

export async function listPenaltyEvents(
  contractId: string,
): Promise<ActionResult<ContractPenaltyEvent[]>> {
  const gate = await requireContractAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contract_penalty_events")
    .select(
      "id, contract_id, rule_code, rule_label, event_date, amount_ht, note, created_at, basis_days, rule_mode, hr_employee_id",
    )
    .eq("contract_id", contractId)
    .order("event_date", { ascending: false })
    .limit(200);
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((e) => ({
      ...e,
      amount_ht: Number(e.amount_ht),
      basis_days: e.basis_days == null ? null : Number(e.basis_days),
    })),
  };
}

export async function suggestPenaltyAmount(
  input: unknown,
): Promise<
  ActionResult<{
    rule_code: string;
    rule_label: string;
    mode: string;
    basis_days: number;
    suggested_amount_ht: number;
  }>
> {
  const gate = await requireContractAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = penaltySuggestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const p = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ref_contract_suggest_penalty", {
    p_contract_id: p.contract_id,
    p_rule_code: p.rule_code,
    p_basis_days: p.basis_days,
    p_item_code: p.item_code ?? undefined,
  });
  if (error) return { ok: false, error: error.message };
  const s = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    data: {
      rule_code: String(s.rule_code ?? p.rule_code),
      rule_label: String(s.rule_label ?? s.rule_label ?? ""),
      mode: String(s.mode ?? ""),
      basis_days: Number(s.basis_days ?? p.basis_days),
      suggested_amount_ht: Number(
        s.suggested_amount_ht ?? s.suggested_amount_ht ?? 0,
      ),
    },
  };
}

export async function listHrEmployees(): Promise<ActionResult<HrEmployeeOption[]>> {
  const gate = await requireContractAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_employees")
    .select("id, matricule, first_name, last_name, status")
    .eq("status", "ACTIVE")
    .order("last_name")
    .limit(500);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data ?? [] };
}

export async function applyPenalty(
  input: unknown,
): Promise<ActionResult<{ id: string; amount_ht: number }>> {
  const gate = await requireContractWrite();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = penaltyApplySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const p = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ref_contract_apply_penalty", {
    p_contract_id: p.contract_id,
    p_rule_code: p.rule_code,
    p_rule_label: p.rule_label,
    p_amount_ht: p.amount_ht,
    p_event_date: p.event_date ?? undefined,
    p_note: p.note ?? undefined,
    p_basis_days: p.basis_days ?? undefined,
    p_rule_mode: p.rule_mode ?? undefined,
    p_hr_employee_id: p.hr_employee_id ?? undefined,
  });
  if (error) return { ok: false, error: error.message };
  const result = (data ?? {}) as { id?: string; amount_ht?: number };
  revalidateContract(p.contract_id);
  return {
    ok: true,
    data: { id: String(result.id ?? ""), amount_ht: Number(result.amount_ht ?? 0) },
  };
}

export async function getContractStats(
  contractId: string,
): Promise<ActionResult<ContractStats>> {
  const gate = await requireContractAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ref_contract_stats", {
    p_contract_id: contractId,
  });
  if (error) return { ok: false, error: error.message };
  const s = (data ?? {}) as Record<string, unknown>;
  const blockers = Array.isArray(s.close_blockers)
    ? (s.close_blockers as unknown[]).map(String)
    : [];
  return {
    ok: true,
    data: {
      contract_id: contractId,
      status: String(s.status ?? ""),
      contract_total_ht: Number(s.contract_total_ht ?? 0),
      contractual_qty: Number(s.contractual_qty ?? 0),
      consumed_qty: Number(s.consumed_qty ?? 0),
      consumed_ht: Number(s.consumed_ht ?? 0),
      labor_consumed_qty: Number(s.labor_consumed_qty ?? 0),
      spare_consumed_qty: Number(s.spare_consumed_qty ?? 0),
      pct_qty_consumed:
        s.pct_qty_consumed == null ? null : Number(s.pct_qty_consumed),
      pct_ht_consumed:
        s.pct_ht_consumed == null ? null : Number(s.pct_ht_consumed),
      invoiced_ht: Number(s.invoiced_ht ?? 0),
      paid_ht: Number(s.paid_ht ?? 0),
      remaining_ht: Number(s.remaining_ht ?? 0),
      is_solded: Boolean(s.is_solded),
      pct_invoiced: s.pct_invoiced == null ? null : Number(s.pct_invoiced),
      pct_collected: s.pct_collected == null ? null : Number(s.pct_collected),
      penalties_ht: Number(s.penalties_ht ?? 0),
      penalties_count: Number(s.penalties_count ?? 0),
      open_invoices_count: Number(s.open_invoices_count ?? 0),
      draft_invoices_count: Number(s.draft_invoices_count ?? 0),
      close_blockers: blockers,
      can_close: Boolean(s.can_close),
    },
  };
}

export async function closeContract(
  input: unknown,
): Promise<ActionResult<{ id: string; status: string }>> {
  const gate = await requireContractWrite();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = contractCloseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ref_contract_close", {
    p_contract_id: parsed.data.contract_id,
    p_force: parsed.data.force,
  });
  if (error) {
    const msg = error.message;
    return {
      ok: false,
      error: msg.includes("remaining receivable")
        ? "Clôture refusée : reste à encaisser > 0 (cochez forcer si autorisé)."
        : msg.includes("draft invoices")
          ? "Clôture refusée : factures brouillon restantes (émettez/annulez ou forcez)."
          : msg,
    };
  }
  const result = (data ?? {}) as { id?: string; status?: string };
  revalidateContract(parsed.data.contract_id);
  return {
    ok: true,
    data: { id: String(result.id ?? ""), status: String(result.status ?? "CLOTURE") },
  };
}
