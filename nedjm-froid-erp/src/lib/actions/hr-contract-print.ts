"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getHrEmployeeFiche } from "@/lib/actions/hr-employees";
import { upsertHrFile } from "@/lib/actions/hr-documents";
import { loadHrListItems, loadPrintKit, printFromKit } from "@/lib/doc/print-kit";
import { CONTRACT_TYPE_LIST, contractTypeDefaults, type ContractTypeDefaults } from "@/lib/hr/hr-lists";
import { contractArchiveType } from "@/lib/hr/contract-archive";
import { hrFileHref } from "@/lib/hr/hr-file-url";
import { htmlToPdf } from "@/lib/pdf/html-to-pdf";
import { archiveFileStem, archiveFolder, hrPdfOptions, requestOrigin, uploadHrPdf } from "@/lib/pdf/print-archive";
import {
  CONTRACT_DOC_TYPE,
  contractDocData,
  contractPrintDataToSave,
  contractPrintError,
  contractPrintDefaults,
  type ContractPrintSource,
  type ContractPrintValues,
} from "@/lib/hr/work-contract";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ContractPrintContext = {
  values: ContractPrintValues;
};

async function loadSource(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contractId: string,
): Promise<ActionResult<{ source: ContractPrintSource; type: ContractTypeDefaults }>> {
  const { data: ctr, error } = await supabase
    .from("hr_contracts")
    .select(
      "id, employee_id, contract_number, contract_type_code, poste_ar, poste_fr, start_date, end_date, salaire_net_ref_monthly, salaire_net_recup_monthly, print_data",
    )
    .eq("id", contractId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!ctr) return { ok: false, error: "Contrat introuvable." };
  const [employee, types] = await Promise.all([
    loadEmployee(supabase, ctr.employee_id),
    loadHrListItems(supabase, [CONTRACT_TYPE_LIST]),
  ]);
  if (!employee.ok) return employee;
  if (!types.ok) return types;
  return {
    ok: true,
    data: {
      type: contractTypeDefaults(types.data, ctr.contract_type_code),
      source: {
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
        employee: employee.data,
      },
    },
  };
}

async function loadEmployee(
  supabase: Awaited<ReturnType<typeof createClient>>,
  employeeId: string,
): Promise<ActionResult<ContractPrintSource["employee"]>> {
  const fiche = await getHrEmployeeFiche(employeeId);
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
  };
}

export type ContractPreviewContext = {
  employee: ContractPrintSource["employee"] | null;
  contract_number: string | null;
  print_data: Record<string, unknown>;
};

/** What the contract form needs to draw the document live, before or after the contract is saved. */
export async function getContractPreviewContext(input: {
  employee_id: string | null;
  contract_id: string | null;
}): Promise<ActionResult<ContractPreviewContext>> {
  const uuid = z.string().uuid();
  if (input.employee_id && !uuid.safeParse(input.employee_id).success) return { ok: false, error: "Employé invalide." };
  if (input.contract_id && !uuid.safeParse(input.contract_id).success) return { ok: false, error: "Contrat invalide." };
  const supabase = await createClient();
  const [employee, contract] = await Promise.all([
    input.employee_id ? loadEmployee(supabase, input.employee_id) : null,
    input.contract_id
      ? supabase.from("hr_contracts").select("contract_number, print_data").eq("id", input.contract_id).maybeSingle()
      : null,
  ]);
  if (employee && !employee.ok) return employee;
  if (contract?.error) return { ok: false, error: contract.error.message };
  return {
    ok: true,
    data: {
      employee: employee?.data ?? null,
      contract_number: contract?.data?.contract_number ?? null,
      print_data: (contract?.data?.print_data ?? {}) as Record<string, unknown>,
    },
  };
}

