import { normalizeWilaya } from "@/lib/hr/compliance";
import { WILAYAS } from "@/lib/referentiels/wilayas";

export function wilayaName(code: string | null | undefined): string | null {
  if (!code) return null;
  return WILAYAS.find((w) => w.code === code)?.name ?? null;
}

/** Coded wilaya matching a free-text value ("Alger", "16", "16 - Alger"); null when ambiguous or unknown. */
export function suggestWilayaCode(text: string | null | undefined): string | null {
  const key = normalizeWilaya(text);
  if (!key) return null;
  const m = /^(\d{1,2})(?:\s+(.*))?$/.exec(key);
  if (m) {
    const code = m[1].padStart(2, "0");
    const hit = WILAYAS.find((w) => w.code === code);
    if (!hit) return null;
    if (m[2] && normalizeWilaya(hit.name) !== m[2]) return null;
    return code;
  }
  return WILAYAS.find((w) => normalizeWilaya(w.name) === key)?.code ?? null;
}
