/** Work contract (عقد عمل) printing: pre-filled values, template data and Arabic formatting. */

import { parse } from "node-html-parser";
import type { DocData } from "@/lib/doc/engine";
import type { HrCompanyProfile } from "@/lib/hr/company-profile";
import type { ContractTypeDefaults } from "@/lib/hr/hr-lists";

export type ContractPrintValues = {
  numero: string;
  is_cdi: boolean;
  nom: string;
  matricule: string;
  birth_date: string;
  birth_place: string;
  father: string;
  mother: string;
  marital: string;
  id_piece: string;
  id_number: string;
  id_issued_on: string;
  id_issued_by: string;
  address: string;
  poste: string;
  start_date: string;
  end_date: string;
  cdd_reason: number;
  essai: string;
  preavis: string;
  net: string;
  recup: string;
  retenue: string;
};

export const CONTRACT_PRINT_KEYS = [
  "nom",
  "matricule",
  "birth_date",
  "birth_place",
  "father",
  "mother",
  "marital",
  "id_piece",
  "id_number",
  "id_issued_on",
  "id_issued_by",
  "address",
  "poste",
  "essai",
  "preavis",
  "net",
  "recup",
  "retenue",
] as const satisfies readonly (keyof ContractPrintValues)[];

export type ContractPrintSource = {
  contract_number: string | null;
  contract_type_code: string | null;
  poste_ar: string | null;
  poste_fr: string | null;
  start_date: string;
  end_date: string | null;
  salaire_net_ref_monthly: number | null;
  salaire_net_recup_monthly: number | null;
  print_data: Record<string, unknown>;
  employee: {
    matricule: string;
    last_name: string;
    first_name: string;
    last_name_ar: string | null;
    first_name_ar: string | null;
    birth_date: string | null;
    birth_place_ar: string | null;
    birth_place_fr: string | null;
    father_name: string | null;
    mother_name: string | null;
    marital_label_ar: string | null;
    id_type_code: string | null;
    id_number: string | null;
    id_issued_on: string | null;
    id_issued_by: string | null;
    address_ar: string | null;
    address_fr: string | null;
  };
};

const ID_PIECE_AR: Record<string, string> = {
  CNI: "ب.ت.و",
  PASSPORT: "جواز السفر",
  PERMIS: "رخصة السياقة",
};

function clean(v: string | null | undefined) {
  return (v ?? "").trim();
}

function amountText(n: number | null | undefined) {
  return n == null || !Number.isFinite(Number(n)) || Number(n) === 0 ? "" : String(Number(n));
}

/**
 * Fields pre-filled from the contract, its type (Paramètres RH › Listes et codes: CDI flag, essai,
 * préavis, motif du CDD) and the employee file; values saved at the last print win.
 */
export function contractPrintDefaults(src: ContractPrintSource, type: ContractTypeDefaults): ContractPrintValues {
  const e = src.employee;
  const nameAr = [clean(e.last_name_ar), clean(e.first_name_ar)].filter(Boolean).join(" ");
  const base: ContractPrintValues = {
    numero: clean(src.contract_number),
    is_cdi: type.cdi,
    nom: nameAr || `${clean(e.last_name)} ${clean(e.first_name)}`.trim(),
    matricule: clean(e.matricule),
    birth_date: clean(e.birth_date),
    birth_place: clean(e.birth_place_ar) || clean(e.birth_place_fr),
    father: clean(e.father_name),
    mother: clean(e.mother_name),
    marital: clean(e.marital_label_ar),
    id_piece: ID_PIECE_AR[(e.id_type_code ?? "").toUpperCase()] ?? "ب.ت.و",
    id_number: clean(e.id_number),
    id_issued_on: clean(e.id_issued_on),
    id_issued_by: clean(e.id_issued_by),
    address: clean(e.address_ar) || clean(e.address_fr),
    poste: clean(src.poste_ar) || clean(src.poste_fr),
    start_date: src.start_date.slice(0, 10),
    end_date: src.end_date ? src.end_date.slice(0, 10) : "",
    cdd_reason: type.cdd_reason,
    essai: type.essai,
    preavis: type.preavis,
    net: amountText(src.salaire_net_ref_monthly),
    recup: amountText(src.salaire_net_recup_monthly),
    retenue: "",
  };
  const saved = src.print_data ?? {};
  for (const key of CONTRACT_PRINT_KEYS) {
    const v = saved[key];
    if (typeof v === "string" && v.trim()) base[key] = v;
  }
  const reason = Number(saved.cdd_reason);
  if (Number.isInteger(reason) && reason >= 1) base.cdd_reason = reason;
  return base;
}

/**
 * Values stored on the contract: only those differing from what the contract and employee file
 * give (`fileDefaults` = contractPrintDefaults with empty print_data), so later file fixes still show.
 */
