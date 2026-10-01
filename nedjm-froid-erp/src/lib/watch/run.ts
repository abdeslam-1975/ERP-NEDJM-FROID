import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decodeBody, extractLinks } from "@/lib/watch/links";
import type { WatchRunSummary } from "@/lib/watch/legal-watch";
import { WatchFetchError, safeFetch } from "@/lib/watch/safe-fetch";

const PAGE_MAX_BYTES = 3 * 1024 * 1024;
const PAGE_TIMEOUT_MS = 15_000;
const PAGE_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5";

type StartSource = { id: string; label: string; url: string; last_content_hash: string | null; allowed: boolean };
type StartResult = { run_id: string; sources: StartSource[]; domains: string[] };

function errorText(e: unknown): string {
  const text = e instanceof WatchFetchError || e instanceof Error ? e.message : String(e);
  return text.replace(/\s+/g, " ").slice(0, 500) || "Erreur inconnue.";
}

/**
 * One check of the watched pages: manual (user session) or scheduled (service role). Each page is read on its allowed
 * domain only; new links are recorded as detected texts by the database, which decides what is new and relevant.
 * Pages left when the time budget runs out stay due for the next check.
 */
export async function runLegalWatch(
  client: SupabaseClient,
  trigger: "CRON" | "MANUAL",
  budgetMs = 45_000,
): Promise<WatchRunSummary> {
  const t0 = Date.now();
  const { data: started, error: startErr } = await client.rpc("ref_watch_run_start", { p_trigger: trigger });
  if (startErr) throw new Error(startErr.message);
  const run = started as StartResult;
  try {
    return await checkSources(client, run, t0, budgetMs);
  } catch (e) {
    // A run left RUNNING blocks every new check until it goes stale; close it, pages not recorded stay due.
    await client.rpc("ref_watch_run_finish", { p_run: run.run_id, p_note: `Interrompue : ${errorText(e)}` });
    throw e;
  }
}

async function checkSources(client: SupabaseClient, run: StartResult, t0: number, budgetMs: number): Promise<WatchRunSummary> {
  let skipped = 0;

  for (const s of run.sources ?? []) {
    if (Date.now() - t0 > budgetMs) {
      skipped++;
      continue;
    }
    let args: { p_status: string; p_http_status: number | null; p_error: string | null; p_content_hash: string | null; p_links: unknown };
    if (!s.allowed) {
      args = { p_status: "ERROR", p_http_status: null, p_error: "Domaine de la source retiré de la liste des domaines autorisés.", p_content_hash: null, p_links: [] };
    } else {
      try {
        const page = await safeFetch(s.url, {
          domains: run.domains,
          maxBytes: PAGE_MAX_BYTES,
          timeoutMs: Math.min(PAGE_TIMEOUT_MS, Math.max(1_000, budgetMs - (Date.now() - t0))),
          accept: PAGE_ACCEPT,
        });
        const hash = createHash("sha256").update(page.body).digest("hex");
        if (hash === s.last_content_hash) {
          args = { p_status: "UNCHANGED", p_http_status: page.status, p_error: null, p_content_hash: hash, p_links: [] };
        } else {
          const links = extractLinks(decodeBody(page.body, page.contentType), page.url, run.domains);
          args = { p_status: "OK", p_http_status: page.status, p_error: null, p_content_hash: hash, p_links: links };
        }
      } catch (e) {
        args = {
          p_status: "ERROR",
          p_http_status: e instanceof WatchFetchError ? e.httpStatus : null,
          p_error: errorText(e),
          p_content_hash: null,
          p_links: [],
        };
      }
    }
    const { error } = await client.rpc("ref_watch_record_check", { p_run: run.run_id, p_source: s.id, ...args });
    if (error) throw new Error(error.message);
  }

  const { data: finished, error: finishErr } = await client.rpc("ref_watch_run_finish", {
    p_run: run.run_id,
    p_note: skipped ? `${skipped} source(s) reportée(s) à la prochaine vérification (temps d'exécution limité).` : null,
  });
  if (finishErr) throw new Error(finishErr.message);
  return { ...(finished as Omit<WatchRunSummary, "skipped">), skipped };
}
