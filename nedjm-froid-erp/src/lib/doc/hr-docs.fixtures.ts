import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import type { HrEmployeeField } from "@/lib/actions/hr-employees";
import { EMPTY_COMPANY_PROFILE, type HrCompanyProfile } from "@/lib/hr/company-profile";
import { emptyLetterValues, type LetterKind, type LetterLang, type LetterValues } from "@/lib/hr/hr-letters";
import { printListsFrom, type HrListItem, type PrintLists } from "@/lib/hr/hr-lists";
import type { LeaveTitleFields, LeaveTitleLeave } from "@/lib/hr/leave-title";
import type { MissionOrderFields } from "@/lib/hr/mission-order";
import type { ContractPrintValues } from "@/lib/hr/work-contract";

/** Test inputs shared by the HR document snapshots (tests only). */

export const FIXTURE_ORIGIN = "https://erp.test";
export const FIXTURE_LETTERHEAD = "https://erp.test/hr-letterhead.png";

/** Company profile seeded by the migration. */
export const SEED_COMPANY: HrCompanyProfile = {
  ...EMPTY_COMPANY_PROFILE,
  name_fr: "E.U.R.L. NEDJM FROID",
  name_ar: "مؤسسة نجم التبريد",
  short_name: "NEDJM FROID",
  address_fr: "Lotissement coopérative immobilière n° 01 du 19 mars 1962, Hassi Messaoud, wilaya de Ouargla",
  address_ar: 'تجزئة التعاونية العقارية رقم "01" 19 مارس 1962 حاسي مسعود ولاية ورقلة',
  city_fr: "Hassi Messaoud",
  city_ar: "حاسي مسعود",
  city_short: "HMD",
  manager_name_fr: "TOUZARI Saïd",
  manager_name_ar: "توزاري السعيد",
  manager_title_fr: "Le Gérant",
  manager_title_ar: "المسير",
  hr_service: "Service RH",
  default_departure: "Hassi Messaoud",
  mission_open_return: "Fin de mission",
  doc_prefix: "NF",
};

const item = (kind: string, code: string, label_fr: string, label_ar: string, extra: Record<string, unknown>, sort_order: number): HrListItem => ({
  kind,
  code,
  label_fr,
  label_ar,
  extra,
  sort_order,
  is_active: true,
});

/** HR list items seeded by the migration (leave kinds, exit reasons, transport modes, contract types). */
export const SEED_LIST_ITEMS: HrListItem[] = [
  item("leave_kind", "ANNUAL", "Congé annuel", "عطلة سنوية", { legend: "CA", annual: true }, 10),
  item("leave_kind", "RECOVERY", "Récupération", "عطلة تعويضية", { legend: "CRP" }, 20),
  item("leave_kind", "SICK", "Congé maladie", "عطلة مرضية", { legend: "CM" }, 30),
  item("leave_kind", "UNPAID", "Congé sans solde", "عطلة بدون أجر", { legend: "CSS" }, 40),
  item("leave_kind", "EXCEPTIONAL", "Absence autorisée payée", "غياب مرخص مدفوع", { legend: "AOP" }, 50),
  item("exit_reason", "END_CDD", "Fin de contrat (CDD)", "انتهاء مدة العقد", {}, 10),
  item("exit_reason", "RESIGNATION", "Démission", "استقالة", {}, 20),
  item("exit_reason", "ABANDON", "Abandon de poste", "إهمال المنصب", { mise_en_demeure: true }, 40),
  item("transport_mode", "TOUS", "Tous moyens de transport", "جميع وسائل النقل", {}, 1),
  item("transport_mode", "SERVICE", "Véhicule de service", "مركبة المصلحة", { vehicle: true }, 2),
  item("contract_type", "CDI", "CDI", "عقد غير محدد المدة", { cdi: true, essai: "شهرا واحدا", preavis: "ثلاثة أشهر", cdd_reason: 5 }, 10),
  item("contract_type", "CDD", "CDD", "عقد محدد المدة", { essai: "شهرا واحدا", preavis: "ثلاثة أشهر", cdd_reason: 5 }, 20),
];

