"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { geminiConfigured, generateStructured } from "@/lib/ai/gemini";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { createClient } from "@/lib/supabase/server";
import { upsertHrFile } from "@/lib/actions/hr-documents";
import type { ActionResult } from "@/lib/actions/hr-contracts";
import { contractArchiveType } from "@/lib/hr/contract-archive";
import {
  CONTRACT_PDF_JSON_SCHEMA,
  CONTRACT_PDF_MAX_BYTES,
  CONTRACT_PDF_MIME,
  contractPdfPrompt,
  contractPdfSchema,
  type ContractPdfRead,
} from "@/lib/hr/contract-pdf";
import { HR_DOCS_BUCKET, hrFileHref } from "@/lib/hr/hr-file-url";
import { archiveFileStem, archiveFolder } from "@/lib/pdf/print-archive";

const STAGING = "contrats-pdf";
const EXT: Record<(typeof CONTRACT_PDF_MIME)[number], string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MIME_OF: Record<string, (typeof CONTRACT_PDF_MIME)[number]> = Object.fromEntries(
  Object.entries(EXT).map(([mime, ext]) => [ext, mime as (typeof CONTRACT_PDF_MIME)[number]]),
);
const stagedPath = z.string().regex(new RegExp(`^${STAGING}/[0-9a-f-]{36}\\.(pdf|jpg|png|webp)$`));

/** Signed upload slot for a scanned contract, read by the AI before the contract exists. */
export async function prepareContractPdfUpload(input: unknown): Promise<ActionResult<{ path: string; token: string }>> {
  const parsed = z
    .object({ mime: z.enum(CONTRACT_PDF_MIME), size: z.number().int().positive().max(CONTRACT_PDF_MAX_BYTES) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choisissez un PDF ou une image (14 Mo maximum)." };
  if (!(await getWorkspaceProfile())) return { ok: false, error: "Session requise." };
  if (!geminiConfigured()) return { ok: false, error: "Lecture IA non configurée (clé GEMINI_API_KEY absente)." };
  const supabase = await createClient();
  const path = `${STAGING}/${crypto.randomUUID()}.${EXT[parsed.data.mime]}`;
  const { data, error } = await supabase.storage.from(HR_DOCS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: error?.message ?? "Envoi refusé." };
  return { ok: true, data: { path, token: data.token } };
}

/** Reads the uploaded contract with Gemini; the result only prefills the form the user validates. */
export async function readContractPdf(input: unknown): Promise<ActionResult<ContractPdfRead>> {
  const parsed = z.object({ path: stagedPath, file_name: z.string().max(200) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Fichier invalide." };
  if (!(await getWorkspaceProfile())) return { ok: false, error: "Session requise." };
  if (!geminiConfigured()) return { ok: false, error: "Lecture IA non configurée (clé GEMINI_API_KEY absente)." };
  const supabase = await createClient();
  const { data: blob, error } = await supabase.storage.from(HR_DOCS_BUCKET).download(parsed.data.path);
  if (error || !blob) return { ok: false, error: error?.message ?? "Fichier introuvable." };
  if (blob.size > CONTRACT_PDF_MAX_BYTES) return { ok: false, error: "Fichier supérieur à 14 Mo." };
  const mime = MIME_OF[parsed.data.path.split(".").pop() ?? ""];
  try {
    const raw = await generateStructured({
      parts: [
        { text: contractPdfPrompt(parsed.data.file_name) },
        { inline_data: { mime_type: mime, data: Buffer.from(await blob.arrayBuffer()).toString("base64") } },
      ],
      schema: CONTRACT_PDF_JSON_SCHEMA,
    });
    const read = contractPdfSchema.safeParse(raw);
    if (!read.success) return { ok: false, error: "Réponse de l'IA illisible : réessayez." };
    return { ok: true, data: read.data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lecture du contrat impossible." };
  }
}

/** Files the scanned original as the archived PDF of the saved contract. */
export async function attachContractPdf(input: unknown): Promise<ActionResult<{ archive_url: string }>> {
  const parsed = z
    .object({ contract_id: z.string().uuid(), path: stagedPath, file_name: z.string().max(200) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Fichier invalide." };
  const supabase = await createClient();
  const { data: ctr, error } = await supabase
    .from("hr_contracts")
    .select("employee_id, hr_employees(matricule, last_name)")
    .eq("id", parsed.data.contract_id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!ctr) return { ok: false, error: "Contrat introuvable." };
  const emp = (Array.isArray(ctr.hr_employees) ? ctr.hr_employees[0] : ctr.hr_employees) as
    | { matricule: string | null; last_name: string | null }
    | null;
  const ext = parsed.data.path.split(".").pop();
  let path = `${archiveFolder(ctr.employee_id)}/CONTRAT-SCAN-${crypto.randomUUID()}.${ext}`;
  const moved = await supabase.storage.from(HR_DOCS_BUCKET).move(parsed.data.path, path);
  if (moved.error) path = parsed.data.path;
  const archiveUrl = hrFileHref(path);
  const filed = await upsertHrFile({
    employee_id: ctr.employee_id,
    doc_type_code: contractArchiveType(parsed.data.contract_id),
    file_url: archiveUrl,
    file_name: `CONTRAT_${archiveFileStem(emp?.matricule || "NA", emp?.last_name || "")}.${ext}`,
    storage_path: path,
    notes: `Contrat signé importé (${parsed.data.file_name}) · العقد الممضى`,
  });
  if (!filed.ok) return filed;
  revalidatePath("/rh/documents");
  return { ok: true, data: { archive_url: archiveUrl } };
}
