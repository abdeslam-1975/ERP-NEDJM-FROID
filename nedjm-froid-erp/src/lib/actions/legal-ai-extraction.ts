"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { geminiConfigured, geminiModel, generateStructured } from "@/lib/ai/gemini";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { createClient } from "@/lib/supabase/server";
import { listCnasRegimes, listLegalVars } from "@/lib/actions/hr-legal-vars";
import { listZoneScopes } from "@/lib/actions/rule-proposals";
import { earliestOpen, parseChainState } from "@/lib/hr/payroll-chains";
import { LEGAL_DOC_BUCKET, parseLegalDocuments, type LegalDocument } from "@/lib/rules/legal-documents";
import { applicationMonthError, isIsoDay } from "@/lib/rules/proposals";
import {
  AI_PATHS,
  AI_SUGGESTION_KINDS,
  LEGAL_AI_JSON_SCHEMA,
  buildLegalExtractionPrompt,
  legalAiResultSchema,
  parseAiExtraction,
  toSaveSuggestions,
  type AiConfidence,
  type AiExtractionView,
  type AiPath,
  type AiProposalInfo,
  type AiTargets,
} from "@/lib/rules/ai-extraction";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export type LegalAiAccess = {
  read: boolean;
  analyze: boolean;
  dismiss: boolean;
  convert: boolean;
  requestD15: boolean;
  isSuperAdmin: boolean;
  configured: boolean;
  model: string;
};

export type LegalAiDecision = { id: string; status: string; chosen_option: string | null };

export type LegalAiDocument = LegalDocument & {
  ai_path: AiPath | null;
  d15_open: LegalAiDecision | null;
  d15_last: LegalAiDecision | null;
};

export type LegalAiWorkspace = {
  documents: LegalAiDocument[];
  selected: LegalAiDocument | null;
  extraction: AiExtractionView | null;
  history: { id: string; created_at: string; status: string; suggestion_count: number; model: string }[];
  targets: AiTargets;
  firstOpenMonth: string | null;
};

/** Gemini accepts about 20 MB per inline request; keep margin for base64 overhead. */
const MAX_INLINE_BYTES = 14 * 1024 * 1024;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = z.string().regex(UUID_RE, "Identifiant invalide.");

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function perm(supabase: Supabase, screen: string, action: "read" | "create" | "update") {
  const { data } = await supabase.rpc("erp_has_perm", { p_screen: screen, p_action: action });
  return data === true;
}

function revalidateAi() {
  revalidatePath("/rh/legal/extraction-ia");
  revalidatePath("/rh/legal/documents");
  revalidatePath("/rh/legal/propositions");
  revalidatePath("/rh/legal");
  revalidatePath("/decisions");
}

export async function getLegalAiAccess(): Promise<ActionResult<LegalAiAccess>> {
  const ws = await getWorkspaceProfile();
  if (!ws) return { ok: false, error: "Session requise. · يلزم تسجيل الدخول." };
  const supabase = await createClient();
  const [read, analyze, dismiss, propose, docsCreate, d15Create, canRead] = await Promise.all([
    perm(supabase, "legal_ai_extraction", "read"),
    perm(supabase, "legal_ai_extraction", "create"),
    perm(supabase, "legal_ai_extraction", "update"),
    perm(supabase, "rule_proposals", "update"),
    perm(supabase, "legal_documents", "create"),
    perm(supabase, "decision_legal_entry_path", "create"),
    supabase.rpc("ref_legal_ai_can_read"),
  ]);
  return {
    ok: true,
    data: {
      read: ws.isSuperAdmin || read || canRead.data === true,
      analyze: ws.isSuperAdmin || analyze,
      dismiss: ws.isSuperAdmin || dismiss || propose,
      convert: ws.isSuperAdmin || propose,
      requestD15: ws.isSuperAdmin || analyze || docsCreate || d15Create,
      isSuperAdmin: ws.isSuperAdmin,
      configured: geminiConfigured(),
      model: geminiModel(),
    },
  };
}

async function loadTargets(): Promise<ActionResult<AiTargets>> {
  const [vars, regimes, zones] = await Promise.all([listLegalVars(), listCnasRegimes(), listZoneScopes()]);
  if (!vars.ok) return vars;
  if (!regimes.ok) return regimes;
  if (!zones.ok) return zones;
  return {
    ok: true,
    data: {
      vars: vars.data
        .filter((v) => v.value_type === "numeric")
        .map((v) => ({ id: v.id, key: v.key, label: v.label_fr, fraction: v.group !== "other", current: v.current_numeric })),
      regimes: regimes.data
        .filter((r) => r.is_active)
        .map((r) => ({
          id: r.id,
          code: r.code,
          label: r.label_fr,
          employee_pct: r.employee_pct,
          employer_pct: r.employer_pct,
          fos_pct: r.fos_pct,
        })),
      zones: zones.data.zones.map((z) => ({ code: z.code, label: z.label_fr })),
      wilayas: zones.data.wilayas,
    },
  };
}

