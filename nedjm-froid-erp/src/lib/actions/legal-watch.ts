"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { createClient } from "@/lib/supabase/server";
import { LEGAL_DOC_BUCKET, LEGAL_DOC_MAX_BYTES, legalDocMetaSchema, legalDocRpcMeta } from "@/lib/rules/legal-documents";
import {
  fileNameFromUrl,
  parseWatchDomains,
  parseWatchItems,
  parseWatchKeywords,
  parseWatchRuns,
  parseWatchSources,
  watchDomainSchema,
  watchKeywordSchema,
  watchSourceSchema,
  type WatchDomain,
  type WatchItem,
  type WatchKeyword,
  type WatchRun,
  type WatchRunSummary,
  type WatchSource,
} from "@/lib/watch/legal-watch";
import { sniffDocumentMime } from "@/lib/watch/net";
import { runLegalWatch } from "@/lib/watch/run";
import { WatchFetchError, safeFetch } from "@/lib/watch/safe-fetch";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export type LegalWatchAccess = {
  read: boolean;
  run: boolean;
  manage: boolean;
  importDocs: boolean;
  isSuperAdmin: boolean;
  cronConfigured: boolean;
};

export type LegalWatchWorkspace = {
  domains: WatchDomain[];
  keywords: WatchKeyword[];
  sources: WatchSource[];
  items: WatchItem[];
  runs: WatchRun[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = z.string().regex(UUID_RE, "Identifiant invalide.");
const EXT = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function perm(supabase: Supabase, screen: string, action: "read" | "create" | "update") {
  const { data } = await supabase.rpc("erp_has_perm", { p_screen: screen, p_action: action });
  return data === true;
}

function revalidateWatch() {
  revalidatePath("/rh/legal/veille");
  revalidatePath("/rh/legal/documents");
}

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Données invalides.";

export async function getLegalWatchAccess(): Promise<ActionResult<LegalWatchAccess>> {
  const ws = await getWorkspaceProfile();
  if (!ws) return { ok: false, error: "Session requise. · يلزم تسجيل الدخول." };
  const supabase = await createClient();
  const [read, run, manage, docs] = await Promise.all([
    perm(supabase, "legal_watch", "read"),
    perm(supabase, "legal_watch", "create"),
    perm(supabase, "legal_watch", "update"),
    perm(supabase, "legal_documents", "create"),
  ]);
  return {
    ok: true,
    data: {
      read: ws.isSuperAdmin || read,
      run: ws.isSuperAdmin || run,
      manage: ws.isSuperAdmin || manage,
      importDocs: (ws.isSuperAdmin || run) && (ws.isSuperAdmin || docs),
      isSuperAdmin: ws.isSuperAdmin,
      cronConfigured: Boolean(process.env.CRON_SECRET?.trim()),
    },
  };
}

export async function getLegalWatchWorkspace(): Promise<ActionResult<LegalWatchWorkspace>> {
  const supabase = await createClient();
  const [domains, keywords, sources, items, runs] = await Promise.all([
    supabase.from("ref_watch_domains").select("id, domain, label, is_active").order("domain"),
    supabase.from("ref_watch_keywords").select("id, keyword, is_active").order("keyword"),
    supabase
      .from("ref_watch_sources")
      .select("id, label, url, frequency, is_active, last_checked_at, last_status, last_error, consecutive_failures, baseline_done")
      .order("label"),
    supabase
      .from("ref_watch_items")
      .select(
        `id, source_id, url, title, first_seen_at, keywords, relevant, baseline, status, document_id, decided_at, ignore_reason,
         source:ref_watch_sources ( label ), decider:sys_users!decided_by ( full_name )`,
      )
      .order("first_seen_at", { ascending: false })
      .limit(400),
    supabase
      .from("ref_watch_runs")
      .select(
        `id, trigger, started_at, finished_at, status, sources_planned, sources_checked, sources_failed, items_new,
         items_relevant, note, starter:sys_users!started_by ( full_name ),
         checks:ref_watch_checks ( id, source_id, checked_at, status, http_status, error, links_found, items_new,
                                   items_relevant, source:ref_watch_sources ( label ) )`,
      )
      .order("started_at", { ascending: false })
      .limit(15),
  ]);
  const failed = [domains, keywords, sources, items, runs].find((r) => r.error);
  if (failed?.error) return { ok: false, error: failed.error.message };
  return {
    ok: true,
    data: {
      domains: parseWatchDomains(domains.data),
      keywords: parseWatchKeywords(keywords.data),
      sources: parseWatchSources(sources.data),
      items: parseWatchItems(items.data),
      runs: parseWatchRuns(runs.data),
    },
  };
}

/** Manual check under the user's session; the database refuses it without the right. */
export async function runLegalWatchNow(): Promise<ActionResult<WatchRunSummary>> {
  const supabase = await createClient();
  try {
    const summary = await runLegalWatch(supabase, "MANUAL");
    revalidateWatch();
    return { ok: true, data: summary };
  } catch (e) {
    revalidateWatch();
    return { ok: false, error: e instanceof Error ? e.message : "Vérification impossible." };
  }
}

export async function saveWatchDomain(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = watchDomainSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ref_watch_domain_save", {
    p_id: parsed.data.id,
    p_domain: parsed.data.domain,
    p_label: parsed.data.label,
    p_active: parsed.data.is_active,
  });
  revalidateWatch();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: String(data) } };
}

