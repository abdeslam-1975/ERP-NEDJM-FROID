"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { createClient } from "@/lib/supabase/server";
import { contractUpsertSchema } from "@/lib/validations/contract";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ContractListRow = {
  id: string;
  contract_number: string;
  client_name: string;
  site_id: string;
  site_name: string | null;
  start_date: string;
  end_date: string;
  total_amount_ht: number;
  caution_amount: number;
  status: string;
  attributes: Record<string, unknown>;
  labor_count: number;
  spare_count: number;
};

export type ContractDetail = ContractListRow & {
  ods_date: string | null;
  caution_rate: number;
  items: {
    id: string;
    item_type: "LABOR" | "SPARE_PART";
    item_code: string;
    designation: string;
    unit: string;
    quantity: number;
    unit_price_ht: number;
    total_price_ht: number;
    sort_order: number;
  }[];
};

export async function listContracts(): Promise<ActionResult<ContractListRow[]>> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return { ok: false, error: "Session requise." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ref_contracts")
    .select(
      `
      id, contract_number, client_name, site_id, start_date, end_date,
      total_amount_ht, caution_amount, status, attributes,
      site:ref_sites ( name_fr ),
      items:contract_items ( id, item_type )
    `,
    )
    .order("contract_number");

  if (error) return { ok: false, error: error.message };

  const rows: ContractListRow[] = (data ?? []).map((c) => {
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
      total_amount_ht: Number(c.total_amount_ht),
      caution_amount: Number(c.caution_amount),
      status: c.status,
      attributes: (c.attributes ?? {}) as Record<string, unknown>,
      labor_count: items.filter((i) => i.item_type === "LABOR").length,
      spare_count: items.filter((i) => i.item_type === "SPARE_PART").length,
    };
  });

  return { ok: true, data: rows };
}

export async function getContract(
  id: string,
): Promise<ActionResult<ContractDetail>> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return { ok: false, error: "Session requise." };

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
  const items = (data.items ?? []) as ContractDetail["items"];
  items.sort((a, b) => a.sort_order - b.sort_order);

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
      attributes: (data.attributes ?? {}) as Record<string, unknown>,
      labor_count: items.filter((i) => i.item_type === "LABOR").length,
      spare_count: items.filter((i) => i.item_type === "SPARE_PART").length,
      items,
    },
  };
}

export async function upsertContract(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return { ok: false, error: "Session requise." };

  const parsed = contractUpsertSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Données invalides",
    };
  }

  const p = parsed.data;
  const supabase = await createClient();

  if (p.id) {
    const { data: existing } = await supabase
      .from("ref_contracts")
      .select("status")
      .eq("id", p.id)
      .maybeSingle();

    if (existing && existing.status !== "BROUILLON" && !workspace.isSuperAdmin) {
      return {
        ok: false,
        error: "Seuls les contrats BROUILLON sont modifiables (hors SUPER_ADMIN).",
      };
    }

    const { data, error } = await supabase
      .from("ref_contracts")
      .update({
        contract_number: p.contract_number,
        client_name: p.client_name,
        site_id: p.site_id,
        start_date: p.start_date,
        end_date: p.end_date,
        ods_date: p.ods_date,
        total_amount_ht: p.total_amount_ht,
        caution_rate: p.caution_rate,
        caution_amount: p.caution_amount,
        status: p.status,
        attributes: p.attributes,
      })
      .eq("id", p.id)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Mise à jour refusée (RLS)." };
    revalidatePath("/referentiels/contrats");
    revalidatePath(`/referentiels/contrats/${data.id}`);
    return { ok: true, data: { id: data.id } };
  }

  const { data, error } = await supabase
    .from("ref_contracts")
    .insert({
      contract_number: p.contract_number,
      client_name: p.client_name,
      site_id: p.site_id,
      start_date: p.start_date,
      end_date: p.end_date,
      ods_date: p.ods_date,
      total_amount_ht: p.total_amount_ht,
      caution_rate: p.caution_rate,
      caution_amount: p.caution_amount,
      status: p.status,
      attributes: p.attributes,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Ce numéro de contrat existe déjà." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/referentiels/contrats");
  return { ok: true, data: { id: data.id } };
}

export async function listSitesForContracts(): Promise<
  ActionResult<{ id: string; code: string; name_fr: string }[]>
> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return { ok: false, error: "Session requise." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ref_sites")
    .select("id, code, name_fr")
    .eq("is_active", true)
    .order("code");
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data ?? [] };
}
