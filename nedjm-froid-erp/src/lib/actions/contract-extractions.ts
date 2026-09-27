"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { geminiConfigured, geminiModel, generateStructured, type GeminiPart } from "@/lib/ai/gemini";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import {
  requireContractAccess,
  requireContractWrite,
} from "@/lib/auth/require-roles";
import { normalizeContractAttributes } from "@/lib/contracts/attributes-schema";
import {
  CONTRACT_DOCS_BUCKET,
  isAnalysable,
  resolveContractDocType,
} from "@/lib/contracts/document-files";
import { docxToText } from "@/lib/contracts/docx-text";
import { applyExtraction } from "@/lib/contracts/extraction-apply";
import {
  EXTRACTION_JSON_SCHEMA,
  buildExtractionPrompt,
  extractionResultSchema,
  extractionTargetSchema,
  restrictToTargets,
  type ExtractionResult,
  type ExtractionTarget,
} from "@/lib/contracts/extraction-schema";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getContract, replaceContractAttributes, upsertContract } from "@/lib/actions/contracts";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ContractExtractionRow = {
  id: string;
  contract_id: string;
  document_ids: string[];
  targets: ExtractionTarget[];
  status: "DONE" | "APPLIED" | "DISCARDED";
  model: string;
  result: ExtractionResult;
  created_at: string;
};

/** Gemini accepts about 20 MB per inline request; keep margin for base64 overhead. */
const MAX_INLINE_BYTES = 14 * 1024 * 1024;
const MAX_DOCUMENTS = 6;
const MAX_PASTED_CHARS = 60_000;

const analyzeSchema = z.object({
  contract_id: z.string().uuid(),
  document_ids: z.array(z.string().uuid()).max(MAX_DOCUMENTS).default([]),
  targets: z.array(extractionTargetSchema).min(1, "Choisissez au moins une rubrique à extraire."),
  pasted_text: z.string().max(MAX_PASTED_CHARS, "Texte collé trop long (60 000 caractères maximum).").default(""),
});

const applySchema = z.object({
  extraction_id: z.string().uuid(),
  header: z
    .array(z.enum(["start_date", "end_date", "ods_date", "total_amount_ht", "caution_rate"]))
    .default([]),
  penalties: z.array(z.number().int().min(0)).default([]),
  penalty_cap: z.boolean().default(false),
  termination: z.boolean().default(false),
  clauses: z.array(z.number().int().min(0)).default([]),
});

function toRow(row: Record<string, unknown>): ContractExtractionRow {
  return {
    id: String(row.id),
    contract_id: String(row.contract_id),
    document_ids: (row.document_ids as string[]) ?? [],
    targets: (row.targets as ExtractionTarget[]) ?? [],
    status: row.status as ContractExtractionRow["status"],
    model: String(row.model),
    result: extractionResultSchema.parse(row.result ?? {}),
    created_at: String(row.created_at),
  };
}

const COLUMNS = "id, contract_id, document_ids, targets, status, model, result, created_at";

export async function getAiExtractionStatus(): Promise<{ configured: boolean; model: string }> {
  return { configured: geminiConfigured(), model: geminiModel() };
}

export async function getOpenContractExtraction(
  contractId: string,
): Promise<ActionResult<ContractExtractionRow | null>> {
  const gate = await requireContractAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!z.string().uuid().safeParse(contractId).success) {
    return { ok: false, error: "Contrat invalide." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contract_extractions")
    .select(COLUMNS)
    .eq("contract_id", contractId)
    .eq("status", "DONE")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data ? toRow(data) : null };
}

