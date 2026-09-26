/** Work contract (عقد عمل) printing: template, pre-filled values and Arabic formatting. */

export type ContractArticle = {
  key: string;
  body: string;
  /** Only printed for fixed-term contracts. */
  cdd_only?: boolean;
};

export type ContractTemplate = {
  title_cdd: string;
  title_cdi: string;
  legal_intro: string;
  opening_cdd: string;
  opening_cdi: string;
  employer_block: string;
  cdd_reason_intro: string;
  cdd_reasons: string[];
  articles: ContractArticle[];
  note: string;
  closing: string;
  sig_employee: string;
  sig_employer: string;
  copies: string;
};

export const CONTRACT_PLACEHOLDERS = [
  ["{essai}", "Période d'essai"],
  ["{preavis}", "Préavis"],
  ["{net}", "Net à payer"],
  ["{net_lettres}", "Net en lettres"],
  ["{recup}", "Indemnité récupération"],
  ["{recup_lettres}", "Récupération en lettres"],
  ["{retenue}", "Retenue / jour d'absence"],
  ["{retenue_lettres}", "Retenue en lettres"],
] as const;

export const DEFAULT_CONTRACT_TEMPLATE: ContractTemplate = {
  title_cdd: "عقد عمل محدد المدة",
  title_cdi: "عقد عمل غير محدد المدة",
  legal_intro:
    "تطبيقًا للإجراءات المنصوص عليها في القانون رقم : 11/90 المؤرخ في 21 أفريل 1990 المتعلق بعلاقات العمل.",
  opening_cdd: "يبرم هذا العقد المحدد المدة بين:",
  opening_cdi: "يبرم هذا العقد غير المحدد المدة بين:",
  employer_block:
    'السيّد : **توزاري السعيد** مسير مؤسسة نجم التبريد الكائن مقرها بـ: تجزئة التعاونية العقارية رقم "01" 19 مارس 1962 حاسي مسعود ولاية ورقلة، وهذا بموجب تعديل القانون الأساسي المؤرخ في 2019/11/28 تحت رقم الفهرس 2019/951: بمكتب الأستاذ معماش النجاعي موثق بحي زادي مسعود عمارة س رقم 105 الطابق الأول بسطيف.',
  cdd_reason_intro:
    "يوظف السيد (ة) المذكور أعلاه في المنصب المتاح وهذا لأجل أحد الأسباب المذكورة في المادة 12 من القانون: 11/90 المتعلق بعلاقات العمل وهي:",
  cdd_reasons: [
    "عندما يوظف العامل(ة) عمل مرتبط بعقود وأشغال أو خدمات غير متجددة.",
    "عندما يتعلق الأمر باستخلاف عامل مثبت في منصب تغيب عنه مؤقتاً.",
    "عندما يتطلب الأمر من الهيئة المستخدمة إجراء أشغال ذات طابع منقطع.",
    "عندما يبرر ذلك بتزايد العمل أو أسباب موسمية.",
    "عندما يتعلق الأمر بنشاطات أو أشغال ذات مدة محدودة.",
  ],
  articles: [
    {
      key: "essai",
      body: "يخضع العامل (ة) لفترة تجريبية قدرها {essai}، من خلالها يمكن للطرفين فسخ العقد دون إشعار مسبق ولا تعويض، ولا تدخل في حساب المدة كل العطل المرضية مهما كانت طبيعتها.",
    },
    {
      key: "horaire",
      body: "يؤدي العامل (ة) عمله حسب التوقيت المعتمد في الورشة (التي ينتمي إليها) والمتمثل في أربعة أسابيع عمل فعلي في مقابل ثلاثة أسابيع عطلة تعويضية وأسبوع عطلة سنوية.",
    },
    {
      key: "fin",
      cdd_only: true,
      body: "ينتهي العقد خلال الفترة المتفق عليها ويمكن تجديده بطلب من المستخدِم (L'employeur).",
    },
    {
      key: "preavis",
      body: "إنّ مدّة الإخطار المسبق يجب أن لا تقل عن {preavis} وفي حالة التّخلي عن المنصب دون ذلك من غير القوة القاهرة (أسباب قوية ومقنعة) يتحمل العامل (ة) كل الخسائر المترتبة وإن لزم يتابع قضائيا.",
    },
    {
      key: "salaire",
      body: "يستفيد العامل (ة) مقابل عمله أجرا قدره **{net} دج** ({net_lettres}) دينار جزائري الأجر الصافي (Net\u00a0à\u00a0Payer) عن كل شهر عمل فعلي.",
    },
    {
      key: "recup",
      body: "يستفيد العامل خلال العطلة التعويضية متوسط **{recup} دج** ({recup_lettres}) دينار جزائري تحسب على أساس عدد أيام عطلته كالتالي: {recup} دج تُقسّم على عدد أيام الشهر وتُضرب في عدد أيام العطلة.",
    },
    {
      key: "absence",
      body: "يخضع العامل (ة) لاقتطاع قدره **{retenue} دج** ({retenue_lettres}) دينار جزائري عن كل يوم غياب غير مبرر، وفي حال وجود تبرير يسلم إلى الإدارة في غضون 24 ساعة الموالية للغياب، وإن كان طبيا يصادق عليه من قبل صندوق الضمان الاجتماعي.",
    },
    {
      key: "reglement",
      body: "يخضع العامل (ة) لأحكام هذا العقد ولقوانين النظام الداخلي للمؤسسة المؤرخ في 2010/05/03 والمصادق عليه من طرف السلطات المعنية والممثلة في محكمة المقر ومفتشية العمل لدائرة حاسي مسعود.",
    },
    {
      key: "source",
      body: "يعد النظام الداخلي للمؤسسة المصدر الأساسي لهذا العقد وفي حال وجود أي إشكال أو تصادم في هذا الأخير فلا بد من الرجوع والعودة إلى النظام الداخلي للمؤسسة.",
    },
  ],
  note: 'إن النظام الداخلي متوفر ومنشور على مستوى حرم المؤسسة "قاعدة الحياة" وجميع الورشات وتسلَّم نسخة من هذا الأخير لكل عامل من عمال المؤسسة.',
  closing: "إطلع المعني على مواد العقد ووافق عليه.",
  sig_employee: "توقيع المعني وبصمته",
  sig_employer: "توقيع الهيئة المستخدمة",
  copies: "يوقع العقد في ثلاث نسخ أصلية:\n- نسخة للعامل.\n- نسختين لإدارة المؤسسة.",
};

