import { lookup } from "node:dns";
import https from "node:https";
import { hostAllowed, isPublicAddress, parseWatchUrl } from "@/lib/watch/net";

export class WatchFetchError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number | null = null,
  ) {
    super(message);
  }
}

export type SafeFetchResult = { url: string; status: number; contentType: string; body: Buffer };

type SafeFetchOptions = {
  domains: readonly string[];
  maxBytes: number;
  timeoutMs: number;
  accept: string;
  maxRedirects?: number;
};

const USER_AGENT = "NedjmFroidERP-VeilleJuridique/1.0";

type LookupFn = NonNullable<https.RequestOptions["lookup"]>;

/** Resolution checked at connection time, so a DNS answer cannot point the request to an internal address. */
const guardedLookup = ((hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
  lookup(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err);
    if (!addresses.length) return callback(new WatchFetchError(`Nom de domaine introuvable : ${hostname}.`));
    if (addresses.some((a) => !isPublicAddress(a.address))) {
      return callback(new WatchFetchError(`Adresse interne refusée pour ${hostname}.`));
    }
    if (options?.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
}) as unknown as LookupFn;

function requestOnce(url: string, opts: SafeFetchOptions, deadline: number) {
  return new Promise<{ status: number; location: string | null; contentType: string; body: Buffer }>((resolve, reject) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(new WatchFetchError("Délai de lecture dépassé."));
    const req = https.get(
      url,
      {
        lookup: guardedLookup,
        headers: { "user-agent": USER_AGENT, accept: opts.accept, "accept-encoding": "identity" },
        timeout: remaining,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = typeof res.headers.location === "string" ? res.headers.location : null;
        const contentType = String(res.headers["content-type"] ?? "");
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location, contentType, body: Buffer.alloc(0) });
        }
        if (status !== 200) {
          res.resume();
          return reject(new WatchFetchError(`Réponse du site : HTTP ${status}.`, status));
        }
        const declared = Number(res.headers["content-length"] ?? 0);
        if (declared > opts.maxBytes) {
          res.destroy();
          return reject(new WatchFetchError("Contenu trop volumineux.", status));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > opts.maxBytes) {
            res.destroy();
            reject(new WatchFetchError("Contenu trop volumineux.", status));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ status, location, contentType, body: Buffer.concat(chunks) }));
        res.on("error", (e) => reject(new WatchFetchError(`Lecture interrompue : ${e.message}`, status)));
      },
    );
    const timer = setTimeout(() => req.destroy(new WatchFetchError("Délai de lecture dépassé.")), remaining);
    req.on("close", () => clearTimeout(timer));
    req.on("timeout", () => req.destroy(new WatchFetchError("Délai de lecture dépassé.")));
    req.on("error", (e) => reject(e instanceof WatchFetchError ? e : new WatchFetchError(`Site injoignable : ${e.message}`)));
  });
}

/**
 * GET over https on an allowed domain only. Every redirect is checked again, internal addresses are refused at
 * connection time, and the size and duration are bounded.
 */
export async function safeFetch(rawUrl: string, opts: SafeFetchOptions): Promise<SafeFetchResult> {
  const deadline = Date.now() + opts.timeoutMs;
  let current = rawUrl;
  for (let hop = 0; hop <= (opts.maxRedirects ?? 3); hop++) {
    const parsed = parseWatchUrl(current);
    if (!parsed) throw new WatchFetchError("Adresse refusée : https:// et nom de domaine uniquement.");
    if (!hostAllowed(parsed.host, opts.domains)) throw new WatchFetchError(`Domaine non autorisé : ${parsed.host}.`);
    const res = await requestOnce(parsed.url, opts, deadline);
    if (res.status >= 300 && res.status < 400) {
      if (!res.location) throw new WatchFetchError(`Redirection sans adresse (HTTP ${res.status}).`, res.status);
      current = new URL(res.location, parsed.url).toString();
      continue;
    }
    return { url: parsed.url, status: res.status, contentType: res.contentType, body: res.body };
  }
  throw new WatchFetchError("Trop de redirections.");
}
