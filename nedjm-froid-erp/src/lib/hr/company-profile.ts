/** Company identity printed on HR documents (one row, edited in Paramètres RH › Documents). */

export const COMPANY_PROFILE_KEYS = [
  "name_fr",
  "name_ar",
  "short_name",
  "address_fr",
  "address_ar",
  "city_fr",
  "city_ar",
  "city_short",
  "manager_name_fr",
  "manager_name_ar",
  "manager_title_fr",
  "manager_title_ar",
  "hr_service",
  "default_departure",
  "mission_open_return",
  "doc_prefix",
  "phone",
  "email",
  "nif",
  "nis",
  "rc",
  "ai",
  "bank",
] as const;

export type CompanyProfileKey = (typeof COMPANY_PROFILE_KEYS)[number];
export type HrCompanyProfile = Record<CompanyProfileKey, string>;

export const COMPANY_PROFILE_LABELS: Record<CompanyProfileKey, { fr: string; ar: string; hint?: string }> = {
  name_fr: { fr: "Raison sociale (FR)", ar: "التسمية (فرنسية)" },
  name_ar: { fr: "Raison sociale (AR)", ar: "التسمية (عربية)" },
  short_name: { fr: "Nom court", ar: "الاسم المختصر", hint: "Virements, relevés d'intérim" },
  address_fr: { fr: "Adresse du siège (FR)", ar: "عنوان المقر (فرنسية)" },
  address_ar: { fr: "Adresse du siège (AR)", ar: "عنوان المقر (عربية)" },
  city_fr: { fr: "Ville de signature (FR)", ar: "مدينة التحرير (فرنسية)", hint: "« Fait à … »" },
  city_ar: { fr: "Ville de signature (AR)", ar: "مدينة التحرير (عربية)", hint: "« حرر في … »" },
  city_short: { fr: "Ville abrégée", ar: "المدينة مختصرة", hint: "« Fait à » des ordres de mission et fiches" },
  manager_name_fr: { fr: "Nom du gérant (FR)", ar: "اسم المسير (فرنسية)" },
  manager_name_ar: { fr: "Nom du gérant (AR)", ar: "اسم المسير (عربية)" },
  manager_title_fr: { fr: "Titre du signataire (FR)", ar: "صفة الموقع (فرنسية)" },
  manager_title_ar: { fr: "Titre du signataire (AR)", ar: "صفة الموقع (عربية)" },
  hr_service: { fr: "Service émetteur", ar: "المصلحة المصدرة", hint: "« Établi par » par défaut" },
  default_departure: { fr: "Lieu de départ par défaut", ar: "مكان الذهاب الافتراضي", hint: "Ordres de mission" },
  mission_open_return: {
    fr: "Retour d'une mission sans date",
    ar: "العودة في مهمة دون تاريخ",
    hint: "Imprimé à la place de la date de retour (ex. « Fin de mission »)",
  },
  doc_prefix: { fr: "Préfixe des références", ar: "بادئة المراجع", hint: "NF → NF/OM/0005/26" },
  phone: { fr: "Téléphone", ar: "الهاتف" },
  email: { fr: "Email", ar: "البريد الإلكتروني" },
  nif: { fr: "NIF", ar: "رقم التعريف الجبائي" },
  nis: { fr: "NIS", ar: "رقم التعريف الإحصائي" },
  rc: { fr: "Registre du commerce", ar: "السجل التجاري" },
  ai: { fr: "Article d'imposition", ar: "مادة الضريبة" },
  bank: { fr: "Banque / RIB", ar: "البنك / الحساب" },
};

export const EMPTY_COMPANY_PROFILE: HrCompanyProfile = Object.fromEntries(
  COMPANY_PROFILE_KEYS.map((k) => [k, ""]),
) as HrCompanyProfile;

export function normalizeCompanyProfile(raw: unknown): HrCompanyProfile {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...EMPTY_COMPANY_PROFILE };
  for (const key of COMPANY_PROFILE_KEYS) {
    const v = src[key];
    if (typeof v === "string") out[key] = v;
  }
  return out;
}

/** "000005/26" → "NF/OM/0005/26" (no prefix → "OM/0005/26"). */
export function documentReference(prefix: string, code: string, numero: string | null | undefined) {
  const value = (numero ?? "").trim();
  if (!value) return "";
  const head = [prefix.trim(), code].filter(Boolean).join("/");
  const match = /^(\d+)\/(\d{2,4})$/.exec(value);
  if (!match) return `${head}/${value}`;
  return `${head}/${String(Number(match[1])).padStart(4, "0")}/${match[2]}`;
}
