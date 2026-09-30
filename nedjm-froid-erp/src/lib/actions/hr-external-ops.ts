"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { createClient } from "@/lib/supabase/server";
import {
  EXTERNAL_DOC_BUCKET,
  EXTERNAL_DOC_MAX_BYTES,
  EXTERNAL_DOC_MIME,
  EXTERNAL_SUBTYPES,
  parseExternalOperations,
  type ExternalOperation,
} from "@/lib/hr/external-operations";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export type ExternalAccess = {
  read: boolean;
  enter: boolean;
  withdraw: boolean;
  confirm: boolean;
  examine: boolean;
  isSuperAdmin: boolean;
  userName: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = z.string().regex(UUID_RE, "Identifiant invalide.");
const month = z.string().regex(/^\d{4}-\d{2}$/, "Mois invalide (AAAA-MM).");
const EXT: Record<(typeof EXTERNAL_DOC_MIME)[number], string> = {
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

function revalidateExternal() {
  revalidatePath("/rh/paie/operations-externes");
  revalidatePath("/rh/paie/virements");
  revalidatePath("/rh/paie/declarations");
  revalidatePath("/decisions");
}

export async function getExternalAccess(): Promise<ActionResult<ExternalAccess>> {
  const ws = await getWorkspaceProfile();
  if (!ws) return { ok: false, error: "Session requise. · يلزم تسجيل الدخول." };
  const supabase = await createClient();
  const [read, enter, withdraw, confirm, examine] = await Promise.all([
    perm(supabase, "hr_external_operations", "read"),
    perm(supabase, "hr_external_operations", "create"),
    perm(supabase, "hr_external_operations", "update"),
    perm(supabase, "hr_external_operations_confirm", "update"),
    perm(supabase, "hr_external_operations_examine", "update"),
  ]);
  return {
    ok: true,
    data: { read, enter, withdraw, confirm, examine, isSuperAdmin: ws.isSuperAdmin, userName: ws.fullName ?? null },
  };
}

type NameJoin = { full_name: string | null } | { full_name: string | null }[] | null;
const nameOf = (v: NameJoin) => (Array.isArray(v) ? v[0] : v)?.full_name ?? null;

export async function listExternalOperations(input: { year: number }): Promise<ActionResult<ExternalOperation[]>> {
  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) return { ok: false, error: "Année invalide." };
  const supabase = await createClient();
  const from = `${input.year}-01-01`;
  const to = `${input.year}-12-01`;
  const { data, error } = await supabase
    .from("hr_external_operations")
    .select(
      `id, root_id, version_no, kind, subtype, period_from, period_to, site_ids, employee_ids, operation_date,
       reference, organism, total_amount, source, description, status, withdrawn_reason, withdrawn_at,
       created_at, confirmed_at,
       author:sys_users!created_by ( full_name ),
       confirmer:sys_users!confirmed_by ( full_name ),
       documents:hr_external_operation_documents!operation_id (
         id, file_name, sha256, is_current, uploaded_at, examined_at, examination_note,
         uploader:sys_users!uploaded_by ( full_name ),
         examiner:sys_users!examined_by ( full_name )
       )`,
    )
    .lte("period_from", to)
    .gte("period_to", from)
    .order("period_from", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return { ok: false, error: error.message };
  const siteIds = [...new Set((data ?? []).flatMap((o) => (o.site_ids as string[] | null) ?? []))];
  const siteNames = new Map<string, string>();
  if (siteIds.length) {
    const { data: sites } = await supabase.from("ref_sites").select("id, name_fr").in("id", siteIds);
    for (const s of sites ?? []) siteNames.set(s.id, s.name_fr);
  }
  return {
    ok: true,
    data: parseExternalOperations(
      (data ?? []).map((o) => ({
        ...o,
        sites: o.site_ids ? (o.site_ids as string[]).map((id) => siteNames.get(id) ?? id).sort() : null,
        employee_count: o.employee_ids ? (o.employee_ids as string[]).length : null,
        declared_by: nameOf(o.author as NameJoin),
        declared_at: o.created_at,
        confirmed_by: nameOf(o.confirmer as NameJoin),
        documents: ((o.documents ?? []) as Record<string, unknown>[])
          .map((d): Record<string, unknown> => ({
            ...d,
            uploaded_by: nameOf(d.uploader as NameJoin),
            examined_by: nameOf(d.examiner as NameJoin),
          }))
          .sort((a, b) => String(a.uploaded_at ?? "").localeCompare(String(b.uploaded_at ?? ""))),
      })),
    ),
  };
}

const saveSchema = z
  .object({
    supersedes: uuid.nullable().default(null),
    kind: z.enum(["PAYMENT", "DECLARATION"]),
    subtype: z.string().min(1).max(20),
    period_from: month,
    period_to: month,
    site_ids: z.array(uuid).max(200).nullable().default(null),
    employee_ids: z.array(uuid).max(2000).nullable().default(null),
    operation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
    reference: z.string().max(120).default(""),
    organism: z.string().max(120).default(""),
    total_amount: z.number().nonnegative().max(1e12).nullable().default(null),
    source: z.enum(["DECLARATIVE", "DOCUMENT"]),
    description: z.string().trim().min(10, "Description obligatoire (10 caractères minimum).").max(1000),
    correction_reason: z.string().trim().max(500).default(""),
  })
  .refine((v) => EXTERNAL_SUBTYPES[v.kind].includes(v.subtype), { message: "Sous-type incompatible avec le type." })
  .refine((v) => v.period_to >= v.period_from, { message: "Période invalide (fin avant début)." })
  .refine((v) => !v.supersedes || v.correction_reason.length >= 10, {
    message: "Motif de la correction obligatoire (10 caractères minimum).",
  });

/** New entry, or correction (new version) of an active one. */
export async function saveExternalOperation(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  const p = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_external_op_save", {
    p_supersedes: p.supersedes,
    p: {
      kind: p.kind,
      subtype: p.subtype,
      period_from: `${p.period_from}-01`,
      period_to: `${p.period_to}-01`,
      site_ids: p.site_ids?.length ? p.site_ids : null,
      employee_ids: p.employee_ids?.length ? p.employee_ids : null,
      operation_date: p.operation_date,
      reference: p.reference,
      organism: p.organism,
      total_amount: p.total_amount,
      source: p.source,
      description: p.description,
      correction_reason: p.correction_reason || null,
    },
  });
  revalidateExternal();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: String(data) } };
}