const decisionOf = (d: Record<string, unknown>): LegalAiDecision => ({
  id: String(d.id),
  status: String(d.status),
  chosen_option: typeof d.chosen_option === "string" ? d.chosen_option : null,
});

export async function getLegalAiWorkspace(documentId?: string | null): Promise<ActionResult<LegalAiWorkspace>> {
  const supabase = await createClient();
  const [docsRes, pathsRes, d15Res, chainRes, targets] = await Promise.all([
    supabase.rpc("ref_legal_documents_list", { p_year: null }),
    supabase.rpc("ref_legal_ai_paths"),
    supabase
      .from("sys_decisions")
      .select("id, status, chosen_option, dedupe_key, decided_at, requested_at")
      .eq("type_code", "D15")
      .in("status", ["PENDING", "DECIDED", "EXECUTED"])
      .order("requested_at", { ascending: false }),
    supabase.rpc("hr_payroll_chain_state"),
    loadTargets(),
  ]);
  if (docsRes.error) return { ok: false, error: docsRes.error.message };
  if (pathsRes.error) return { ok: false, error: pathsRes.error.message };
  if (!targets.ok) return targets;
  const paths = (pathsRes.data ?? {}) as Record<string, unknown>;
  const decisions = (d15Res.data ?? []) as Record<string, unknown>[];
  const documents: LegalAiDocument[] = parseLegalDocuments(docsRes.data)
    .filter((d) => d.status === "ACTIVE")
    .map((d) => {
      const mine = decisions.filter((x) => x.dedupe_key === `D15:${d.root_id}`);
      const open = mine.find((x) => x.status === "PENDING" || x.status === "DECIDED");
      const last = mine
        .filter((x) => x.status === "EXECUTED")
        .sort((a, b) => String(b.decided_at ?? "").localeCompare(String(a.decided_at ?? "")))[0];
      const path = paths[d.id];
      return {
        ...d,
        ai_path: (AI_PATHS as readonly string[]).includes(String(path)) ? (path as AiPath) : null,
        d15_open: open ? decisionOf(open) : null,
        d15_last: last ? decisionOf(last) : null,
      };
    })
    .sort((a, b) => b.applies_from.localeCompare(a.applies_from) || a.title.localeCompare(b.title));

  const selected = documents.find((d) => d.id === documentId) ?? null;
  let extraction: AiExtractionView | null = null;
  let history: LegalAiWorkspace["history"] = [];
  if (selected) {
    const { data: rows, error } = await supabase
      .from("ref_legal_ai_extractions")
      .select(
        "id, document_id, root_id, model, entry_path, d15_decision_id, document_info, issues, suggestion_count, status, created_at, creator:sys_users!created_by ( full_name )",
      )
      .eq("root_id", selected.root_id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) return { ok: false, error: error.message };
    const list = (rows ?? []) as Record<string, unknown>[];
    history = list.map((r) => ({
      id: String(r.id),
      created_at: String(r.created_at),
      status: String(r.status),
      suggestion_count: Number(r.suggestion_count) || 0,
      model: String(r.model),
    }));
    const latest = list[0];
    if (latest) {
      const { data: sugg, error: sErr } = await supabase
        .from("ref_legal_ai_suggestions")
        .select("*")
        .eq("extraction_id", String(latest.id))
        .order("seq");
      if (sErr) return { ok: false, error: sErr.message };
      extraction = parseAiExtraction(latest, sugg ?? []);
    }
  }

  return {
    ok: true,
    data: {
      documents,
      selected,
      extraction,
      history,
      targets: targets.data,
      firstOpenMonth: earliestOpen(parseChainState(chainRes.data)),
    },
  };
}

const analyzeSchema = z.object({
  document_id: uuid,
  confirmed: z.literal(true, "Confirmez l'absence de données personnelles avant l'analyse."),
});

/**
 * The database checks the right, the document path (D15, official type) before the file leaves the application;
 * the answer is stored as suggestions only.
 */
