/** HR letters (attestation, certificat, solde de tout compte, mises en demeure, titre de congé). */

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

export const LETTER_COMPANY = { fr: "E.U.R.L. NEDJM FROID", ar: "مؤسسة نجم التبريد" };
export const LETTER_PLACE = { fr: "Hassi Messaoud", ar: "حاسي مسعود" };

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
// Texts
// ---------------------------------------------------------------------------

export function letterTitle(v: Pick<LetterValues, "kind" | "lang">) {
  const fr: Record<LetterKind, string> = {
    ATTEST: "ATTESTATION DE TRAVAIL",
    CERTIF: "CERTIFICAT DE TRAVAIL",
    STC: "REÇU POUR SOLDE DE TOUT COMPTE",
    MED1: "MISE EN DEMEURE",
    MED2: "MISE EN DEMEURE",
    LEAVE: "TITRE DE CONGÉ",
  };
  const ar: Record<LetterKind, string> = {
    ATTEST: "إفادة عمل",
    CERTIF: "شهادة عمل",
    STC: "وصل تصفية كل حساب",
    MED1: "إعذار",
    MED2: "إعذار",
    LEAVE: "سند عطلة",
  };
  return v.lang === "ar" ? ar[v.kind] : fr[v.kind];
}

export function letterSubtitle(v: Pick<LetterValues, "kind" | "lang">) {
  if (v.kind === "MED1") return v.lang === "ar" ? "(الإعذار الأول)" : "(Première mise en demeure)";
  if (v.kind === "MED2") return v.lang === "ar" ? "(الإعذار الثاني والأخير)" : "(Deuxième et dernière mise en demeure)";
  return "";
}