export async function confirmExternalOperation(id: string): Promise<ActionResult> {
  if (!UUID_RE.test(id)) return { ok: false, error: "Opération invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("hr_external_op_confirm", { p_id: id });
  revalidateExternal();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

export async function withdrawExternalOperation(input: { id: string; reason: string }): Promise<ActionResult> {
  if (!UUID_RE.test(input.id)) return { ok: false, error: "Opération invalide." };
  const reason = (input.reason ?? "").trim();
  if (reason.length < 10 || reason.length > 500) return { ok: false, error: "Motif du retrait obligatoire (10 à 500 caractères)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("hr_external_op_withdraw", { p_id: input.id, p_reason: reason });
  revalidateExternal();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

const prepareSchema = z.object({
  operation_id: uuid,
  root_id: uuid,
  mime: z.enum(EXTERNAL_DOC_MIME),
  size: z.number().int().positive().max(EXTERNAL_DOC_MAX_BYTES, "Pièce trop volumineuse (15 Mo maximum)."),
});

/** One-time upload URL: the file goes straight to the private bucket (Server Action body limit). */
export async function prepareExternalDocumentUpload(input: unknown): Promise<ActionResult<{ path: string; token: string }>> {
  const parsed = prepareSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Pièce invalide (PDF, JPEG, PNG ou WebP)." };
  const p = parsed.data;
  const supabase = await createClient();
  const { data: op } = await supabase
    .from("hr_external_operations")
    .select("id, root_id, status")
    .eq("id", p.operation_id)
    .maybeSingle();
  if (!op || op.root_id !== p.root_id) return { ok: false, error: "Opération externe introuvable." };
  if (op.status !== "ACTIVE") return { ok: false, error: "Seule une opération active reçoit une pièce." };
  const path = `${p.root_id}/${crypto.randomUUID()}.${EXT[p.mime]}`;
  const { data, error } = await supabase.storage.from(EXTERNAL_DOC_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: error?.message ?? "Envoi refusé." };
  return { ok: true, data: { path, token: data.token } };
}

const registerSchema = z.object({
  operation_id: uuid,
  path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/, "Chemin de pièce invalide."),
  file_name: z.string().trim().min(1).max(200),
  mime: z.enum(EXTERNAL_DOC_MIME),
  replaces: uuid.nullable().default(null),
});

/** The server reads the stored object back to compute its SHA-256; the client never supplies the hash. */
export async function registerExternalDocument(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  const p = parsed.data;
  if (!p.path.endsWith(`.${EXT[p.mime]}`)) return { ok: false, error: "Le type de la pièce ne correspond pas." };
  const supabase = await createClient();
  const { data: blob, error: dlErr } = await supabase.storage.from(EXTERNAL_DOC_BUCKET).download(p.path);
  if (dlErr || !blob) return { ok: false, error: "Pièce non reçue : réessayez l'envoi." };
  const bytes = Buffer.from(await blob.arrayBuffer());
  if (bytes.byteLength > EXTERNAL_DOC_MAX_BYTES) return { ok: false, error: "Pièce trop volumineuse (15 Mo maximum)." };
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const { data, error } = await supabase.rpc("hr_external_op_add_document", {
    p_op: p.operation_id,
    p_path: p.path,
    p_name: p.file_name,
    p_mime: p.mime,
    p_size: bytes.byteLength,
    p_sha256: sha256,
    p_replaces: p.replaces,
  });
  revalidateExternal();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: String(data) } };
}

export async function examineExternalDocument(input: { id: string; note: string }): Promise<ActionResult> {
  if (!UUID_RE.test(input.id)) return { ok: false, error: "Pièce invalide." };
  const note = (input.note ?? "").trim();
  if (note.length < 10 || note.length > 1000) return { ok: false, error: "Observation obligatoire (10 à 1000 caractères)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("hr_external_op_examine", { p_doc: input.id, p_note: note });
  revalidateExternal();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

/** Short-lived signed link to read a document (private bucket, read right required by the storage policy). */
export async function getExternalDocumentUrl(id: string): Promise<ActionResult<{ url: string }>> {
  if (!UUID_RE.test(id)) return { ok: false, error: "Pièce invalide." };
  const supabase = await createClient();
  const { data: doc, error } = await supabase
    .from("hr_external_operation_documents")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!doc) return { ok: false, error: "Pièce introuvable." };
  const { data, error: urlErr } = await supabase.storage.from(EXTERNAL_DOC_BUCKET).createSignedUrl(doc.storage_path, 120);
  if (urlErr || !data) return { ok: false, error: urlErr?.message ?? "Lien indisponible." };
  return { ok: true, data: { url: data.signedUrl } };
}
