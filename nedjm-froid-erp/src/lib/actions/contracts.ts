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
  contractItemDeleteSchema,
  contractItemSchema,
  contractUpsertSchema,
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
  const items = ((data.items ?? []) as ContractItem[])
    .map((i) => ({
      ...i,
      quantity: Number(i.quantity),
      unit_price_ht: Number(i.unit_price_ht),
      total_price_ht: Number(i.total_price_ht),
    }))
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