export async function analyzeLegalDocument(input: unknown): Promise<ActionResult<{ extraction_id: string; count: number }>> {
  const parsed = analyzeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Demande invalide." };
  if (!geminiConfigured()) {
    return { ok: false, error: "L'analyse IA n'est pas configurée : ajoutez la clé GEMINI_API_KEY sur le serveur." };
  }
  const supabase = await createClient();
  const { data: check, error: checkErr } = await supabase.rpc("ref_legal_ai_extract_check", {
    p_document: parsed.data.document_id,
  });
  if (checkErr) return { ok: false, error: checkErr.message };
  const info = (check ?? {}) as Record<string, unknown>;
  const size = Number(info.size_bytes) || 0;
  if (size > MAX_INLINE_BYTES) {
    return { ok: false, error: "Document trop volumineux pour l'analyse (14 Mo maximum) : saisissez ses valeurs à la main." };
  }

  const { data: blob, error: dlErr } = await supabase.storage.from(LEGAL_DOC_BUCKET).download(String(info.storage_path));
  if (dlErr || !blob) return { ok: false, error: "Lecture du document impossible." };
  const bytes = await blob.arrayBuffer();
  if (bytes.byteLength > MAX_INLINE_BYTES) {
    return { ok: false, error: "Document trop volumineux pour l'analyse (14 Mo maximum) : saisissez ses valeurs à la main." };
  }

  const targets = await loadTargets();
  if (!targets.ok) return targets;
  const doc = {
    doc_type: String(info.doc_type ?? ""),
    title: String(info.title ?? ""),
    reference: String(info.reference ?? ""),
    applies_from: String(info.applies_from ?? "").slice(0, 10),
    applies_to: info.applies_to ? String(info.applies_to).slice(0, 10) : null,
  };

  let suggestions: ReturnType<typeof toSaveSuggestions>;
  let result: ReturnType<typeof legalAiResultSchema.parse>;
  try {
    const raw = await generateStructured({
      parts: [
        { text: buildLegalExtractionPrompt({ doc, targets: targets.data }) },
        { inline_data: { mime_type: String(info.mime_type), data: Buffer.from(bytes).toString("base64") } },
      ],
      schema: LEGAL_AI_JSON_SCHEMA,
    });
    result = legalAiResultSchema.parse(raw ?? {});
    suggestions = toSaveSuggestions(result, { targets: targets.data, appliesFrom: doc.applies_from });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Analyse impossible." };
  }

  const { data, error } = await supabase.rpc("ref_legal_ai_extraction_save", {
    p_document: parsed.data.document_id,
    p_model: geminiModel(),
    p_confirmed: true,
    p_document_info: result.document,
    p_issues: result.issues,
    p_suggestions: suggestions,
  });
  revalidateAi();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { extraction_id: String(data), count: suggestions.length } };
}

const monthStart = z.string().refine((v) => isIsoDay(v) && v.endsWith("-01"), "Choisissez un mois (1er du mois).");
const pct = z.number().min(0, "Taux ≥ 0.").max(100, "Taux ≤ 100 %.").nullable();

const convertSchema = z
  .object({
    id: uuid,
    kind: z.enum(AI_SUGGESTION_KINDS),
    target_id: uuid.nullable(),
    target_key: z.string().trim().max(40).nullable(),
    value: z.number().min(0, "Valeur négative refusée.").nullable().optional(),
    employee_pct: pct.optional(),
    employer_pct: pct.optional(),
    fos_pct: pct.optional(),
    wilayas: z.array(z.string().regex(/^\d{2}$/, "Wilaya invalide.")).optional(),
    title: z.string().trim().min(3, "Intitulé requis (3 caractères minimum).").max(200),
    source_ref: z.string().trim().min(3, "Source légale requise.").max(500),
    text_effective_date: z.string().refine(isIsoDay, "Date d'effet prévue par le texte requise."),
    requested_month: monthStart,
    article: z.string().trim().min(1, "Article requis.").max(120),
    page: z.number().int().min(1, "Page requise.").max(5000),
    excerpt: z.string().trim().min(10, "Extrait requis (10 caractères minimum).").max(2000),
    submit: z.boolean().default(true),
    first_open: z.string().nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "IRG_BAREME") {
      ctx.addIssue({ code: "custom", message: "Les tranches d'un barème IRG se saisissent à la main dans un brouillon de barème." });
    }
    if ((v.kind === "LEGAL_VAR" || v.kind === "CNAS_RATES") && !v.target_id) {
      ctx.addIssue({ code: "custom", message: "Choisissez la cible de la proposition." });
    }
    if (v.kind === "IRG_ZONE_SCOPE" && !v.target_key) ctx.addIssue({ code: "custom", message: "Choisissez la zone IRG." });
    if (v.kind === "LEGAL_VAR" && v.value == null) ctx.addIssue({ code: "custom", message: "Valeur numérique requise." });
    if (v.kind === "CNAS_RATES" && v.employee_pct == null && v.employer_pct == null && v.fos_pct == null) {
      ctx.addIssue({ code: "custom", message: "Indiquez au moins un taux." });
    }
    if (v.kind === "IRG_ZONE_SCOPE" && !v.wilayas?.length) ctx.addIssue({ code: "custom", message: "Sélectionnez au moins une wilaya." });
  });