export async function analyzeContractDocuments(
  input: unknown,
): Promise<ActionResult<ContractExtractionRow>> {
  const gate = await requireContractWrite();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!geminiConfigured()) {
    return {
      ok: false,
      error: "L'analyse IA n'est pas configurée : ajoutez la clé GEMINI_API_KEY sur le serveur.",
    };
  }

  const parsed = analyzeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Demande invalide." };
  }
  const p = parsed.data;
  const pasted = p.pasted_text.trim();
  if (!p.document_ids.length && !pasted) {
    return { ok: false, error: "Choisissez au moins un document ou collez un texte." };
  }

  const supabase = await createClient();
  const contractRes = await getContract(p.contract_id);
  if (!contractRes.ok) return { ok: false, error: contractRes.error };

  const { data: docs, error: docsError } = await supabase
    .from("contract_documents")
    .select("id, file_name, storage_path, title, kind")
    .eq("contract_id", p.contract_id)
    .in("id", p.document_ids.length ? p.document_ids : ["00000000-0000-0000-0000-000000000000"]);
  if (docsError) return { ok: false, error: docsError.message };
  const ordered = p.document_ids
    .map((id) => docs?.find((doc) => doc.id === id))
    .filter((doc): doc is NonNullable<typeof doc> => Boolean(doc));
  if (ordered.length !== p.document_ids.length) {
    return { ok: false, error: "Un des documents choisis est introuvable." };
  }

  const parts: GeminiPart[] = [];
  const labels: string[] = [];
  let inlineBytes = 0;
  for (const [index, doc] of ordered.entries()) {
    if (!isAnalysable(doc.file_name)) {
      return {
        ok: false,
        error: `« ${doc.file_name} » ne peut pas être analysé (PDF, Word .docx ou image uniquement).`,
      };
    }
    const type = resolveContractDocType(doc.file_name)!;
    const { data: blob, error: downloadError } = await supabase.storage
      .from(CONTRACT_DOCS_BUCKET)
      .download(doc.storage_path);
    if (downloadError || !blob) {
      return { ok: false, error: `Lecture de « ${doc.file_name} » impossible.` };
    }
    const bytes = await blob.arrayBuffer();
    labels.push(`${doc.title || doc.file_name} (${type.format})`);
    parts.push({ text: `--- Document ${index + 1} : ${doc.title || doc.file_name} ---` });
    if (type.format === "WORD") {
      try {
        const text = await docxToText(bytes);
        if (!text) return { ok: false, error: `« ${doc.file_name} » ne contient pas de texte.` };
        parts.push({ text: text.slice(0, MAX_PASTED_CHARS) });
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Document Word illisible." };
      }
    } else {
      inlineBytes += bytes.byteLength;
      if (inlineBytes > MAX_INLINE_BYTES) {
        return {
          ok: false,
          error: "Les documents choisis dépassent 14 Mo au total. Analysez-les en plusieurs fois.",
        };
      }
      parts.push({
        inline_data: { mime_type: type.mime, data: Buffer.from(bytes).toString("base64") },
      });
    }
  }
  if (pasted) {
    parts.push({ text: `--- Document 0 : texte collé ---\n${pasted}` });
  }

  const attrs = contractRes.data.attributes;
  const prompt = buildExtractionPrompt({
    targets: p.targets,
    documentLabels: labels,
    presets: [...attrs.penalties.presets, ...attrs.penalties.custom],
    hasPastedText: Boolean(pasted),
  });

  let result: ExtractionResult;
  try {
    const raw = await generateStructured({
      parts: [{ text: prompt }, ...parts],
      schema: EXTRACTION_JSON_SCHEMA,
    });
    result = restrictToTargets(extractionResultSchema.parse(raw ?? {}), p.targets);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Analyse impossible." };
  }

  const { data, error } = await supabase
    .from("contract_extractions")
    .insert({
      contract_id: p.contract_id,
      document_ids: p.document_ids,
      targets: p.targets,
      pasted_text: Boolean(pasted),
      status: "DONE",
      model: geminiModel(),
      result,
    })
    .select(COLUMNS)
    .single();
  if (error) return { ok: false, error: error.message };

  await supabase
    .from("contract_extractions")
    .update({ status: "DISCARDED" })
    .eq("contract_id", p.contract_id)
    .eq("status", "DONE")
    .neq("id", data.id);

  revalidatePath(`/referentiels/contrats/${p.contract_id}`);
  return { ok: true, data: toRow(data) };
}