export function contractPrintDataToSave(
  values: ContractPrintValues,
  fileDefaults: ContractPrintValues,
): Record<string, string | number> {
  const out: Record<string, string | number> = { cdd_reason: values.cdd_reason };
  for (const key of CONTRACT_PRINT_KEYS) {
    const v = values[key].trim();
    if (v && v !== fileDefaults[key]) out[key] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Arabic formatting
// ---------------------------------------------------------------------------

const MONTHS_AR = [
  "جانفي",
  "فيفري",
  "مارس",
  "أفريل",
  "ماي",
  "جوان",
  "جويلية",
  "أوت",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

/** 1991-12-28 → "28 ديسمبر 1991" */
export function arabicLongDate(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS_AR[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** 2025-12-13 → "2025/12/13" */
export function slashDate(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  return m ? `${m[1]}/${m[2]}/${m[3]}` : iso;
}

/** 210000 → "210 000.00" */
export function formatDzd(value: string | number) {
  const n = Number(String(value).replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return String(value);
  const [int, dec] = n.toFixed(2).split(".");
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${dec}`;
}

const ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
const TEENS = [
  "عشرة",
  "أحد عشر",
  "اثنا عشر",
  "ثلاثة عشر",
  "أربعة عشر",
  "خمسة عشر",
  "ستة عشر",
  "سبعة عشر",
  "ثمانية عشر",
  "تسعة عشر",
];
const TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const HUNDREDS = [
  "",
  "مائة",
  "مائتان",
  "ثلاثمائة",
  "أربعمائة",
  "خمسمائة",
  "ستمائة",
  "سبعمائة",
  "ثمانمائة",
  "تسعمائة",
];

function below1000(n: number, construct: boolean): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(h === 2 && r === 0 && construct ? "مائتا" : HUNDREDS[h]);
  if (r >= 20) {
    const u = r % 10;
    parts.push(u ? `${ONES[u]} و${TENS[Math.floor(r / 10)]}` : TENS[Math.floor(r / 10)]);
  } else if (r >= 10) {
    parts.push(TEENS[r - 10]);
  } else if (r) {
    parts.push(ONES[r]);
  }
  return parts.join(" و");
}

const SCALES: { value: number; one: string; two: string; plural: string; acc: string }[] = [
  { value: 1e9, one: "مليار", two: "ملياران", plural: "مليارات", acc: "مليارًا" },
  { value: 1e6, one: "مليون", two: "مليونان", plural: "ملايين", acc: "مليونًا" },
  { value: 1e3, one: "ألف", two: "ألفان", plural: "آلاف", acc: "ألفًا" },
];

function scaled(count: number, s: (typeof SCALES)[number]) {
  if (count === 1) return s.one;
  if (count === 2) return s.two;
  if (count <= 10) return `${below1000(count, false)} ${s.plural}`;
  const r = count % 100;
  const noun = r >= 3 && r <= 10 ? s.plural : r >= 11 ? s.acc : s.one;
  return `${below1000(count, true)} ${noun}`;
}

/** Integer amount in Arabic words: 210000 → "مائتان وعشرة آلاف". */
export function arabicNumberWords(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return "صفر";
  const parts: string[] = [];
  for (const s of SCALES) {
    const count = Math.floor(n / s.value);
    if (count) {
      parts.push(scaled(count, s));
      n %= s.value;
    }
  }
  if (n) parts.push(below1000(n, false));
  return parts.join(" و");
}

/** Amount with centimes: 1500.5 → "ألف وخمسمائة و خمسون سنتيم". */
export function arabicAmountWords(value: string | number): string {
  const n = Number(String(value).replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return "";
  const cents = Math.round((n - Math.floor(n)) * 100);
  const words = arabicNumberWords(n);
  return cents ? `${words} و${arabicNumberWords(cents)} سنتيم` : words;
}

export function contractDocType(v: Pick<ContractPrintValues, "is_cdi">) {
  return v.is_cdi ? "contrat_cdi" : "contrat_cdd";
}

/** Values printed by the contract templates (empty values print as a dotted blank). */
export function contractDocData(v: ContractPrintValues, company: HrCompanyProfile): DocData {
  const date = (iso: string, long = false) => (iso.trim() ? (long ? arabicLongDate(iso) : slashDate(iso)) : "");
  const amount = (raw: string) => (raw ? formatDzd(raw) : "..........");
  const words = (raw: string) => arabicAmountWords(raw) || "..........";
  return {
    company,
    numero: v.numero.trim(),
    nom: v.nom.trim(),
    matricule: v.matricule.trim(),
    birth_date: date(v.birth_date, true),
    birth_place: v.birth_place.trim(),
    father: v.father.trim(),
    mother: v.mother.trim(),
    marital: v.marital.trim(),
    id_piece: v.id_piece,
    id_number: v.id_number.trim(),
    id_issued_on: date(v.id_issued_on),
    id_issued_by: v.id_issued_by.trim(),
    address: v.address.trim(),
    poste: v.poste.trim(),
    start_date: date(v.start_date),
    end_date: date(v.end_date),
    cdd_reason: v.cdd_reason,
    essai: v.essai,
    preavis: v.preavis,
    net: amount(v.net),
    net_words: words(v.net),
    recup: amount(v.recup),
    recup_words: words(v.recup),
    retenue: amount(v.retenue),
    retenue_words: words(v.retenue),
  };
}

/** CDD reasons as listed (`ul.reasons > li`) in the contract template, in order. */
export function contractCddReasons(template: string): string[] {
  return parse(template)
    .querySelectorAll("ul.reasons > li")
    .map((li) => {
      li.querySelectorAll(".num, .box").forEach((n) => n.remove());
      return li.textContent.replace(/\s+/g, " ").trim();
    });
}