/** A human turns a reviewed suggestion into a proposal (origin AI); the database refuses a value absent from the excerpt. */
export async function convertLegalAiSuggestion(input: unknown): Promise<ActionResult<{ proposal_id: string }>> {
  const parsed = convertSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  const p = parsed.data;
  const bad = applicationMonthError({ month: p.requested_month, firstOpen: p.first_open ?? null });
  if (bad) return { ok: false, error: bad };
  const payload =
    p.kind === "LEGAL_VAR"
      ? { value: p.value }
      : p.kind === "CNAS_RATES"
        ? { employee_pct: p.employee_pct ?? null, employer_pct: p.employer_pct ?? null, fos_pct: p.fos_pct ?? null }
        : { mode: "WILAYAS", group_from: null, wilayas: [...new Set(p.wilayas ?? [])].sort() };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ref_legal_ai_suggestion_convert", {
    p_id: p.id,
    p_target: p.kind === "IRG_ZONE_SCOPE" ? null : p.target_id,
    p_target_key: p.kind === "IRG_ZONE_SCOPE" ? p.target_key : null,
    p_payload: payload,
    p_title: p.title,
    p_source_ref: p.source_ref,
    p_text_effective: p.text_effective_date,
    p_requested_month: p.requested_month,
    p_article: p.article,
    p_page: p.page,
    p_excerpt: p.excerpt,
    p_submit: p.submit,
  });
  revalidateAi();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { proposal_id: String(data) } };
}

export async function dismissLegalAiSuggestion(input: unknown): Promise<ActionResult> {
  const parsed = z
    .object({ id: uuid, reason: z.string().trim().min(5, "Motif requis (5 caractères minimum).").max(500) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("ref_legal_ai_suggestion_dismiss", {
    p_id: parsed.data.id,
    p_reason: parsed.data.reason,
  });
  revalidateAi();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

/** D15: a document applied across 2025 and 2026 needs the decision maker's choice before any analysis. */
export async function requestEntryPathDecision(documentId: unknown): Promise<ActionResult<{ decision_id: string }>> {
  const parsed = uuid.safeParse(documentId);
  if (!parsed.success) return { ok: false, error: "Document invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ref_legal_doc_request_d15", { p_document: parsed.data });
  revalidateAi();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { decision_id: String(data) } };
}

/** AI origin of proposals (confidence, excerpt check, human edits), for the review screen. */
export async function getAiInfoForProposals(ids: string[]): Promise<Record<string, AiProposalInfo>> {
  const valid = ids.filter((id) => UUID_RE.test(id)).slice(0, 500);
  if (!valid.length) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("ref_legal_ai_suggestions")
    .select("id, proposal_id, extraction_id, confidence, excerpt_match, warnings, final, extraction:ref_legal_ai_extractions ( model, document_id )")
    .in("proposal_id", valid);
  const out: Record<string, AiProposalInfo> = {};
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const ex = (Array.isArray(row.extraction) ? row.extraction[0] : row.extraction) as Record<string, unknown> | null;
    const final = (row.final ?? {}) as Record<string, unknown>;
    const pid = String(row.proposal_id);
    out[pid] = {
      proposal_id: pid,
      suggestion_id: String(row.id),
      extraction_id: String(row.extraction_id),
      document_id: String(ex?.document_id ?? ""),
      model: String(ex?.model ?? ""),
      confidence: (["HIGH", "MEDIUM", "LOW"].includes(String(row.confidence)) ? row.confidence : "LOW") as AiConfidence,
      excerpt_match: row.excerpt_match === true,
      payload_edited: final.payload_edited === true,
      excerpt_edited: final.excerpt_edited === true,
      warnings: Array.isArray(row.warnings) ? row.warnings.filter((w): w is string => typeof w === "string") : [],
    };
  }
  return out;
}
