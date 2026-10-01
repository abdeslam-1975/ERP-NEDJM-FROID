import { hostAllowed, parseWatchUrl } from "@/lib/watch/net";

export type WatchLink = { url: string; title: string };

export const WATCH_MAX_LINKS = 500;
const MAX_HTML = 3 * 1024 * 1024;
const DOCUMENT_PATH_RE = /\.(pdf|docx?|jpe?g|png|webp)$/i;
const MIN_ARTICLE_TITLE = 20;

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
    }
    return NAMED[code.toLowerCase()] ?? all;
  });
}

function cleanText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/**
 * Links of a watched page that may point to a text: documents (PDF, Word, images) and article links with a real
 * title (menus and short labels are skipped). Only https links on an allowed domain are kept, without duplicates.
 */
export function extractLinks(html: string, pageUrl: string, domains: readonly string[]): WatchLink[] {
  const source = html.length > MAX_HTML ? html.slice(0, MAX_HTML) : html;
  const page = parseWatchUrl(pageUrl)?.url ?? null;
  const out = new Map<string, string>();
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) && out.size < WATCH_MAX_LINKS) {
    const attrs = m[1];
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(attrs);
    const rawHref = decodeEntities((href?.[1] ?? href?.[2] ?? href?.[3] ?? "").trim());
    if (!rawHref || /^(javascript|mailto|tel|data):/i.test(rawHref) || rawHref.startsWith("#")) continue;
    let absolute: string;
    try {
      absolute = new URL(rawHref, pageUrl).toString();
    } catch {
      continue;
    }
    const parsed = parseWatchUrl(absolute);
    if (!parsed || !hostAllowed(parsed.host, domains) || parsed.url === page) continue;
    const attrTitle = /\btitle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
    const title = (cleanText(m[2]) || cleanText(attrTitle?.[1] ?? attrTitle?.[2] ?? "")).slice(0, 500);
    const isDocument = DOCUMENT_PATH_RE.test(new URL(parsed.url).pathname);
    if (!isDocument && title.length < MIN_ARTICLE_TITLE) continue;
    const previous = out.get(parsed.url);
    if (previous === undefined || previous.length < title.length) out.set(parsed.url, title);
  }
  return [...out].map(([url, title]) => ({ url, title }));
}

/** Text of a fetched page with the charset announced by the server (UTF-8 otherwise). */
export function decodeBody(body: Uint8Array, contentType: string): string {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  try {
    return new TextDecoder(charset || "utf-8").decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}