export async function saveWatchKeyword(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = watchKeywordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ref_watch_keyword_save", {
    p_id: parsed.data.id,
    p_keyword: parsed.data.keyword,
    p_active: parsed.data.is_active,
  });
  revalidateWatch();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: String(data) } };
}

export async function saveWatchSource(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = watchSourceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ref_watch_source_save", {
    p_id: parsed.data.id,
    p_label: parsed.data.label,
    p_url: parsed.data.url,
    p_frequency: parsed.data.frequency,
    p_active: parsed.data.is_active,
  });
  revalidateWatch();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: String(data) } };
}

const ignoreSchema = z.object({
  id: uuid,
  reason: z.string().trim().min(5, "Motif requis (5 caractères minimum).").max(300),
});

export async function ignoreWatchItem(input: unknown): Promise<ActionResult> {
  const parsed = ignoreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("ref_watch_item_ignore", { p_id: parsed.data.id, p_reason: parsed.data.reason });
  revalidateWatch();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

const importSchema = z.object({ id: uuid, meta: legalDocMetaSchema });

/**
 * The server downloads the detected link (allowed domain, internal addresses refused, 25 MB at most), checks that it
 * is a PDF or an image from its first bytes, stores it in the register bucket and records the entry with the
 * information completed by the user. Nothing else changes: the analysis and the approval stay human.
 */
export async function importWatchItem(input: unknown): Promise<ActionResult<{ document_id: string }>> {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { data: target, error: targetErr } = await supabase.rpc("ref_watch_item_prepare_import", { p_id: parsed.data.id });
  if (targetErr) return { ok: false, error: targetErr.message };
  const t = target as { url: string; domains: string[] };

  let body: Buffer;
  try {
    const file = await safeFetch(t.url, {
      domains: t.domains,
      maxBytes: LEGAL_DOC_MAX_BYTES,
      timeoutMs: 30_000,
      accept: "application/pdf,image/jpeg,image/png,image/webp;q=0.9,*/*;q=0.1",
    });
    body = file.body;
  } catch (e) {
    const text = e instanceof WatchFetchError ? e.message : "Téléchargement impossible.";
    return { ok: false, error: `${text} Vous pouvez aussi télécharger le texte vous-même puis l'importer depuis le registre.` };
  }
  const mime = sniffDocumentMime(body);
  if (!mime) {
    return {
      ok: false,
      error:
        "Ce lien ne mène pas à un fichier PDF ou image (page web ?) : ouvrez-le, téléchargez le texte, puis importez-le depuis le registre des documents juridiques.",
    };
  }
  const ext = EXT[mime];
  const path = `${crypto.randomUUID()}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from(LEGAL_DOC_BUCKET).upload(path, body, { contentType: mime, upsert: false });
  if (upErr) return { ok: false, error: `Enregistrement du fichier impossible : ${upErr.message}` };
  const sha256 = createHash("sha256").update(body).digest("hex");
  const { data, error } = await supabase.rpc("ref_watch_item_import", {
    p_id: parsed.data.id,
    p_path: path,
    p_name: fileNameFromUrl(t.url, ext),
    p_mime: mime,
    p_size: body.byteLength,
    p_sha256: sha256,
    p: legalDocRpcMeta(parsed.data.meta),
  });
  revalidateWatch();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { document_id: String(data) } };
}
