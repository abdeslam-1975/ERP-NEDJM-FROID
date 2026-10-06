/** HR letters (attestation, certificat, solde de tout compte, mises en demeure, titre de congé). */

import { parse } from "node-html-parser";
import { renderTemplate, type DocData } from "@/lib/doc/engine";
import type { HrCompanyProfile } from "@/lib/hr/company-profile";
import { arabicAmountWords } from "@/lib/hr/work-contract";

export type LetterKind = "ATTEST" | "CERTIF" | "STC" | "MED1" | "MED2" | "LEAVE";
export type LetterLang = "fr" | "ar";

export const LETTER_KINDS: { code: LetterKind; fr: string; ar: string }[] = [
  { code: "ATTEST", fr: "Attestation de travail", ar: "إفادة عمل" },
  { code: "CERTIF", fr: "Certificat de travail", ar: "شهادة عمل" },
  { code: "STC", fr: "Reçu pour solde de tout compte", ar: "وصل تصفية كل حساب" },
  { code: "MED1", fr: "Mise en demeure (1ère)", ar: "إعذار أول" },
  { code: "MED2", fr: "Mise en demeure (2ème et dernière)", ar: "إعذار ثانٍ وأخير" },
  { code: "LEAVE", fr: "Titre de congé", ar: "سند عطلة" },
];

export function letterKindLabel(code: string) {
  return LETTER_KINDS.find((k) => k.code === code) ?? { code, fr: code, ar: code };
}

export type LetterLine = { label_fr: string; label_ar: string; amount: number };

export type LetterValues = {
  kind: LetterKind;
  lang: LetterLang;
  numero: string;
  sex: "M" | "F";
  nom_fr: string;
  nom_ar: string;
  matricule: string;
  birth_date: string;
  birth_place_fr: string;
  birth_place_ar: string;
  address_fr: string;
  address_ar: string;
  poste_fr: string;
  poste_ar: string;
  start_date: string;
  end_date: string;
  leave_kind_fr: string;
  leave_kind_ar: string;
  leave_from: string;
  leave_to: string;
  leave_days: string;
  leave_return: string;
  leave_balance: string;
  absence_since: string;
  delai: string;
  ref_numero: string;
  ref_date: string;
  amount: string;
  lines: LetterLine[];
  date_doc: string;
  /** Paragraphs typed by the user; replaces the generated body when set. */
  body: string;
};

export function emptyLetterValues(kind: LetterKind, lang: LetterLang = "fr"): LetterValues {
  return {
    kind,
    lang,
    numero: "",
    sex: "M",
    nom_fr: "",
    nom_ar: "",
    matricule: "",
    birth_date: "",
    birth_place_fr: "",
    birth_place_ar: "",
    address_fr: "",
    address_ar: "",
    poste_fr: "",
    poste_ar: "",
    start_date: "",
    end_date: "",
    leave_kind_fr: "",
    leave_kind_ar: "",
    leave_from: "",
    leave_to: "",
    leave_days: "",
    leave_return: "",
    leave_balance: "",
    absence_since: "",
    delai: "08",
    ref_numero: "",
    ref_date: "",
    amount: "",
    lines: [],
    date_doc: "",
    body: "",
  };
}

