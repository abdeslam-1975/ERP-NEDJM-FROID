/** Address checks of the legal watch: only https pages on allowed domains, never an internal address (SSRF). */

const HOST_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

export type WatchUrl = { url: string; host: string };

/** Keep in sync with ref_watch_host() in the lot 8 migration. */
export function parseWatchUrl(raw: string): WatchUrl | null {
  const text = (raw ?? "").trim();
  if (!text || text.length > 1000 || /\s/.test(text)) return null;
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  if (u.port && u.port !== "443") return null;
  const host = u.hostname.toLowerCase();
  if (!HOST_RE.test(host) || /^[0-9.]+$/.test(host)) return null;
  u.hash = "";
  return { url: u.toString(), host };
}

export function normalizeDomain(raw: string): string | null {
  const d = (raw ?? "").trim().toLowerCase();
  return d.length <= 200 && HOST_RE.test(d) ? d : null;
}

export function hostAllowed(host: string, domains: readonly string[]): boolean {
  const h = host.toLowerCase();
  return domains.some((d) => h === d || h.endsWith(`.${d}`));
}

function ipv4Parts(ip: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p <= 255) ? parts : null;
}

function publicIpv4([a, b, c]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

/** True only for a public unicast address; anything unparsable is refused. */
export function isPublicAddress(ip: string): boolean {
  const v4 = ipv4Parts(ip);
  if (v4) return publicIpv4(v4);
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (!v6.includes(":") || !/^[0-9a-f:.]+$/.test(v6)) return false;
  const mapped = /^(?:0*:)*:?ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(v6) ?? /^::(\d{1,3}(?:\.\d{1,3}){3})$/.exec(v6);
  if (mapped) {
    const p = ipv4Parts(mapped[1]);
    return p ? publicIpv4(p) : false;
  }
  if (v6 === "::" || v6 === "::1" || v6.startsWith("::")) return false;
  const first = parseInt(v6.split(":")[0] || "0", 16);
  if (Number.isNaN(first)) return false;
  if ((first & 0xfe00) === 0xfc00) return false;
  if ((first & 0xffc0) === 0xfe80) return false;
  if ((first & 0xff00) === 0xff00) return false;
  if (v6.startsWith("2001:db8:") || v6.startsWith("64:ff9b:")) return false;
  return true;
}

const startsWith = (b: Uint8Array, bytes: number[], offset = 0) =>
  b.length >= offset + bytes.length && bytes.every((v, i) => b[offset + i] === v);

/** File type from its first bytes (the type announced by the site is not trusted). */
export function sniffDocumentMime(b: Uint8Array): "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | null {
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}