export async function discardContractExtraction(
  extractionId: string,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireContractWrite();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!z.string().uuid().safeParse(extractionId).success) {
    return { ok: false, error: "Analyse invalide." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contract_extractions")
    .update({ status: "DISCARDED" })
    .eq("id", extractionId)
    .eq("status", "DONE")
    .select("id, contract_id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Analyse introuvable ou déjà traitée." };
  revalidatePath(`/referentiels/contrats/${data.contract_id}`);
  return { ok: true, data: { id: data.id } };
}

export async function applyContractExtraction(
  input: unknown,
): Promise<ActionResult<{ applied: string[]; skipped: string[] }>> {
  const gate = await requireContractWrite();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = applySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Sélection invalide." };
  const selection = parsed.data;

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("contract_extractions")
    .select(COLUMNS)
    .eq("id", selection.extraction_id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "Analyse introuvable." };
  const extraction = toRow(row);
  if (extraction.status !== "DONE") {
    return { ok: false, error: "Cette analyse a déjà été appliquée ou abandonnée." };
  }

  const contractRes = await getContract(extraction.contract_id);
  if (!contractRes.ok) return { ok: false, error: contractRes.error };
  const contract = contractRes.data;

  const merged = applyExtraction({
    attributes: normalizeContractAttributes(contract.attributes),
    header: {
      start_date: contract.start_date,
      end_date: contract.end_date,
      ods_date: contract.ods_date,
      total_amount_ht: contract.total_amount_ht,
      caution_rate: contract.caution_rate,
      total_mode: contract.attributes.financial.total_mode,
    },
    result: extraction.result,
    selection,
    documentIds: extraction.document_ids,
    newId: () => crypto.randomUUID(),
  });

  if (!merged.applied.length) {
    return {
      ok: false,
      error: merged.skipped.length
        ? `Rien n'a été appliqué. ${merged.skipped.join(" ")}`
        : "Aucune proposition sélectionnée.",
    };
  }

  if (merged.attributesChanged) {
    const saved = await replaceContractAttributes({
      contract_id: contract.id,
      attributes: merged.attributes,
    });
    if (!saved.ok) return { ok: false, error: saved.error };
  }

  if (Object.keys(merged.header).length) {
    const fin = contract.attributes.financial;
    const saved = await upsertContract({
      id: contract.id,
      contract_number: contract.contract_number,
      client_id: contract.client_id,
      client_name: contract.client_name,
      site_id: contract.site_id,
      start_date: merged.header.start_date ?? contract.start_date,
      end_date: merged.header.end_date ?? contract.end_date,
      ods_date: merged.header.ods_date ?? contract.ods_date,
      total_amount_ht: merged.header.total_amount_ht ?? contract.total_amount_ht,
      caution_rate: merged.header.caution_rate ?? contract.caution_rate,
      caution_amount: contract.caution_amount,
      status: contract.status,
      total_mode: fin.total_mode,
      caution_sync: fin.caution_sync,
      tva_mode: fin.tva_mode,
      tva_exempt: fin.tva_exempt,
      tva_articles: fin.tva_articles.join(","),
      default_tax_rate_code: fin.default_tax_rate_code,
      tva_standard_rate: fin.tva_standard_rate,
    });
    if (!saved.ok) {
      return {
        ok: false,
        error: merged.attributesChanged
          ? `Pénalités et clauses enregistrées, mais l'en-tête a échoué : ${saved.error}`
          : saved.error,
      };
    }
  }

  await supabase
    .from("contract_extractions")
    .update({ status: "APPLIED", applied_selection: selection, applied_at: new Date().toISOString() })
    .eq("id", extraction.id);

  const profile = await getWorkspaceProfile();
  const { error: auditError } = await createServiceClient().rpc("sys_audit_write", {
    p_user_id: profile?.id ?? null,
    p_action: "UPDATE",
    p_table_name: "contract_extraction",
    p_target_id: contract.id,
    p_old: {
      header: {
        start_date: contract.start_date,
        end_date: contract.end_date,
        ods_date: contract.ods_date,
        total_amount_ht: contract.total_amount_ht,
        caution_rate: contract.caution_rate,
      },
      penalties: contract.attributes.penalties,
      clauses: contract.attributes.clauses,
    },
    p_new: {
      extraction_id: extraction.id,
      model: extraction.model,
      header: merged.header,
      penalties: merged.attributes.penalties,
      clauses: merged.attributes.clauses,
      applied: merged.applied,
    },
    p_ip: null,
    p_user_agent: null,
    p_request_id: null,
  });

  revalidatePath(`/referentiels/contrats/${contract.id}`);
  const skipped = auditError
    ? [...merged.skipped, `Journal d'audit non écrit : ${auditError.message}`]
    : merged.skipped;
  return { ok: true, data: { applied: merged.applied, skipped } };
}