export const SEED_LISTS: PrintLists = printListsFrom(SEED_LIST_ITEMS);

const person: Partial<LetterValues> = {
  numero: "000123/26",
  nom_fr: "BEN ALI KARIM",
  nom_ar: "بن علي كريم",
  matricule: "042/24",
  birth_date: "1990-05-12",
  birth_place_fr: "Oran",
  birth_place_ar: "وهران",
  address_fr: "Cité 20 août, Oran",
  address_ar: "حي 20 أوت، وهران",
  poste_fr: "Soudeur <qualifié> & \"chef\"",
  poste_ar: "لحام",
  start_date: "2024-03-01",
  end_date: "2026-08-31",
  date_doc: "2026-10-06",
};

function letter(kind: LetterKind, lang: LetterLang, extra: Partial<LetterValues> = {}): LetterValues {
  return { ...emptyLetterValues(kind, lang), ...person, ...extra };
}

const KINDS: LetterKind[] = ["ATTEST", "CERTIF", "STC", "MED1", "MED2", "LEAVE"];

const perKind: Record<LetterKind, Partial<LetterValues>> = {
  ATTEST: {},
  CERTIF: {},
  STC: {
    amount: "123456.78",
    lines: [
      { label_fr: "Indemnité compensatrice de congé (12 j)", label_ar: "تعويض العطلة (12 يوم)", amount: 45000 },
      { label_fr: "Salaire du mois", label_ar: "", amount: 78456.78 },
    ],
  },
  MED1: { absence_since: "2026-09-20", delai: "08" },
  MED2: { absence_since: "2026-09-20", delai: "08", ref_numero: "000098/26", ref_date: "2026-09-25" },
  LEAVE: {
    leave_kind_fr: "Congé annuel",
    leave_kind_ar: "عطلة سنوية",
    leave_from: "2026-10-10",
    leave_to: "2026-10-30",
    leave_days: "21",
    leave_return: "2026-10-31",
    leave_balance: "9",
  },
};

export const LETTER_FIXTURES: { name: string; values: LetterValues }[] = [
  ...KINDS.flatMap((kind) =>
    (["fr", "ar"] as const).flatMap((lang) => [
      { name: `${kind.toLowerCase()}-${lang}-m`, values: letter(kind, lang, perKind[kind]) },
      { name: `${kind.toLowerCase()}-${lang}-f`, values: letter(kind, lang, { ...perKind[kind], sex: "F" }) },
    ]),
  ),
  { name: "attest-fr-empty", values: emptyLetterValues("ATTEST", "fr") },
  { name: "med2-ar-empty", values: emptyLetterValues("MED2", "ar") },
  { name: "stc-fr-nolines", values: letter("STC", "fr", { amount: "1000" }) },
  { name: "leave-fr-nobalance", values: letter("LEAVE", "fr", { ...perKind.LEAVE, leave_balance: "" }) },
  {
    name: "certif-fr-body",
    values: letter("CERTIF", "fr", { body: "Premier paragraphe libre.\n\nSecond paragraphe du 12/05/2026." }),
  },
  {
    name: "attest-ar-body",
    values: letter("ATTEST", "ar", { body: "فقرة حرة أولى.\n\nفقرة ثانية بتاريخ 12/05/2026 بمبلغ 45 000,00." }),
  },
];

export const MISSION_BASE: MissionOrderFields = {
  matricule: "05/26",
  nom: "TAHRI",
  prenom: "CHAHINAZ",
  affectation: "ADMINISTRATION",
  codeAffectation: "ADM-01",
  poste: "Ingenieur",
  dest1: "Ouargla",
  dest2: "Touggourt",
  lieuDepart: "Hassi Messaoud",
  dateDepart: "2026-09-12",
  heureDepart: "08:00",
  lieuRetour: "Hassi Messaoud",
  dateRetour: "2026-09-15",
  heureRetour: "17:30",
  motif: "Installation chambre froide <client> & co",
  moyen: "Véhicule de service",
  modele: "Toyota Hilux",
  immat: "12345-120-30",
  kmDepart: "10500",
  kmRetour: "10980",
  pieceType: "CNI",
  pieceNum: "123456789",
  pieceDelivre: "2023-08-22",
  pieceFonction: "Ingenieur",
  pieceLieu: "Ouargla",
  donneur: "Service RH",
  faitA: "HMD",
  dateDoc: "2026-09-11",
  gabarit: null,
};

