"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  requireContractAccess,
  requireContractWrite,
} from "@/lib/auth/require-roles";
import { createClient } from "@/lib/supabase/server";
import {
  CONTRACT_DOCS_BUCKET,
  CONTRACT_DOC_KINDS,
  contractDocIssue,
  contractDocPath,
  isContractDocPath,
  resolveContractDocType,
} from "@/lib/contracts/document-files";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ContractDocumentRow = {
  id: string;
  contract_id: string;
  kind: string;
  title: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  signed_on: string | null;
  notes: string | null;
  created_at: string;
};

const COLUMNS =
  "id, contract_id, kind, title, file_name, mime_type, size_bytes, signed_on, notes, created_at";

const kindSchema = z.enum(
  CONTRACT_DOC_KINDS.map((kind) => kind.value) as [string, ...string[]],
);

const optionalText = (max: number) =>
  z
    .union([z.string().max(max), z.null()])
    .optional()
    .transform((value) => {
      const text = value?.trim() ?? "";
      return text === "" ? null : text;
    });

const prepareSchema = z.object({
  contract_id: z.string().uuid(),
  file_name: z.string().trim().min(1).max(255),
  size: z.coerce.number().int().positive(),
});

const registerSchema = z.object({
  contract_id: z.string().uuid(),
  path: z.string().min(1).max(200),
  file_name: z.string().trim().min(1).max(255),
  kind: kindSchema,
  title: optionalText(200),
  signed_on: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()])
    .optional()
    .transform((value) => (value ? value : null)),
  notes: optionalText(1000),
});

function revalidateContract(contractId: string) {
  revalidatePath(`/referentiels/contrats/${contractId}`);
}

export async function listContractDocuments(
  contractId: string,
): Promise<ActionResult<ContractDocumentRow[]>> {
  const gate = await requireContractAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!z.string().uuid().safeParse(contractId).success) {
    return { ok: false, error: "Contrat invalide." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contract_documents")
    .select(COLUMNS)
    .eq("contract_id", contractId)
    .order("created_at", { ascending: false });

  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((row) => ({ ...row, size_bytes: Number(row.size_bytes) })),
  };
}

/** Issues a one-time upload URL so large scans bypass the Server Action body limit. */
export async function prepareContractDocumentUpload(
  input: unknown,
): Promise<ActionResult<{ path: string; token: string }>> {
  const gate = await requireContractWrite();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = prepareSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Fichier invalide." };
  const { contract_id, file_name, size } = parsed.data;

  const issue = contractDocIssue(file_name, size);
  if (issue) return { ok: false, error: issue };
  const type = resolveContractDocType(file_name)!;

  const supabase = await createClient();
  const { data: contract } = await supabase
    .from("ref_contracts")
    .select("id")
    .eq("id", contract_id)
    .maybeSingle();
  if (!contract) return { ok: false, error: "Contrat introuvable." };

  const path = contractDocPath(contract_id, crypto.randomUUID(), type.ext);
  const { data, error } = await supabase.storage
    .from(CONTRACT_DOCS_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Envoi refusé." };
  }
  return { ok: true, data: { path, token: data.token } };
}

export async function registerContractDocument(
  input: unknown,
): Promise<ActionResult<ContractDocumentRow>> {
  const gate = await requireContractWrite();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const p = parsed.data;
  if (!isContractDocPath(p.path, p.contract_id)) {
    return { ok: false, error: "Chemin de fichier invalide." };
  }
  const type = resolveContractDocType(p.file_name);
  if (!type || !p.path.endsWith(`.${type.ext}`)) {
    return { ok: false, error: "Le type du fichier ne correspond pas." };
  }

  const supabase = await createClient();
  const objectName = p.path.split("/")[1];
  const { data: objects, error: listError } = await supabase.storage
    .from(CONTRACT_DOCS_BUCKET)
    .list(p.contract_id, { search: objectName, limit: 1 });
  if (listError) return { ok: false, error: listError.message };
  const stored = objects?.find((object) => object.name === objectName);
  if (!stored) return { ok: false, error: "Le fichier n'a pas été reçu. Réessayez." };
  const size = Number((stored.metadata as { size?: number } | null)?.size ?? 0);
  const issue = contractDocIssue(p.file_name, size);
  if (issue) {
    await supabase.storage.from(CONTRACT_DOCS_BUCKET).remove([p.path]);
    return { ok: false, error: issue };
  }

  const { data, error } = await supabase
    .from("contract_documents")
    .insert({
      contract_id: p.contract_id,
      kind: p.kind,
      title: p.title,
      file_name: p.file_name,
      storage_path: p.path,
      mime_type: type.mime,
      size_bytes: size,
      signed_on: p.signed_on,
      notes: p.notes,
    })
    .select(COLUMNS)
    .single();
  if (error) {
    await supabase.storage.from(CONTRACT_DOCS_BUCKET).remove([p.path]);
    return { ok: false, error: error.message };
  }

  revalidateContract(p.contract_id);
  return { ok: true, data: { ...data, size_bytes: Number(data.size_bytes) } };
}

export async function deleteContractDocument(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireContractWrite();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Document invalide." };
  }

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("contract_documents")
    .delete()
    .eq("id", id)
    .select("id, contract_id, storage_path")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "Suppression refusée." };

  const { error: removeError } = await supabase.storage
    .from(CONTRACT_DOCS_BUCKET)
    .remove([row.storage_path]);
  revalidateContract(row.contract_id);
  if (removeError) {
    return {
      ok: false,
      error: `Document retiré de la liste, mais le fichier n'a pas été effacé : ${removeError.message}`,
    };
  }
  return { ok: true, data: { id: row.id } };
}
