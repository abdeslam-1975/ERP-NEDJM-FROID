"use server";

import { revalidatePath } from "next/cache";
import {
  requireContractAccess,
  requireContractWrite,
} from "@/lib/auth/require-roles";
import { createClient } from "@/lib/supabase/server";
import { clientUpsertSchema } from "@/lib/validations/client";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ClientRow = {
  id: string;
  code_client: string | null;
  nom_fr: string;
  nom_ar: string | null;
  code_activite: string | null;
  nif: string | null;
  nis: string | null;
  rc: string | null;
  article_imposition: string | null;
  adresse: string | null;
  wilaya: string | null;
  commune: string | null;
  telephone: string | null;
  email: string | null;
  site_web: string | null;
  banque_nom: string | null;
  banque_compte: string | null;
  banque_rib: string | null;
  responsable_nom: string | null;
  responsable_telephone: string | null;
  responsable_email: string | null;
};

export type ClientContractLink = {
  id: string;
  contract_number: string;
  status: string;
  start_date: string;
  end_date: string;
  ods_date: string | null;
  site_name: string | null;
};

const COLUMNS =
  "id, code_client, nom_fr, nom_ar, code_activite, nif, nis, rc, article_imposition, adresse, wilaya, commune, telephone, email, site_web, banque_nom, banque_compte, banque_rib, responsable_nom, responsable_telephone, responsable_email";

function revalidateClients(id?: string) {
  revalidatePath("/referentiels/clients");
  revalidatePath("/referentiels/contrats");
  if (id) revalidatePath(`/referentiels/clients/${id}`);
}

function uniqueMessage(error: { code?: string; message: string }) {
  if (error.code === "23505") {
    return "Cette valeur existe déjà (code, NIF, NIS, RC ou RIB).";
  }
  if (error.code === "23503") {
    return "Ce client est lié à un contrat. Supprimez le lien avant de le retirer.";
  }
  return error.message;
}

export async function listClients(): Promise<ActionResult<ClientRow[]>> {
  const gate = await requireContractAccess();
  if (!gate.ok) return { ok: false, error: gate.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ref_clients")
    .select(COLUMNS)
    .order("nom_fr");

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as ClientRow[] };
}

export async function getClient(id: string): Promise<ActionResult<ClientRow>> {
  const gate = await requireContractAccess();
  if (!gate.ok) return { ok: false, error: gate.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ref_clients")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Client introuvable." };
  return { ok: true, data: data as ClientRow };
}

export async function listClientContracts(
  clientId: string,
): Promise<ActionResult<ClientContractLink[]>> {
  const gate = await requireContractAccess();
  if (!gate.ok) return { ok: false, error: gate.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ref_contracts")
    .select(
      "id, contract_number, status, start_date, end_date, ods_date, site:ref_sites ( name_fr )",
    )
    .eq("client_id", clientId)
    .order("contract_number");

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    data: (data ?? []).map((row) => {
      const site = Array.isArray(row.site) ? row.site[0] : row.site;
      return {
        id: row.id,
        contract_number: row.contract_number,
        status: row.status,
        start_date: row.start_date,
        end_date: row.end_date,
        ods_date: row.ods_date,
        site_name: site?.name_fr ?? null,
      };
    }),
  };
}

export async function upsertClient(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireContractWrite();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = clientUpsertSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((issue) => issue.message).join(" "),
    };
  }

  const { id, ...fields } = parsed.data;
  const supabase = await createClient();

  if (id) {
    const { data, error } = await supabase
      .from("ref_clients")
      .update(fields)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, error: uniqueMessage(error) };
    if (!data) return { ok: false, error: "Mise à jour refusée." };

    const { error: syncError } = await supabase
      .from("ref_contracts")
      .update({ client_name: fields.nom_fr })
      .eq("client_id", id);
    if (syncError) {
      return {
        ok: false,
        error: `Client enregistré, copie du nom sur les contrats échouée : ${syncError.message}`,
      };
    }

    revalidateClients(id);
    return { ok: true, data: { id } };
  }

  const { data, error } = await supabase
    .from("ref_clients")
    .insert(fields)
    .select("id")
    .single();
  if (error) return { ok: false, error: uniqueMessage(error) };

  revalidateClients(data.id);
  return { ok: true, data: { id: data.id } };
}