/** Text placeholders filled by {@link fillLetter}. */
function letterVars(v: LetterValues): Record<string, string> {
  const f = v.sex === "F";
  const ar = v.lang === "ar";
  const amount = parseAmount(v.amount);
  const val = (frV: string, arV: string) => (ar ? arV || frV : frV || arV) || "……………";
  return {
    company: ar ? LETTER_COMPANY.ar : LETTER_COMPANY.fr,
    civ: ar ? (f ? "السيدة" : "السيد") : f ? "Madame" : "Monsieur",
    civ_short: f ? "Mme" : "M.",
    nom: val(v.nom_fr, v.nom_ar),
    matricule: v.matricule || "……",
    birth_date: slashDateIso(v.birth_date) || "……………",
    birth_place: val(v.birth_place_fr, v.birth_place_ar),
    poste: val(v.poste_fr, v.poste_ar),
    start: slashDateIso(v.start_date) || "……………",
    end: slashDateIso(v.end_date) || "……………",
    leave_kind: val(v.leave_kind_fr, v.leave_kind_ar),
    from: slashDateIso(v.leave_from) || "……………",
    to: slashDateIso(v.leave_to) || "……………",
    days: v.leave_days || "……",
    return: slashDateIso(v.leave_return) || "……………",
    since: slashDateIso(v.absence_since) || "……………",
    delai: v.delai || "08",
    ref: v.ref_numero || "……………",
    ref_date: slashDateIso(v.ref_date) || "……………",
    amount: formatAmount(amount),
    amount_words: ar ? arabicAmountWords(amount) : frenchAmountWords(amount),
    // Gender agreement.
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

const TEXTS: Record<LetterKind, Record<LetterLang, string[]>> = {
  ATTEST: {
    fr: [
      "Nous soussignés, {company}, attestons par la présente que {civ} {nom}, {ne} le {birth_date} à {birth_place}, est employé{e} au sein de notre entreprise en qualité de {poste}, depuis le {start} à ce jour.",
      "La présente attestation est délivrée à l'intéressé{e}, sur sa demande, pour servir et valoir ce que de droit.",
    ],
    ar: [
      "نحن الموقعين أدناه، {company}، نشهد بأن {civ} {nom} {a_ne} بتاريخ {birth_date} بـ {birth_place}، {a_works} لدى مؤسستنا بصفة {poste} منذ {start} إلى يومنا هذا.",
      "سلمت هذه الإفادة لـ{a_concerned} بناءً على طلب{a_her} لاستعمالها في حدود ما يسمح به القانون.",
    ],
  },
  CERTIF: {
    fr: [
      "Nous soussignés, {company}, certifions que {civ} {nom}, {ne} le {birth_date} à {birth_place}, a été employé{e} au sein de notre entreprise en qualité de {poste}, du {start} au {end}.",
      "{il} nous quitte libre de tout engagement.",
      "Le présent certificat est délivré à l'intéressé{e} pour servir et valoir ce que de droit.",
    ],
    ar: [
      "نحن الموقعين أدناه، {company}، نشهد بأن {civ} {nom} {a_ne} بتاريخ {birth_date} بـ {birth_place}، قد {a_worked} لدى مؤسستنا بصفة {poste} من {start} إلى {end}.",
      "وقد {a_left} مؤسستنا {a_free} من كل التزام.",
      "سلمت هذه الشهادة لـ{a_concerned} لاستعمالها في حدود ما يسمح به القانون.",
    ],
  },
  STC: {
    fr: [
      "Je soussigné{e} {civ} {nom}, matricule {matricule}, ayant occupé le poste de {poste} du {start} au {end}, reconnais avoir reçu de {company} la somme de {amount} DA ({amount_words}), pour solde de tout compte, en paiement des salaires, accessoires de salaire et indemnités de toute nature dus au titre de l'exécution et de la cessation de mon contrat de travail.",
      "Le présent reçu est établi en deux exemplaires, dont un m'a été remis.",
    ],
    ar: [
      "أنا {a_signed} أدناه {civ} {nom}، رقم التسجيل {matricule}، {a_who} منصب {poste} من {start} إلى {end}، أقر بأنني استلمت من {company} مبلغ {amount} دج ({amount_words})، تصفيةً لكل حساب، مقابل الأجور وملحقاتها والتعويضات بجميع أنواعها المستحقة بعنوان تنفيذ عقد عملي وإنهائه.",
      "حرر هذا الوصل في نسختين، سلمت لي نسخة منهما.",
    ],
  },
  MED1: {
    fr: [
      "{civ},",
      "Nous avons constaté votre absence de votre poste de travail ({poste}) depuis le {since}, sans autorisation ni justification à ce jour.",
      "Par la présente, nous vous mettons en demeure de rejoindre votre poste de travail ou de justifier votre absence dans un délai de {delai} jours à compter de la réception de la présente.",
      "À défaut, nous serons dans l'obligation de prendre à votre encontre les mesures prévues par le règlement intérieur et la législation en vigueur.",
      "Veuillez agréer, {civ}, nos salutations distinguées.",
    ],
    ar: [
      "{civ}،",
      "لقد لاحظنا غيابك عن منصب عملك ({poste}) منذ {since} دون ترخيص أو مبرر إلى يومنا هذا.",
      "وعليه، نعذرك بموجب هذه الرسالة بضرورة الالتحاق بمنصب عملك أو تبرير غيابك في أجل أقصاه {delai} أيام ابتداءً من تاريخ استلامك لهذا الإعذار.",
      "وفي حالة عدم الامتثال، سنضطر إلى اتخاذ الإجراءات المنصوص عليها في النظام الداخلي والتشريع المعمول به.",
      "تقبلوا منا فائق التقدير والاحترام.",
    ],
  },
  MED2: {
    fr: [
      "{civ},",
      "Malgré notre première mise en demeure n° {ref} du {ref_date}, restée sans suite, vous n'avez toujours pas rejoint votre poste de travail ({poste}), que vous avez quitté depuis le {since}.",
      "Nous vous mettons en demeure, pour la deuxième et dernière fois, de reprendre votre travail dans un délai de {delai} jours à compter de la réception de la présente.",
      "Passé ce délai, votre absence sera considérée comme un abandon de poste et entraînera votre licenciement pour faute grave, sans préavis ni indemnités, conformément à la réglementation en vigueur.",
      "Veuillez agréer, {civ}, nos salutations distinguées.",
    ],
    ar: [
      "{civ}،",
      "رغم إعذارنا الأول رقم {ref} المؤرخ في {ref_date} الذي بقي دون رد، لم {a_join} بعد بمنصب عملك ({poste}) الذي تغيبت عنه منذ {since}.",
      "وعليه، نعذرك للمرة الثانية والأخيرة بضرورة الالتحاق بمنصب عملك في أجل أقصاه {delai} أيام ابتداءً من تاريخ استلامك لهذا الإعذار.",
      "وبانقضاء هذا الأجل، يعتبر غيابك إهمالاً للمنصب ويترتب عنه تسريحك بسبب خطأ جسيم دون مهلة إشعار ولا تعويض، طبقاً للتنظيم المعمول به.",
      "تقبلوا منا فائق التقدير والاحترام.",
    ],
  },
  LEAVE: {
    fr: [
      "Il est accordé à {civ} {nom}, matricule {matricule}, {poste}, un congé de {days} jour(s) ({leave_kind}), du {from} au {to} inclus.",
      "L'intéressé{e} devra reprendre son poste de travail le {return}.",
    ],
    ar: [
      "تمنح لـ{civ} {nom}، رقم التسجيل {matricule}، {poste}، {leave_kind} مدتها {days} يوماً، من {from} إلى {to} (مدمج).",
      "وعلى {a_concerned} الالتحاق بمنصب عمل{a_her} يوم {return}.",
    ],
  },
};

export function fillLetter(text: string, vars: Record<string, string>) {
  return text.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? vars[key] : m));
}

