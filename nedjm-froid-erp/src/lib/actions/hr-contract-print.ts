"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireHrSalaryValues } from "@/lib/auth/require-roles";
import { createClient } from "@/lib/supabase/server";
import { getHrEmployeeFiche } from "@/lib/actions/hr-employees";
import {
  contractPrintDataToSave,
  contractPrintDefaults,
  normalizeContractTemplate,
  type ContractPrintSource,
  type ContractPrintValues,
  type ContractTemplate,
} from "@/lib/hr/work-contract";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ContractPrintContext = {
  values: ContractPrintValues;
  template: ContractTemplate;
};

async function loadTemplate(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase
    .from("hr_contract_print_template")
    .select("content")
    .eq("id", "default")
    .maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, data: normalizeContractTemplate(data?.content ?? null) };
}

async function loadSource(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contractId: string,
): Promise<ActionResult<ContractPrintSource>> {
  const { data: ctr, error } = await supabase
    .from("hr_contracts")
    .select(
      "id, employee_id, contract_number, contract_type_code, poste_ar, poste_fr, start_date, end_date, salaire_net_ref_monthly, salaire_net_recup_monthly, print_data",
    )
    .eq("id", contractId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!ctr) return { ok: false, error: "Contrat introuvable." };
  const fiche = await getHrEmployeeFiche(ctr.employee_id);
  if (!fiche.ok) return fiche;
  const e = fiche.data;
  let maritalAr: string | null = null;
  if (e.marital_code) {
    const { data: cat } = await supabase
      .from("hr_catalogs")
      .select("label_ar")
      .eq("kind", "marital")
      .eq("code", e.marital_code)
      .maybeSingle();
    maritalAr = cat?.label_ar ?? null;
  }
  const attr = (key: string) => {
    const v = e.attrs?.[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  return {
    ok: true,
    data: {
      contract_number: ctr.contract_number,
      contract_type_code: ctr.contract_type_code,
      poste_ar: ctr.poste_ar,
      poste_fr: ctr.poste_fr,
      start_date: String(ctr.start_date),
      end_date: ctr.end_date ? String(ctr.end_date) : null,
      salaire_net_ref_monthly: ctr.salaire_net_ref_monthly == null ? null : Number(ctr.salaire_net_ref_monthly),
      salaire_net_recup_monthly:
        ctr.salaire_net_recup_monthly == null ? null : Number(ctr.salaire_net_recup_monthly),
      print_data: (ctr.print_data ?? {}) as Record<string, unknown>,
      employee: {
        matricule: e.matricule,
        last_name: e.last_name,
        first_name: e.first_name,
        last_name_ar: e.last_name_ar,
        first_name_ar: e.first_name_ar,
        birth_date: e.birth_date,
        birth_place_ar: e.birth_place_ar,
        birth_place_fr: e.birth_place_fr,
        father_name: e.father_name,
        mother_name: e.mother_name,
        marital_label_ar: maritalAr,
        id_type_code: attr("id_type_code"),
        id_number: attr("id_number"),
        id_issued_on: attr("id_issued_on"),
        id_issued_by: attr("id_issued_by"),
        address_ar: e.address_ar,
        address_fr: e.address_fr,
      },
    },
  };
}

export async function getContractPrintContext(
  contractId: string,
): Promise<ActionResult<ContractPrintContext>> {
  if (!z.string().uuid().safeParse(contractId).success) return { ok: false, error: "Contrat invalide." };
  const supabase = await createClient();
  const [source, template] = await Promise.all([loadSource(supabase, contractId), loadTemplate(supabase)]);
  if (!source.ok) return source;
  if (!template.ok) return template;
  return { ok: true, data: { values: contractPrintDefaults(source.data), template: template.data } };
}

const valuesSchema = z.object({
  numero: z.string().trim().max(40),
  is_cdi: z.boolean(),
  nom: z.string().max(200),
  matricule: z.string().max(40),
  birth_date: z.string().max(40),
  birth_place: z.string().max(200),
  father: z.string().max(200),
  mother: z.string().max(200),
  marital: z.string().max(80),
  id_piece: z.string().max(80),
  id_number: z.string().max(80),
  id_issued_on: z.string().max(40),
  id_issued_by: z.string().max(200),
  address: z.string().max(400),
  poste: z.string().max(200),
  start_date: z.string().max(40),
  end_date: z.string().max(40),
  cdd_reason: z.number().int().min(1).max(20),
  essai: z.string().max(120),
  preavis: z.string().max(120),
  net: z.string().max(40),
  recup: z.string().max(40),
  retenue: z.string().max(40),
});

/** Saves the edited values on the contract and gives it a number (YYYY/NNN) when it has none. */
export async function saveContractPrint(input: {
  contract_id: string;
  values: unknown;
}): Promise<ActionResult<{ numero: string }>> {
  if (!z.string().uuid().safeParse(input.contract_id).success) return { ok: false, error: "Contrat invalide." };
  const parsed = valuesSchema.safeParse(input.values);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const values = parsed.data;
  const supabase = await createClient();
  const source = await loadSource(supabase, input.contract_id);
  if (!source.ok) return source;
  const fileDefaults = contractPrintDefaults({ ...source.data, print_data: {} });
  const print_data = contractPrintDataToSave(values, fileDefaults);

  const update: Record<string, unknown> = { print_data };
  if (values.numero) update.contract_number = values.numero;
  const { data: saved, error } = await supabase
    .from("hr_contracts")
    .update(update)
    .eq("id", input.contract_id)
    .select("contract_number")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: `Le numéro ${values.numero} est déjà utilisé. · الرقم مستعمل` };
    }
    return { ok: false, error: error.message };
  }
  if (!saved) return { ok: false, error: "Modification du contrat non autorisée. · غير مسموح" };
  let numero = saved.contract_number as string | null;
  if (!numero) {
    const { data, error: numErr } = await supabase.rpc("hr_contract_assign_number", {
      p_contract: input.contract_id,
    });
    if (numErr) return { ok: false, error: numErr.message };
    numero = String(data);
  }
  revalidatePath("/rh/contrats");
  return { ok: true, data: { numero } };
}

const templateSchema = z.object({
  title_cdd: z.string().max(200),
  title_cdi: z.string().max(200),
  legal_intro: z.string().max(2000),
  opening_cdd: z.string().max(500),
  opening_cdi: z.string().max(500),
  employer_block: z.string().max(4000),
  cdd_reason_intro: z.string().max(2000),
  cdd_reasons: z.array(z.string().max(1000)).max(20),
  articles: z
    .array(z.object({ key: z.string().max(40), body: z.string().max(4000), cdd_only: z.boolean().optional() }))
    .max(20),
  note: z.string().max(4000),
  closing: z.string().max(500),
  sig_employee: z.string().max(200),
  sig_employer: z.string().max(200),
  copies: z.string().max(1000),
});

export async function saveContractTemplate(input: unknown): Promise<ActionResult<ContractTemplate>> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_contract_print_template")
    .upsert({ id: "default", content: parsed.data }, { onConflict: "id" })
    .select("content")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Enregistrement refusé (droits)." };
  return { ok: true, data: normalizeContractTemplate(data.content) };
}