const missionEmpty: MissionOrderFields = {
  ...MISSION_BASE,
  prenom: null,
  affectation: null,
  codeAffectation: null,
  poste: null,
  dest1: null,
  dest2: null,
  lieuDepart: null,
  dateDepart: null,
  heureDepart: null,
  lieuRetour: null,
  dateRetour: null,
  heureRetour: null,
  motif: null,
  moyen: null,
  modele: null,
  immat: null,
  kmDepart: null,
  kmRetour: null,
  pieceType: null,
  pieceNum: null,
  pieceDelivre: null,
  pieceFonction: null,
  pieceLieu: null,
  donneur: null,
  faitA: null,
  dateDoc: null,
};

export const MISSION_FIXTURES: { name: string; fields: MissionOrderFields & { numero?: string | null } }[] = [
  { name: "om-v2-full", fields: { ...MISSION_BASE, numero: "000004/26" } },
  { name: "om-v2-open", fields: { ...MISSION_BASE, dateRetour: null, moyen: "Taxi", numero: "000005/26" } },
  { name: "om-v2-empty", fields: { ...missionEmpty, numero: null } },
  { name: "om-v1-full", fields: { ...MISSION_BASE, gabarit: "v1", numero: "000004/26" } },
  { name: "om-v1-open", fields: { ...MISSION_BASE, gabarit: "v1", dateRetour: null, numero: "000006/26" } },
  { name: "om-v1-empty", fields: { ...missionEmpty, gabarit: "v1", numero: null } },
];

const leaveFields: LeaveTitleFields = {
  matricule: "05/26",
  nom: "TAHRI",
  prenom: "CHAHINAZ",
  affectation: "ADMINISTRATION",
  codeAffectation: "ADM-01",
  poste: "Ingenieur",
  moyen: "Tous moyens de transport",
  modele: null,
  immat: null,
  kmDepart: null,
  kmRetour: null,
  pieceType: "CNI",
  pieceNum: "123456789",
  donneur: "Service RH",
  pieceFonction: "Responsable RH",
  faitA: "HMD",
  dateDoc: "2026-10-01",
};

export const LEAVE_TITLE_FIXTURES: { name: string; fields: LeaveTitleFields; leave: LeaveTitleLeave; numero: string | null }[] = [
  {
    name: "titre-full",
    fields: leaveFields,
    leave: { kind: "ANNUAL", dateDebut: "2026-10-10", dateFin: "2026-10-30", jours: 21 },
    numero: "000012/26",
  },
  {
    name: "titre-half",
    fields: { ...leaveFields, moyen: "Véhicule de service", faitA: null },
    leave: { kind: "SICK", dateDebut: "2026-10-10", dateFin: "2026-10-10", jours: 0.5 },
    numero: "000013/26",
  },
  {
    name: "titre-empty",
    fields: { ...leaveFields, prenom: null, affectation: null, poste: null, moyen: null, pieceType: null, pieceNum: null, donneur: null, pieceFonction: null, faitA: null, dateDoc: null },
    leave: { kind: "", dateDebut: "", dateFin: "", jours: 0 },
    numero: null,
  },
];

function field(code: string, label_fr: string, label_ar: string, value_type: HrEmployeeField["value_type"] = "text", catalog_kind: string | null = null): HrEmployeeField {
  return {
    id: code,
    code,
    label_fr,
    label_ar,
    value_type,
    catalog_kind,
    storage_group: "core",
    section_ar: null,
    section_fr: null,
    sort_order: 0,
    is_system: true,
    is_active: true,
    is_required: false,
  };
}