/** Generated paragraphs, one string per paragraph. */
export function defaultLetterBody(v: LetterValues): string[] {
  const vars = letterVars(v);
  return TEXTS[v.kind][v.lang].map((p) => fillLetter(p, vars));
}

export function letterParagraphs(v: LetterValues): string[] {
  const own = v.body.trim();
  if (!own) return defaultLetterBody(v);
  return own
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Recipient block for mises en demeure. */
export function letterRecipient(v: LetterValues) {
  if (v.kind !== "MED1" && v.kind !== "MED2") return null;
  const vars = letterVars(v);
  const address = v.lang === "ar" ? v.address_ar || v.address_fr : v.address_fr || v.address_ar;
  return {
    name: `${vars.civ} ${vars.nom}`,
    address,
    object:
      v.lang === "ar"
        ? "الموضوع : غياب غير مبرر — إعذار بالالتحاق بمنصب العمل"
        : "Objet : Absence irrégulière — Mise en demeure de reprendre le travail",
    mode: v.lang === "ar" ? "رسالة موصى عليها مع إشعار بالاستلام" : "Lettre recommandée avec accusé de réception",
  };
}

/** Detail rows printed under the text (titre de congé). */
export function leaveDetailRows(v: LetterValues): [string, string][] {
  if (v.kind !== "LEAVE") return [];
  const vars = letterVars(v);
  const ar = v.lang === "ar";
  const rows: [string, string][] = [
    [ar ? "طبيعة العطلة" : "Nature du congé", vars.leave_kind],
    [ar ? "من" : "Du", vars.from],
    [ar ? "إلى" : "Au", vars.to],
    [ar ? "عدد الأيام" : "Nombre de jours", vars.days],
    [ar ? "تاريخ الاستئناف" : "Date de reprise", vars.return],
  ];
  if (v.leave_balance) rows.push([ar ? "الرصيد المتبقي" : "Reliquat après congé", `${v.leave_balance} ${ar ? "يوم" : "j"}`]);
  return rows;
}

export function letterSignatures(v: Pick<LetterValues, "kind" | "lang">): string[] {
  const ar = v.lang === "ar";
  if (v.kind === "STC") return ar ? ["إمضاء العامل (قرئ وصودق عليه)", "المستخدم"] : ["Le salarié (lu et approuvé)", "L'employeur"];
  if (v.kind === "LEAVE") return ar ? ["المعني(ة)", "المديرية"] : ["L'intéressé(e)", "La Direction"];
  return [ar ? "المسير" : "Le Gérant"];
}
