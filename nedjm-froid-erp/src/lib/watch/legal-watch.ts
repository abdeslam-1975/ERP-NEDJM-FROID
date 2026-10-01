import { z } from "zod";
import { normalizeDomain, parseWatchUrl } from "@/lib/watch/net";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const optionalId = z.string().regex(UUID_RE, "Identifiant invalide.").nullable();

export const WATCH_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type WatchFrequency = (typeof WATCH_FREQUENCIES)[number];
const FREQUENCY_LABELS: Record<WatchFrequency, string> = {
  DAILY: "Quotidienne",
  WEEKLY: "Hebdomadaire",
  MONTHLY: "Mensuelle",
};
export const watchFrequencyLabel = (v: string) => FREQUENCY_LABELS[v as WatchFrequency] ?? v;

export type WatchCheckStatus = "OK" | "UNCHANGED" | "ERROR";
const CHECK_LABELS: Record<WatchCheckStatus, string> = { OK: "Lue", UNCHANGED: "Inchangée", ERROR: "Erreur" };
export const watchCheckLabel = (v: string | null) => (v ? (CHECK_LABELS[v as WatchCheckStatus] ?? v) : "Jamais vérifiée");
export const watchCheckTone = (v: string | null): "success" | "neutral" | "danger" | "warning" =>
  v === "OK" ? "success" : v === "UNCHANGED" ? "neutral" : v === "ERROR" ? "danger" : "warning";

export type WatchItemStatus = "NEW" | "IMPORTED" | "IGNORED";
const ITEM_LABELS: Record<WatchItemStatus, string> = { NEW: "À examiner", IMPORTED: "Importé au registre", IGNORED: "Écarté" };
export const watchItemLabel = (v: string) => ITEM_LABELS[v as WatchItemStatus] ?? v;
export const watchItemTone = (v: string): "brand" | "success" | "neutral" =>
  v === "NEW" ? "brand" : v === "IMPORTED" ? "success" : "neutral";

export type WatchRunStatus = "RUNNING" | "DONE" | "FAILED";
const RUN_LABELS: Record<WatchRunStatus, string> = { RUNNING: "En cours", DONE: "Terminée", FAILED: "Interrompue" };
export const watchRunLabel = (v: string) => RUN_LABELS[v as WatchRunStatus] ?? v;
export const watchTriggerLabel = (v: string) => (v === "CRON" ? "Planifiée" : v === "MANUAL" ? "Manuelle" : v);

export const WATCH_NOTICE =
  "La veille aide à repérer les nouveaux textes ; elle ne garantit pas que tout texte publié est détecté et ne remplace pas la vérification juridique par une personne compétente. Un texte détecté n'a aucun effet : il faut l'importer au registre, l'analyser, puis faire approuver la valeur et décider de sa date d'application.";

export const WATCH_BASELINE_NOTICE =
  "La première lecture d'une page sert de référence : ses liens sont conservés (marqués « Référence ») sans notification. Seuls les liens apparus ensuite sont signalés comme nouveaux.";

/** Daily for an error, otherwise the source period (with the same margin as ref_watch_source_due). */
export function nextCheckAt(s: { frequency: string; last_checked_at: string | null; last_status: string | null }): Date | null {
  if (!s.last_checked_at) return null;
  const hours = s.last_status === "ERROR" || s.frequency === "DAILY" ? 20 : s.frequency === "WEEKLY" ? 164 : 27 * 24;
  return new Date(new Date(s.last_checked_at).getTime() + hours * 3600_000);
}

export type WatchDomain = { id: string; domain: string; label: string; is_active: boolean };
export type WatchKeyword = { id: string; keyword: string; is_active: boolean };
export type WatchSource = {
  id: string;
  label: string;
  url: string;
  frequency: WatchFrequency;
  is_active: boolean;
  last_checked_at: string | null;
  last_status: WatchCheckStatus | null;
  last_error: string | null;
  consecutive_failures: number;
  baseline_done: boolean;
};
export type WatchItem = {
  id: string;
  source_id: string;
  source_label: string;
  url: string;
  title: string | null;
  first_seen_at: string;
  keywords: string[];
  relevant: boolean;
  baseline: boolean;
  status: WatchItemStatus;
  document_id: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  ignore_reason: string | null;
};
export type WatchCheck = {
  id: string;
  source_id: string;
  source_label: string;
  checked_at: string;
  status: WatchCheckStatus;
  http_status: number | null;
  error: string | null;
  links_found: number;
  items_new: number;
  items_relevant: number;
};
export type WatchRun = {
  id: string;
  trigger: "CRON" | "MANUAL";
  started_by_name: string | null;
  started_at: string;
  finished_at: string | null;
  status: WatchRunStatus;
  sources_planned: number;
  sources_checked: number;
  sources_failed: number;
  items_new: number;
  items_relevant: number;
  note: string | null;
  checks: WatchCheck[];
};
export type WatchRunSummary = {
  run_id: string;
  status: string;
  planned: number;
  checked: number;
  failed: number;
  new: number;
  relevant: number;
  skipped: number;
};

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? null : String(v));
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const one = (v: unknown) => obj(Array.isArray(v) ? v[0] : v);
const nameOf = (v: unknown) => str(one(v)?.full_name);

export function parseWatchDomains(raw: unknown): WatchDomain[] {
  return (Array.isArray(raw) ? raw : []).flatMap((r) => {
    const o = obj(r);
    return o ? [{ id: String(o.id), domain: String(o.domain), label: String(o.label ?? ""), is_active: o.is_active === true }] : [];
  });
}