function str(v: unknown, fallback: string) {
  return typeof v === "string" ? v : fallback;
}

/** Stored template merged over the defaults (missing keys keep the PDF wording). */
export function normalizeContractTemplate(raw: unknown): ContractTemplate {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_CONTRACT_TEMPLATE;
  const reasons = Array.isArray(src.cdd_reasons)
    ? src.cdd_reasons.filter((r): r is string => typeof r === "string")
    : d.cdd_reasons;
  const articles = Array.isArray(src.articles)
    ? src.articles
        .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
        .map((a, i) => ({
          key: str(a.key, `art${i + 1}`),
          body: str(a.body, ""),
          cdd_only: a.cdd_only === true,
        }))
    : d.articles;
  return {
    title_cdd: str(src.title_cdd, d.title_cdd),
    title_cdi: str(src.title_cdi, d.title_cdi),
    legal_intro: str(src.legal_intro, d.legal_intro),
    opening_cdd: str(src.opening_cdd, d.opening_cdd),
    opening_cdi: str(src.opening_cdi, d.opening_cdi),
    employer_block: str(src.employer_block, d.employer_block),
    cdd_reason_intro: str(src.cdd_reason_intro, d.cdd_reason_intro),
    cdd_reasons: reasons,
    articles,
    note: str(src.note, d.note),
    closing: str(src.closing, d.closing),
    sig_employee: str(src.sig_employee, d.sig_employee),
    sig_employer: str(src.sig_employer, d.sig_employer),
    copies: str(src.copies, d.copies),
  };
}

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

/** Fields pre-filled from the contract and employee file; values saved at the last print win. */
export function contractPrintDefaults(src: ContractPrintSource): ContractPrintValues {
  const e = src.employee;
  const nameAr = [clean(e.last_name_ar), clean(e.first_name_ar)].filter(Boolean).join(" ");
  const base: ContractPrintValues = {
    numero: clean(src.contract_number),
    is_cdi: (src.contract_type_code ?? "").toUpperCase() === "CDI",
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
    cdd_reason: 5,
    essai: "شهرا واحدا",
    preavis: "ثلاثة أشهر",
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

const ORDINALS = [
  "الأولى",
  "الثانية",
  "الثالثة",
  "الرابعة",
  "الخامسة",
  "السادسة",
  "السابعة",
  "الثامنة",
  "التاسعة",
  "العاشرة",
  "الحادية عشر",
  "الثانية عشر",
  "الثالثة عشر",
  "الرابعة عشر",
  "الخامسة عشر",
  "السادسة عشر",
  "السابعة عشر",
  "الثامنة عشر",
  "التاسعة عشر",
  "العشرون",
];

export function articleTitle(index: number) {
  return `المادة ${ORDINALS[index] ?? String(index + 1)}`;
}

/** Placeholders of an article body replaced by the contract values. */
export function fillContractText(body: string, v: ContractPrintValues) {
  const map: Record<string, string> = {
    "{essai}": v.essai,
    "{preavis}": v.preavis,
    "{net}": v.net ? formatDzd(v.net) : "..........",
    "{net_lettres}": arabicAmountWords(v.net) || "..........",
    "{recup}": v.recup ? formatDzd(v.recup) : "..........",
    "{recup_lettres}": arabicAmountWords(v.recup) || "..........",
    "{retenue}": v.retenue ? formatDzd(v.retenue) : "..........",
    "{retenue_lettres}": arabicAmountWords(v.retenue) || "..........",
  };
  return body.replace(/\{[a-z_]+\}/g, (token) => map[token] ?? token);
}
