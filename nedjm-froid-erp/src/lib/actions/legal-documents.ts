"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { createClient } from "@/lib/supabase/server";
import {
  LEGAL_DOC_BUCKET,
  LEGAL_DOC_MAX_BYTES,
  LEGAL_DOC_MIME,
  legalDocMetaSchema,
  legalDocRpcMeta as rpcMeta,
  parseLegalDocuments,
  type LegalDocument,
} from "@/lib/rules/legal-documents";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export type LegalDocAccess = { read: boolean; create: boolean; withdraw: boolean; isSuperAdmin: boolean };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = z.string().regex(UUID_RE, "Identifiant invalide.");
const EXT: Record<(typeof LEGAL_DOC_MIME)[number], string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function perm(supabase: Supabase, screen: string, action: "read" | "create" | "update") {
  const { data } = await supabase.rpc("erp_has_perm", { p_screen: screen, p_action: action });
  return data === true;
}

function revalidateDocuments() {
  revalidatePath("/rh/legal/documents");
  revalidatePath("/rh/legal/propositions");
  revalidatePath("/rh/legal");
  revalidatePath("/decisions");
}

export async function getLegalDocAccess(): Promise<ActionResult<LegalDocAccess>> {
  const ws = await getWorkspaceProfile();
  if (!ws) return { ok: false, error: "Session requise. · يلزم تسجيل الدخول." };
  const supabase = await createClient();
  const [read, create, withdraw, canCite] = await Promise.all([
    perm(supabase, "legal_documents", "read"),
    perm(supabase, "legal_documents", "create"),
    perm(supabase, "legal_documents", "update"),
    supabase.rpc("ref_legal_docs_can_read"),
  ]);
  return {
    ok: true,
    data: {
      read: ws.isSuperAdmin || read || canCite.data === true,
      create: ws.isSuperAdmin || create,
      withdraw: ws.isSuperAdmin || withdraw,
      isSuperAdmin: ws.isSuperAdmin,
    },
  };
}

/** Every version of the entries whose application period overlaps the year (all entries when no year). */
export async function listLegalDocuments(input?: { year?: number | null }): Promise<ActionResult<LegalDocument[]>> {
  const year = input?.year ?? null;
  if (year != null && (!Number.isInteger(year) || year < 1990 || year > 2100)) return { ok: false, error: "Année invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ref_legal_documents_list", { p_year: year });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: parseLegalDocuments(data) };
}

/** Versions that can be cited now (in force at the register), for the proposal forms. */
export async function listCitableDocuments(): Promise<ActionResult<LegalDocument[]>> {
  const r = await listLegalDocuments();
  if (!r.ok) return r;
  return { ok: true, data: r.data.filter((d) => d.status === "ACTIVE") };
}

const prepareSchema = z.object({
  mime: z.enum(LEGAL_DOC_MIME, "Format non accepté (PDF, JPEG, PNG ou WebP)."),
  size: z.number().int().positive().max(LEGAL_DOC_MAX_BYTES, "Fichier trop volumineux (25 Mo maximum)."),
});

/** One-time upload URL into a fresh folder, which becomes the document id (Server Action body limit). */
export async function prepareLegalDocumentUpload(input: unknown): Promise<ActionResult<{ path: string; token: string }>> {
  const parsed = prepareSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Fichier invalide." };
  const supabase = await createClient();
  const path = `${crypto.randomUUID()}/${crypto.randomUUID()}.${EXT[parsed.data.mime]}`;
  const { data, error } = await supabase.storage.from(LEGAL_DOC_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: error?.message ?? "Envoi refusé." };
  return { ok: true, data: { path, token: data.token } };
}

const registerSchema = z.object({
  path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/, "Chemin de fichier invalide."),
  file_name: z.string().trim().min(1).max(200),
  mime: z.enum(LEGAL_DOC_MIME),
  meta: legalDocMetaSchema,
});

/** The server reads the stored object back to compute its SHA-256; the client never supplies the hash. */
export async function registerLegalDocument(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  const p = parsed.data;
  if (!p.path.endsWith(`.${EXT[p.mime]}`)) return { ok: false, error: "Le type du fichier ne correspond pas." };
  const supabase = await createClient();
  const { data: blob, error: dlErr } = await supabase.storage.from(LEGAL_DOC_BUCKET).download(p.path);
  if (dlErr || !blob) return { ok: false, error: "Fichier non reçu : réessayez l'envoi." };
  const bytes = Buffer.from(await blob.arrayBuffer());
  if (bytes.byteLength > LEGAL_DOC_MAX_BYTES) return { ok: false, error: "Fichier trop volumineux (25 Mo maximum)." };
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const { data, error } = await supabase.rpc("ref_legal_doc_create", {
    p_path: p.path,
    p_name: p.file_name,
    p_mime: p.mime,
    p_size: bytes.byteLength,
    p_sha256: sha256,
    p: rpcMeta(p.meta),
  });
  revalidateDocuments();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: String(data) } };
}

const correctSchema = z.object({
  id: uuid,
  meta: legalDocMetaSchema,
  reason: z.string().trim().min(10, "Motif de la correction obligatoire (10 caractères minimum).").max(500),
});

/** A correction is a new version of the entry's information; the file never changes. */
export async function correctLegalDocument(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = correctSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ref_legal_doc_correct", {
    p_id: parsed.data.id,
    p: rpcMeta(parsed.data.meta),
    p_reason: parsed.data.reason,
  });
  revalidateDocuments();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: String(data) } };
}

export async function withdrawLegalDocument(input: { id: string; reason: string }): Promise<ActionResult> {
  if (!UUID_RE.test(input.id)) return { ok: false, error: "Document invalide." };
  const reason = (input.reason ?? "").trim();
  if (reason.length < 10 || reason.length > 500) return { ok: false, error: "Motif du retrait obligatoire (10 à 500 caractères)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("ref_legal_doc_withdraw", { p_id: input.id, p_reason: reason });
  revalidateDocuments();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

/** Short-lived signed link to read a document (private bucket, read right required by the storage policy). */
export async function getLegalDocumentUrl(id: string): Promise<ActionResult<{ url: string }>> {
  if (!UUID_RE.test(id)) return { ok: false, error: "Document invalide." };
  const supabase = await createClient();
  const { data: doc, error } = await supabase.from("ref_legal_documents").select("storage_path").eq("id", id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!doc) return { ok: false, error: "Document introuvable." };
  const { data, error: urlErr } = await supabase.storage.from(LEGAL_DOC_BUCKET).createSignedUrl(doc.storage_path, 120);
  if (urlErr || !data) return { ok: false, error: urlErr?.message ?? "Lien indisponible." };
  return { ok: true, data: { url: data.signedUrl } };
}