/** Keeps only known keys with the right types (payload read back from the DB). */
export function normalizeLetterValues(raw: unknown, kind: LetterKind): LetterValues {
  const base = emptyLetterValues(kind);
  if (!raw || typeof raw !== "object") return base;
  const src = raw as Record<string, unknown>;
  const out: LetterValues = { ...base };
  for (const key of Object.keys(base) as (keyof LetterValues)[]) {
    const v = src[key];
    if (key === "lines") {
      out.lines = Array.isArray(v)
        ? v
            .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
            .map((l) => ({
              label_fr: String(l.label_fr ?? ""),
              label_ar: String(l.label_ar ?? ""),
              amount: Number(l.amount) || 0,
            }))
        : [];
    } else if (key === "lang") {
      out.lang = v === "ar" ? "ar" : "fr";
    } else if (key === "sex") {
      out.sex = v === "F" ? "F" : "M";
    } else if (key === "kind") {
      out.kind = kind;
    } else if (typeof v === "string" || typeof v === "number") {
      (out as Record<string, unknown>)[key] = String(v);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function slashDateIso(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso ?? "");
}

export function formatAmount(n: number) {
  const fixed = (Math.round(n * 100) / 100).toFixed(2);
  const [int, dec] = fixed.split(".");
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${dec}`;
}

const FR_UNITS = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix",
  "onze", "douze", "treize", "quatorze", "quinze", "seize",
];
const FR_TENS = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante"];

function frBelow100(n: number, final: boolean): string {
  if (n < 17) return FR_UNITS[n];
  if (n < 20) return `dix-${FR_UNITS[n - 10]}`;
  const t = Math.floor(n / 10);
  const u = n % 10;
  if (t === 7) return n === 71 ? "soixante et onze" : `soixante-${frBelow100(n - 60, final)}`;
  if (t === 9) return `quatre-vingt-${frBelow100(n - 80, final)}`;
  if (t === 8) return u === 0 ? (final ? "quatre-vingts" : "quatre-vingt") : `quatre-vingt-${FR_UNITS[u]}`;
  if (u === 0) return FR_TENS[t];
  if (u === 1) return `${FR_TENS[t]} et un`;
  return `${FR_TENS[t]}-${FR_UNITS[u]}`;
}

function frBelow1000(n: number, final: boolean): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(h === 1 ? "cent" : `${FR_UNITS[h]} ${r === 0 && final ? "cents" : "cent"}`);
  if (r) parts.push(frBelow100(r, final));
  return parts.join(" ");
}

/** French cardinal (orthographe traditionnelle), up to 999 999 999 999. */
export function frenchNumberWords(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return "zéro";
  const milliards = Math.floor(n / 1e9);
  const millions = Math.floor(n / 1e6) % 1000;
  const milliers = Math.floor(n / 1000) % 1000;
  const rest = n % 1000;
  const parts: string[] = [];
  if (milliards) parts.push(`${frBelow1000(milliards, true)} ${milliards > 1 ? "milliards" : "milliard"}`);
  if (millions) parts.push(`${frBelow1000(millions, true)} ${millions > 1 ? "millions" : "million"}`);
  if (milliers) parts.push(milliers === 1 ? "mille" : `${frBelow1000(milliers, false)} mille`);
  if (rest) parts.push(frBelow1000(rest, true));
  return parts.join(" ");
}

export function frenchAmountWords(value: number): string {
  const abs = Math.abs(Math.round(value * 100) / 100);
  const dinars = Math.floor(abs);
  const cents = Math.round((abs - dinars) * 100);
  let out = `${frenchNumberWords(dinars)} ${dinars > 1 ? "dinars algériens" : "dinar algérien"}`;
  if (cents) out += ` et ${frenchNumberWords(cents)} ${cents > 1 ? "centimes" : "centime"}`;
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export function parseAmount(raw: string): number {
  const n = Number(String(raw ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Printed document: one template per kind and language (Paramètres RH › Documents)
// ---------------------------------------------------------------------------

export type LetterDocType = `lettre_${Lowercase<LetterKind>}_${LetterLang}`;

export function letterDocType(kind: LetterKind, lang: LetterLang): LetterDocType {
  return `lettre_${kind.toLowerCase() as Lowercase<LetterKind>}_${lang}`;
}

/** Paragraphs typed by the user (blank line between paragraphs). */
export function letterBodyParagraphs(body: string): string[] {
  return (body ?? "")
    .trim()
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Values printed by the letter templates; empty values print as dotted blanks. */
export function letterDocData(v: LetterValues, company: HrCompanyProfile, letterheadUrl: string): DocData {
  const f = v.sex === "F";
  const ar = v.lang === "ar";
  const amount = parseAmount(v.amount);
  const val = (frV: string, arV: string) => (ar ? arV || frV : frV || arV) || "……………";
  const date = (iso: string) => slashDateIso(iso) || "……………";
  return {
    letterhead: letterheadUrl,
    company,
    numero: v.numero || "……",
    numero_raw: v.numero,
    matricule: v.matricule,
    matricule_txt: v.matricule || "……",
    date_doc: slashDateIso(v.date_doc),
    civ: ar ? (f ? "السيدة" : "السيد") : f ? "Madame" : "Monsieur",
    civ_short: f ? "Mme" : "M.",
    nom: val(v.nom_fr, v.nom_ar),
    birth_date: date(v.birth_date),
    birth_place: val(v.birth_place_fr, v.birth_place_ar),
    poste: val(v.poste_fr, v.poste_ar),
    recipient_address: ar ? v.address_ar || v.address_fr : v.address_fr || v.address_ar,
    start: date(v.start_date),
    end: date(v.end_date),
    leave_kind: val(v.leave_kind_fr, v.leave_kind_ar),
    from: date(v.leave_from),
    to: date(v.leave_to),
    days: v.leave_days || "……",
    reprise: date(v.leave_return),
    leave_balance: v.leave_balance,
    since: date(v.absence_since),
    delai: v.delai || "08",
    ref: v.ref_numero || "……………",
    ref_date: date(v.ref_date),
    amount: formatAmount(amount),
    amount_words: ar ? arabicAmountWords(amount) : frenchAmountWords(amount),
    lines: v.lines.map((l) => ({
      label: ar ? l.label_ar || l.label_fr : l.label_fr || l.label_ar,
      amount: formatAmount(l.amount),
    })),
    custom_body: letterBodyParagraphs(v.body),
    e: f ? "e" : "",
    ne: f ? "née" : "né",
    il: f ? "Elle" : "Il",
    a_ne: f ? "المولودة" : "المولود",
    a_works: f ? "تعمل" : "يعمل",
    a_worked: f ? "عملت" : "عمل",
    a_left: f ? "غادرت" : "غادر",
    a_free: f ? "حرةً" : "حراً",
    a_concerned: f ? "المعنية" : "المعني",
    a_signed: f ? "الموقعة" : "الموقع",
    a_who: f ? "التي شغلت" : "الذي شغل",
    a_her: f ? "ها" : "ه",
    a_join: f ? "تلتحقي" : "تلتحق",
  };
}

/** Paragraphs of the template's standard text (marked `data-letter-body`), to start a free text from. */
export function defaultLetterBody(template: string, data: DocData): string[] {
  const html = renderTemplate(template, { ...data, custom_body: [] }, { design: true });
  return parse(html)
    .querySelectorAll("[data-letter-body] p")
    .map((p) => p.text.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