/** Daily deduction for an unjustified absence, printed in the contract (print_data.retenue). */
export async function saveContractRetenue(input: { contract_id: string; retenue: string }): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(input.contract_id).success) return { ok: false, error: "Contrat invalide." };
  const retenue = input.retenue.trim().replace(",", ".");
  if (retenue && !/^\d{1,9}(\.\d{1,2})?$/.test(retenue)) {
    return { ok: false, error: "Retenue / jour d'absence : saisissez un montant en DA." };
  }
  const supabase = await createClient();
  const { data: ctr, error } = await supabase
    .from("hr_contracts")
    .select("print_data")
    .eq("id", input.contract_id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!ctr) return { ok: false, error: "Contrat introuvable." };
  const print_data = { ...((ctr.print_data ?? {}) as Record<string, unknown>) };
  if (retenue) print_data.retenue = retenue;
  else delete print_data.retenue;
  const { data: saved, error: saveErr } = await supabase
    .from("hr_contracts")
    .update({ print_data })
    .eq("id", input.contract_id)
    .select("id")
    .maybeSingle();
  if (saveErr) return { ok: false, error: saveErr.message };
  if (!saved) return { ok: false, error: "Modification du contrat non autorisée." };
  revalidatePath("/rh/contrats");
  return { ok: true, data: undefined };
}

export async function getContractPrintContext(
  contractId: string,
): Promise<ActionResult<ContractPrintContext>> {
  if (!z.string().uuid().safeParse(contractId).success) return { ok: false, error: "Contrat invalide." };
  const supabase = await createClient();
  const source = await loadSource(supabase, contractId);
  if (!source.ok) return source;
  return { ok: true, data: { values: contractPrintDefaults(source.data.source, source.data.type) } };
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
  const fileDefaults = contractPrintDefaults({ ...source.data.source, print_data: {} }, source.data.type);
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

/** Archives the saved contract as a PDF rendered from the print HTML; it replaces the contract's previous archive. */
export async function archiveContractPrint(contractId: string): Promise<ActionResult<{ archive_url: string }>> {
  if (!z.string().uuid().safeParse(contractId).success) return { ok: false, error: "Contrat invalide." };
  try {
    const supabase = await createClient();
    const { data: ctr, error } = await supabase
      .from("hr_contracts")
      .select("employee_id")
      .eq("id", contractId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!ctr) return { ok: false, error: "Contrat introuvable." };
    const [context, origin] = await Promise.all([getContractPrintContext(contractId), requestOrigin()]);
    if (!context.ok) return context;
    const { values } = context.data;
    const blocked = contractPrintError(values);
    if (blocked) return { ok: false, error: blocked };
    const kit = await loadPrintKit(supabase, [CONTRACT_DOC_TYPE]);
    if (!kit.ok) return kit;
    const html = printFromKit(kit.data, CONTRACT_DOC_TYPE, contractDocData(values, kit.data.company), origin);
    if (!html.ok) return html;
    const pdf = await htmlToPdf(html.data, hrPdfOptions(supabase, origin));
    const safeNum = (values.numero || "SN").replace(/\//g, "-");
    const path = `${archiveFolder(ctr.employee_id)}/CONTRAT-${safeNum}-${crypto.randomUUID()}.pdf`;
    const uploadError = await uploadHrPdf(supabase, path, pdf);
    if (uploadError) return { ok: false, error: uploadError };
    const archiveUrl = hrFileHref(path);
    const filed = await upsertHrFile({
      employee_id: ctr.employee_id,
      doc_type_code: contractArchiveType(contractId),
      file_url: archiveUrl,
      file_name: `CONTRAT_${archiveFileStem(safeNum, values.matricule || "NA", values.nom || "")}.pdf`,
      storage_path: path,
      notes: `Contrat de travail ${values.numero} · عقد العمل`,
    });
    if (!filed.ok) return filed;
    revalidatePath("/rh/documents");
    return { ok: true, data: { archive_url: archiveUrl } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Échec de l'archivage du contrat." };
  }
}