export function parseWatchKeywords(raw: unknown): WatchKeyword[] {
  return (Array.isArray(raw) ? raw : []).flatMap((r) => {
    const o = obj(r);
    return o ? [{ id: String(o.id), keyword: String(o.keyword), is_active: o.is_active === true }] : [];
  });
}

export function parseWatchSources(raw: unknown): WatchSource[] {
  return (Array.isArray(raw) ? raw : []).flatMap((r) => {
    const o = obj(r);
    if (!o) return [];
    const freq = (WATCH_FREQUENCIES as readonly string[]).includes(String(o.frequency)) ? (o.frequency as WatchFrequency) : "WEEKLY";
    return [
      {
        id: String(o.id),
        label: String(o.label ?? ""),
        url: String(o.url ?? ""),
        frequency: freq,
        is_active: o.is_active === true,
        last_checked_at: str(o.last_checked_at),
        last_status: (str(o.last_status) as WatchCheckStatus | null) ?? null,
        last_error: str(o.last_error),
        consecutive_failures: num(o.consecutive_failures),
        baseline_done: o.baseline_done === true,
      },
    ];
  });
}

export function parseWatchItems(raw: unknown): WatchItem[] {
  return (Array.isArray(raw) ? raw : []).flatMap((r) => {
    const o = obj(r);
    if (!o) return [];
    return [
      {
        id: String(o.id),
        source_id: String(o.source_id),
        source_label: str(one(o.source)?.label) ?? "",
        url: String(o.url ?? ""),
        title: str(o.title),
        first_seen_at: String(o.first_seen_at ?? ""),
        keywords: Array.isArray(o.keywords) ? o.keywords.map(String) : [],
        relevant: o.relevant === true,
        baseline: o.baseline === true,
        status: (["NEW", "IMPORTED", "IGNORED"].includes(String(o.status)) ? o.status : "NEW") as WatchItemStatus,
        document_id: str(o.document_id),
        decided_by_name: nameOf(o.decider),
        decided_at: str(o.decided_at),
        ignore_reason: str(o.ignore_reason),
      },
    ];
  });
}

export function parseWatchRuns(raw: unknown): WatchRun[] {
  return (Array.isArray(raw) ? raw : []).flatMap((r) => {
    const o = obj(r);
    if (!o) return [];
    const checks = (Array.isArray(o.checks) ? o.checks : []).flatMap((c) => {
      const k = obj(c);
      if (!k) return [];
      return [
        {
          id: String(k.id),
          source_id: String(k.source_id),
          source_label: str(one(k.source)?.label) ?? "",
          checked_at: String(k.checked_at ?? ""),
          status: String(k.status) as WatchCheckStatus,
          http_status: k.http_status == null ? null : num(k.http_status),
          error: str(k.error),
          links_found: num(k.links_found),
          items_new: num(k.items_new),
          items_relevant: num(k.items_relevant),
        },
      ];
    });
    checks.sort((a, b) => a.checked_at.localeCompare(b.checked_at));
    return [
      {
        id: String(o.id),
        trigger: o.trigger === "CRON" ? "CRON" : "MANUAL",
        started_by_name: nameOf(o.starter),
        started_at: String(o.started_at ?? ""),
        finished_at: str(o.finished_at),
        status: String(o.status) as WatchRunStatus,
        sources_planned: num(o.sources_planned),
        sources_checked: num(o.sources_checked),
        sources_failed: num(o.sources_failed),
        items_new: num(o.items_new),
        items_relevant: num(o.items_relevant),
        note: str(o.note),
        checks,
      },
    ];
  });
}

export const watchDomainSchema = z.object({
  id: optionalId,
  domain: z
    .string()
    .trim()
    .transform((v) => v.toLowerCase())
    .refine((v) => normalizeDomain(v) !== null, "Domaine invalide : nom de domaine seul, sans https:// ni chemin (ex. joradp.dz)."),
  label: z.string().trim().min(2, "Libellé requis (2 caractères minimum).").max(120),
  is_active: z.boolean(),
});

export const watchKeywordSchema = z.object({
  id: optionalId,
  keyword: z.string().trim().min(2, "Mot-clé requis (2 caractères minimum).").max(80),
  is_active: z.boolean(),
});

export const watchSourceSchema = z.object({
  id: optionalId,
  label: z.string().trim().min(3, "Libellé requis (3 caractères minimum).").max(120),
  url: z
    .string()
    .trim()
    .max(500, "Adresse trop longue (500 caractères au plus).")
    .refine((v) => parseWatchUrl(v) !== null, "Adresse invalide : https:// suivi d'un nom de domaine (pas d'adresse IP, de port ni d'identifiants)."),
  frequency: z.enum(WATCH_FREQUENCIES),
  is_active: z.boolean(),
});

/** File name proposed for an imported link: last path segment, or a neutral name. */
export function fileNameFromUrl(url: string, ext: string): string {
  let last = "";
  try {
    last = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
  } catch {
    last = "";
  }
  last = last.replace(/[^\p{L}\p{N}._ -]+/gu, "_").trim();
  if (!last || last.length > 200) return `document.${ext}`;
  return last.toLowerCase().endsWith(`.${ext}`) ? last : `${last.slice(0, 190)}.${ext}`;
}
