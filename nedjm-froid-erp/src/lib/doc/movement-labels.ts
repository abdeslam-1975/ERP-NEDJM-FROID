import type { HTMLElement } from "node-html-parser";

/** Codes counted as worked days in the « Travaillés » cell. */
const WORKED_CODES = ["P", "MS", "NVR", "HP", "CH"];
const REST_CODES = ["W", "JF"];

/**
 * Exact days per legend code: a full code counts 1, a half code (`AN/2`) 0.5, and a combined code
 * (`MS/2-AN/2`) gives each part its share. `TRAVAILLES`, `REPOS` and `ABANDON` fall back to the
 * movement totals when the month has no day codes.
 */
export function movementCounts(m: {
  days_by_code?: Record<string, number> | null;
  days_worked?: number;
  days_weekend?: number;
  days_abandon?: number;
}): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [raw, qty] of Object.entries(m.days_by_code ?? {})) {
    const n = Number(qty);
    if (!Number.isFinite(n) || !n) continue;
    for (const part of raw.toUpperCase().split("-")) {
      const p = part.trim();
      const half = p.endsWith("/2");
      for (const code of half ? [p.slice(0, -2)] : p.split("/")) {
        if (code) out[code] = (out[code] ?? 0) + n * (half ? 0.5 : 1);
      }
    }
  }
  const coded = Object.keys(out).length > 0;
  const sum = (codes: string[]) => codes.reduce((s, c) => s + (out[c] ?? 0), 0);
  out.TRAVAILLES = coded ? sum(WORKED_CODES) : Number(m.days_worked ?? 0);
  out.REPOS = coded ? sum(REST_CODES) : Number(m.days_weekend ?? 0);
  out.ABANDON = coded ? (out.AP ?? 0) : Number(m.days_abandon ?? 0);
  return out;
}

function normalize(label: string) {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/absense/g, "absence")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w.length > 3 ? w.replace(/[sx]$/, "") : w))
    .join(" ");
}

const RULES: [RegExp, string][] = [
  [/\b(non justifiee?|injustifiee?)\b/, "comptes.AN"],
  [/\babsence\b.*\bjustifiee?\b/, "comptes.AJ"],
  [/\babsence\b.*\bautoris/, "comptes.AOP"],
  [/\bdece\b/, "comptes.DC"],
  [/\bmaladie\b/, "comptes.CM"],
  [/\bsans solde\b/, "comptes.CSS"],
  [/\bannuel/, "comptes.CA"],
  [/\bweek ?end\b|\bferiee?\b/, "comptes.REPOS"],
  [/\btravaille/, "comptes.TRAVAILLES"],
  [/\bmission\b/, "comptes.MS"],
  [/\bpresent/, "comptes.P"],
  [/\babandon/, "comptes.ABANDON"],
  [/\bgreve illegale\b/, "comptes.GIL"],
  [/\bgreve\b/, "comptes.GL"],
  [/\bnouveau recrut/, "comptes.NVR"],
  [/\bchangement de poste\b/, "comptes.HP"],
  [/\bchangement de chantier\b/, "comptes.CH"],
  [/\bdemission\b/, "comptes.DM"],
  [/\bfin du contrat\b/, "comptes.FC"],
  [/\brappel\b/, "days_rappel"],
  [/^conge$/, "days_leave"],
  [/^absence$/, "days_absence"],
];

/**
 * Day count printed beside a movements label, read from the label text (accents, plurals and the usual
 * « absense » typo ignored). `null`: a day label this resolver cannot count, so its cell stays empty.
 */
export function movementFieldForLabel(label: string): string | null | undefined {
  const quoted = /["«“(]\s*([A-Za-z0-9/]{1,8})\s*["»”)]/.exec(label)?.[1]?.toUpperCase();
  const n = normalize(label);
  if (!n) return undefined;
  if (/\brecuperation\b/.test(n)) return !quoted || quoted === "CRP" ? "comptes.CRP" : null;
  for (const [re, field] of RULES) if (re.test(n)) return field;
  return quoted && /^[A-Z]{1,4}$/.test(quoted) ? `comptes.${quoted}` : undefined;
}

const DAY_FIELD = /(^|[^\w.])(days_\w+|jours\.|comptes\.)/;

/**
 * In a « Mouvements » table, every count cell follows the label just before it, wherever the label was
 * moved or renamed in the editor. Other cells (charges…) are left as written.
 */
export function bindMovementLabels(root: HTMLElement) {
  for (const table of root.querySelectorAll("table")) {
    const head = table.querySelector("thead")?.text ?? table.querySelector("tr")?.text ?? "";
    if (!/mouvements/i.test(head)) continue;
    for (const row of table.querySelectorAll("tbody tr")) {
      const cells = row.childNodes.filter((c): c is HTMLElement => (c as HTMLElement).tagName === "TD");
      for (let i = 0; i < cells.length - 1; i += 1) {
        const label = cells[i];
        const value = cells[i + 1];
        const text = label.text.replace(/\u00a0/g, " ").trim();
        if (!text || label.hasAttribute("data-field")) continue;
        const current = value.getAttribute("data-field");
        if (!current && value.text.trim()) continue;
        const field = movementFieldForLabel(text);
        if (field) {
          value.setAttribute("data-field", field);
          if (!value.getAttribute("data-format")) value.setAttribute("data-format", "days");
        } else if (current && DAY_FIELD.test(current)) {
          value.removeAttribute("data-field");
          value.removeAttribute("data-format");
        }
        i += 1;
      }
    }
  }
}
