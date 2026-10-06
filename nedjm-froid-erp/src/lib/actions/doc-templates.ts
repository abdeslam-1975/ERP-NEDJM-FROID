"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sanitizeTemplate } from "@/lib/doc/engine";
import { loadApprovedTemplates, loadPrintKit, type PrintKit } from "@/lib/doc/print-kit";
import { isCustomDocType } from "@/lib/doc/custom-docs";
import { isDocType, type DocTypeId } from "@/lib/doc/registry";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export type DocTemplateRow = {
  id: string;
  doc_type: string;
  version: number | null;
  status: "draft" | "approved";
  html: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
};

export type DocTemplateState = {
  approved: DocTemplateRow | null;
  draft: DocTemplateRow | null;
  history: DocTemplateRow[];
  canEdit: boolean;
};

const COLUMNS = "id, doc_type, version, status, html, note, created_at, updated_at, approved_at";
const MAX_TEMPLATE = 600_000;

/** Built-in documents and the ones created from the interface (custom_<code>). */
function isTemplateType(docType: unknown): docType is string {
  return isDocType(docType) || isCustomDocType(docType);
}

function revalidateDocs() {
  revalidatePath("/simulateur");
  revalidatePath("/rh", "layout");
}

/** HTML of the approved version currently printed. */
export async function getApprovedDocTemplate(docType: DocTypeId): Promise<ActionResult<string>> {
  if (!isDocType(docType)) return { ok: false, error: "Document inconnu." };
  const supabase = await createClient();
  const r = await loadApprovedTemplates(supabase, [docType]);
  if (!r.ok) return r;
  return { ok: true, data: r.data[docType] ?? "" };
}

/** Approved templates of the documents and the company identity they print. */
export async function getPrintKit(docTypes: DocTypeId[]): Promise<ActionResult<PrintKit>> {
  if (!Array.isArray(docTypes) || !docTypes.every(isDocType)) return { ok: false, error: "Document inconnu." };
  const supabase = await createClient();
  return loadPrintKit(supabase, docTypes);
}

export async function getDocTemplateState(docType: string): Promise<ActionResult<DocTemplateState>> {
  if (!isTemplateType(docType)) return { ok: false, error: "Document inconnu." };
  const supabase = await createClient();
  const [rows, perm] = await Promise.all([
    supabase
      .from("doc_templates")
      .select(COLUMNS)
      .eq("doc_type", docType)
      .order("version", { ascending: false, nullsFirst: true })
      .limit(40),
    supabase.rpc("erp_has_perm", { p_screen: "hr_settings", p_action: "update" }),
  ]);
  if (rows.error) return { ok: false, error: rows.error.message };
  const list = (rows.data ?? []) as DocTemplateRow[];
  const history = list.filter((r) => r.status === "approved");
  return {
    ok: true,
    data: {
      approved: history[0] ?? null,
      draft: list.find((r) => r.status === "draft") ?? null,
      history,
      canEdit: perm.data === true,
    },
  };
}

export async function saveDocTemplateDraft(
  docType: string,
  html: string,
  note?: string | null,
): Promise<ActionResult<DocTemplateRow>> {
  if (!isTemplateType(docType)) return { ok: false, error: "Document inconnu." };
  if (typeof html !== "string" || !html.trim()) return { ok: false, error: "Modèle vide." };
  if (html.length > MAX_TEMPLATE) return { ok: false, error: "Modèle trop volumineux." };
  const clean = sanitizeTemplate(html);
  const supabase = await createClient();
  const existing = await supabase
    .from("doc_templates")
    .select("id")
    .eq("doc_type", docType)
    .eq("status", "draft")
    .maybeSingle();
  if (existing.error) return { ok: false, error: existing.error.message };
  const payload = { html: clean, note: note?.trim() || null };
  const query = existing.data
    ? supabase.from("doc_templates").update(payload).eq("id", existing.data.id)
    : supabase.from("doc_templates").insert({ ...payload, doc_type: docType, status: "draft" });
  const { data, error } = await query.select(COLUMNS).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Enregistrement refusé (droits)." };
  return { ok: true, data: data as DocTemplateRow };
}

export async function approveDocTemplate(docType: string, note?: string | null): Promise<ActionResult<DocTemplateRow>> {
  if (!isTemplateType(docType)) return { ok: false, error: "Document inconnu." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("doc_template_approve", { p_doc_type: docType, p_note: note ?? null });
  if (error) return { ok: false, error: error.message };
  revalidateDocs();
  const row = (Array.isArray(data) ? data[0] : data) as Omit<DocTemplateRow, "html"> & { html?: string };
  return { ok: true, data: { ...row, html: row.html ?? "" } as DocTemplateRow };
}

export async function discardDocTemplateDraft(docType: string): Promise<ActionResult> {
  if (!isTemplateType(docType)) return { ok: false, error: "Document inconnu." };
  const supabase = await createClient();
  const { error } = await supabase.from("doc_templates").delete().eq("doc_type", docType).eq("status", "draft");
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

/** Copies an approved version into the draft (it still has to be approved). */
export async function restoreDocTemplateVersion(docType: string, id: string): Promise<ActionResult<DocTemplateRow>> {
  if (!isTemplateType(docType)) return { ok: false, error: "Document inconnu." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("doc_templates")
    .select("html, version")
    .eq("id", id)
    .eq("doc_type", docType)
    .eq("status", "approved")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Version introuvable." };
  return saveDocTemplateDraft(docType, data.html, `Restauration de la version ${data.version}`);
}