export const FICHE_FIELDS: HrEmployeeField[] = [
  field("matricule", "Matricule", "الرقم التسلسلي"),
  field("last_name", "Nom", "اللقب"),
  field("first_name", "Prénom", "الاسم"),
  field("birth_date", "Date de naissance", "تاريخ الميلاد", "date"),
  field("birth_place_fr", "Lieu de naissance", "مكان الميلاد"),
  field("commune_birth", "Commune de naissance", "Commune de naissance"),
  field("nationality", "Nationalité", "الجنسية"),
  field("marital_code", "Situation familiale", "الحالة العائلية", "catalog", "marital"),
  field("sex_code", "Sexe", "الجنس", "catalog", "sex"),
  field("father_name", "Prénom du père", "اسم الأب"),
  field("address_fr", "Adresse", "العنوان"),
  field("phone", "Téléphone", "الهاتف"),
  field("experience_years", "Expérience", "الخبرة", "number"),
  field("email", "Email :", ""),
];

export const FICHE_CATALOGS: CatalogItem[] = [
  { id: "1", kind: "marital", code: "M", label_fr: "Marié(e)", label_ar: "متزوج", extra: {}, color_bg: null, color_fg: null, sort_order: 1, is_active: true },
  { id: "2", kind: "sex", code: "F", label_fr: "Féminin", label_ar: "أنثى", extra: {}, color_bg: null, color_fg: null, sort_order: 1, is_active: true },
];

export const FICHE_VALUES: Record<string, string> = {
  matricule: "05/26",
  last_name: "tahri",
  first_name: "Chahinaz",
  birth_date: "1995-04-03",
  birth_place_fr: "Ouargla",
  nationality: "Algérienne",
  marital_code: "M",
  sex_code: "F",
  father_name: "Ahmed <x>",
  address_fr: "Cité 5 juillet",
  phone: "0550123456",
  experience_years: "4",
  email: "c.tahri@example.dz",
  photo_url: "https://erp.test/photo.jpg",
};

export const FICHE_TODAY = "2026-10-06T09:00:00Z";

const contractBase: ContractPrintValues = {
  numero: "2026/014",
  is_cdi: false,
  nom: "بن علي كريم",
  matricule: "042/24",
  birth_date: "1990-05-12",
  birth_place: "وهران",
  father: "محمد",
  mother: "فاطمة",
  marital: "متزوج",
  id_piece: "ب.ت.و",
  id_number: "123456789",
  id_issued_on: "2020-01-15",
  id_issued_by: "دائرة وهران",
  address: "حي 20 أوت، وهران",
  poste: "لحام",
  start_date: "2026-09-01",
  end_date: "2027-08-31",
  cdd_reason: 5,
  essai: "شهرا واحدا",
  preavis: "ثلاثة أشهر",
  net: "65000",
  recup: "45000.5",
  retenue: "2166.67",
};

export const CONTRACT_FIXTURES: { name: string; values: ContractPrintValues }[] = [
  { name: "contrat-cdd", values: contractBase },
  { name: "contrat-cdd-reason2", values: { ...contractBase, cdd_reason: 2 } },
  { name: "contrat-cdi", values: { ...contractBase, is_cdi: true, end_date: "", numero: "2026/015" } },
  {
    name: "contrat-cdd-blank",
    values: {
      ...contractBase,
      numero: "",
      father: "",
      mother: "",
      marital: "",
      id_number: "",
      id_issued_on: "",
      id_issued_by: "",
      birth_date: "",
      end_date: "",
      net: "",
      recup: "",
      retenue: "",
    },
  },
];

/** One tag per line and single spaces, so a template that prints the same document compares equal. */
export function normalizeDocHtml(html: string) {
  return html
    .split(FIXTURE_ORIGIN)
    .join("")
    .replace(/<base [^>]*>/g, "")
    .replace(/&nbsp;/g, "\u00a0")
    .replace(/\r\n/g, "\n")
    .replace(/>\s*</g, ">\n<")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .trim();
}
