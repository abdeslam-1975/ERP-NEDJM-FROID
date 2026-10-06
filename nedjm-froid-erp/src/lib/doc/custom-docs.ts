import { z } from "zod";
import { escapeHtml, type DocData } from "@/lib/doc/engine";
import { DEFAULT_PAGE_SETUP, applyPageSetup, normalizePageSetup, pageSetupSchema, type PageSetup } from "@/lib/doc/page-setup";
import type { DocField, DocList } from "@/lib/doc/registry";
import type { HrCompanyProfile } from "@/lib/hr/company-profile";
import { formatAmount, frenchAmountWords } from "@/lib/hr/hr-letters";
import { arabicLongDate, arabicNumberWords } from "@/lib/hr/work-contract";

/**
 * Documents created from Paramètres RH › Documents › Créer un document. A definition says where the
 * automatic values come from (`source`), which values are typed at print time (`inputs`), the page setup
 * and the numbering; its template is the doc_templates row `custom_<code>`.
 *
 * Template data: `reference`, `date_doc`, `date_doc_long`, `fait_a`, `doc_title`, `letterhead`, `company.*`,
 * `input.<key>` (+ `input.<key>_lettres` / `_lettres_ar` for amounts) and, depending on the source,
 * `emp.*` (employee), `ct.*` (contract), `lv.*` (leave), `om.*` (mission order), `ex.*` (exit).
 */

export const CUSTOM_DOC_PREFIX = "custom_";
/** Public bucket of the uploaded fonts and letterhead images. */
export const DOC_ASSETS_BUCKET = "doc-assets";
const CUSTOM_DOC_TYPE = /^custom_[a-z0-9_]{2,40}$/;

export function isCustomDocType(value: unknown): value is string {
  return typeof value === "string" && CUSTOM_DOC_TYPE.test(value);
}

export function customDocType(code: string) {
  return `${CUSTOM_DOC_PREFIX}${code}`;
}

export const CUSTOM_DOC_SOURCES = [
  { id: "employee", fr: "Employé", ar: "عامل", hint: "Fiche de l'employé et son contrat en cours." },
  { id: "contract", fr: "Contrat", ar: "عقد", hint: "Un contrat précis : poste, dates, salaire." },
  { id: "leave", fr: "Congé", ar: "عطلة", hint: "Une demande de congé : nature, dates, jours." },
  { id: "mission", fr: "Ordre de mission", ar: "أمر بمهمة", hint: "Un ordre de mission enregistré : destination, dates, objet." },
  { id: "exit", fr: "Sortie", ar: "خروج", hint: "Une sortie d'employé : date, motif, solde de congé." },
  { id: "free", fr: "Document libre", ar: "وثيقة حرة", hint: "Aucune valeur automatique : tout se saisit à l'impression." },
] as const;

export type CustomDocSource = (typeof CUSTOM_DOC_SOURCES)[number]["id"];

export const CUSTOM_DOC_LANGS = [
  { id: "fr", fr: "Français", ar: "فرنسية" },
  { id: "ar", fr: "Arabe (de droite à gauche)", ar: "عربية" },
  { id: "bi", fr: "Bilingue français / arabe", ar: "ثنائية اللغة" },
] as const;

export type CustomDocLang = (typeof CUSTOM_DOC_LANGS)[number]["id"];

export const CUSTOM_DOC_FAMILIES = [
  { id: "lettres", fr: "Lettres et attestations" },
  { id: "fiches", fr: "Fiches et formulaires" },
  { id: "contrats", fr: "Contrats et avenants" },
  { id: "autres", fr: "Autres documents" },
] as const;

export type CustomDocFamily = (typeof CUSTOM_DOC_FAMILIES)[number]["id"];

export const CUSTOM_INPUT_TYPES = [
  { id: "text", fr: "Texte court" },
  { id: "textarea", fr: "Texte long (paragraphes)" },
  { id: "date", fr: "Date" },
  { id: "number", fr: "Nombre" },
  { id: "amount", fr: "Montant (avec la somme en lettres)" },
  { id: "list", fr: "Choix dans une liste" },
  { id: "bool", fr: "Oui / non" },
] as const;

export type CustomInputType = (typeof CUSTOM_INPUT_TYPES)[number]["id"];

const INPUT_KEY = /^[a-z][a-z0-9_]{0,39}$/;
const CODE = /^[a-z0-9_]{2,40}$/;

export const customInputSchema = z.object({
  key: z.string().trim().regex(INPUT_KEY, { message: "Clé de champ : lettres minuscules, chiffres et _ (ex. motif_demande)." }),
  label_fr: z.string().trim().min(1, { message: "Chaque champ à saisir a besoin d'un libellé." }).max(120),
  label_ar: z.string().trim().max(120).catch(""),
  type: z.enum(["text", "textarea", "date", "number", "amount", "list", "bool"]).catch("text"),
  list_kind: z.string().trim().max(60).catch(""),
  required: z.boolean().catch(false),
  default_value: z.string().max(2000).catch(""),
});

export type CustomInput = z.infer<typeof customInputSchema>;

export const numberingSchema = z.object({
  enabled: z.boolean().catch(true),
  pattern: z.string().trim().min(1).max(80).catch("{prefix}/{code}/{seq}/{yy}"),
  reset: z.enum(["yearly", "never"]).catch("yearly"),
  pad: z.number().int().min(1).max(8).catch(4),
});

export type Numbering = z.infer<typeof numberingSchema>;

export const DEFAULT_NUMBERING: Numbering = numberingSchema.parse({});

export const customDocDefInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    code: z.string().trim().regex(CODE, { message: "Code : 2 à 40 caractères, lettres minuscules, chiffres et _." }),
    name_fr: z.string().trim().min(1, { message: "Le nom du document est obligatoire." }).max(160),
    name_ar: z.string().trim().max(160).default(""),
    family: z.enum(["lettres", "fiches", "contrats", "autres"]),
    lang: z.enum(["fr", "ar", "bi"]),
    source: z.enum(["employee", "contract", "leave", "mission", "exit", "free"]),
    inputs: z.array(customInputSchema).max(40),
    page: pageSetupSchema,
    numbering: numberingSchema,
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    for (const input of v.inputs) {
      if (seen.has(input.key)) ctx.addIssue({ code: "custom", message: `Le champ « ${input.key} » est défini deux fois.` });
      seen.add(input.key);
      if (input.type === "list" && !input.list_kind) {
        ctx.addIssue({ code: "custom", message: `Choisissez la liste du champ « ${input.label_fr} ».` });
      }
    }
    if (v.page.letterhead === "custom" && !v.page.letterhead_url) {
      ctx.addIssue({ code: "custom", message: "Importez l'image du papier à en-tête de ce document." });
    }
  });

export type CustomDocDefInput = z.infer<typeof customDocDefInputSchema>;

export type CustomDocDef = Omit<CustomDocDefInput, "id"> & {
  id: string;
  doc_type: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const arrayOf = <T>(schema: z.ZodType<T>, raw: unknown): T[] =>
  (Array.isArray(raw) ? raw : []).flatMap((item) => {
    const r = schema.safeParse(item);
    return r.success ? [r.data] : [];
  });

export function normalizeCustomDocDef(row: Record<string, unknown>): CustomDocDef {
  const pick = <T extends string>(value: unknown, allowed: readonly { id: T }[], fallback: T): T =>
    allowed.some((a) => a.id === value) ? (value as T) : fallback;
  return {
    id: String(row.id ?? ""),
    code: String(row.code ?? ""),
    doc_type: String(row.doc_type ?? customDocType(String(row.code ?? ""))),
    name_fr: String(row.name_fr ?? ""),
    name_ar: String(row.name_ar ?? ""),
    family: pick(row.family, CUSTOM_DOC_FAMILIES, "autres"),
    lang: pick(row.lang, CUSTOM_DOC_LANGS, "fr"),
    source: pick(row.source, CUSTOM_DOC_SOURCES, "free"),
    inputs: arrayOf(customInputSchema, row.inputs),
    page: normalizePageSetup(row.page),
    numbering: numberingSchema.parse(row.numbering && typeof row.numbering === "object" ? row.numbering : {}),
    is_active: row.is_active !== false,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

/** Code proposed from the French name (« Attestation de stage » → attestation_de_stage). */
export function suggestCode(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/** Field key proposed from a label. */
export function suggestInputKey(label: string) {
  const key = suggestCode(label).replace(/^[0-9_]+/, "");
  return key || "champ";
}

export function emptyCustomDocDef(lang: CustomDocLang = "fr"): CustomDocDefInput {
  return {
    code: "",
    name_fr: "",
    name_ar: "",
    family: "lettres",
    lang,
    source: "employee",
    inputs: [],
    page: { ...DEFAULT_PAGE_SETUP, font_family: lang === "ar" ? "Amiri" : "Roboto" },
    numbering: DEFAULT_NUMBERING,
  };
}

// ---------------------------------------------------------------- references

/** Counter period of the next number: the year, or "" when the numbering never restarts. */
export function numberingPeriod(numbering: Numbering, isoDate: string) {
  return numbering.reset === "yearly" ? isoDate.slice(0, 4) : "";
}

/** Reference from the numbering pattern: {prefix} {code} {seq} {yyyy} {yy} {mm}. */
export function formatReference(
  numbering: Numbering,
  values: { seq: number; isoDate: string; prefix: string; code: string },
): string {
  const [y = "", m = ""] = values.isoDate.split("-");
  const tokens: Record<string, string> = {
    prefix: values.prefix,
    code: values.code.toUpperCase(),
    seq: String(values.seq).padStart(numbering.pad, "0"),
    yyyy: y,
    yy: y.slice(2),
    mm: m,
  };
  return numbering.pattern
    .replace(/\{(\w+)\}/g, (all, key: string) => tokens[key] ?? all)
    .replace(/\/{2,}/g, "/")
    .replace(/^\/|\/$/g, "");
}

// ---------------------------------------------------------------- fields offered by the editor

export type EmployeeFieldMeta = { code: string; label_fr: string; label_ar: string; value_type: string; is_active: boolean };

const field = (group: string) => (path: string, label: string, format?: string): DocField => ({ path, label, group, format });

const DOC_FIELDS = (() => {
  const f = field("Document");
  return [
    f("reference", "Référence (numéro du document)"),
    f("date_doc", "Date du document (jj/mm/aaaa)"),
    f("date_doc_long", "Date du document en toutes lettres"),
    f("fait_a", "Fait à (ville de signature)"),
    f("doc_title", "Titre du document"),
  ];
})();

const COMPANY_DOC_FIELDS = (() => {
  const f = field("Entreprise");
  return [
    f("company.name_fr", "Raison sociale (FR)"),
    f("company.name_ar", "Raison sociale (AR)"),
    f("company.short_name", "Nom court"),
    f("company.address_fr", "Adresse (FR)"),
    f("company.address_ar", "Adresse (AR)"),
    f("company.city_fr", "Ville (FR)"),
    f("company.city_ar", "Ville (AR)"),
    f("company.manager_name_fr", "Nom du gérant (FR)"),
    f("company.manager_name_ar", "Nom du gérant (AR)"),
    f("company.manager_title_fr", "Titre du signataire (FR)"),
    f("company.manager_title_ar", "Titre du signataire (AR)"),
    f("company.hr_service", "Service émetteur"),
    f("company.phone", "Téléphone"),
    f("company.email", "Email"),
    f("company.nif", "NIF"),
    f("company.nis", "NIS"),
    f("company.rc", "Registre du commerce"),
    f("company.ai", "Article d'imposition"),
    f("company.bank", "Banque / RIB"),
  ];
})();

const EMPLOYEE_EXTRA_FIELDS = (() => {
  const f = field("Employé — formules");
  return [
    f("emp.nom", "Nom et prénom (langue du document)"),
    f("emp.nom_complet", "Nom et prénom (latin)"),
    f("emp.nom_complet_ar", "Nom et prénom (arabe)"),
    f("emp.civ", "Civilité (Monsieur / Madame)"),
    f("emp.civ_court", "Civilité abrégée (M. / Mme)"),
    f("emp.civ_ar", "Civilité (السيد / السيدة)"),
    f("emp.e", "« e » au féminin (employé·e)"),
    f("emp.ne", "né / née"),
    f("emp.il", "Il / Elle"),
    f("emp.a_ne", "المولود / المولودة"),
    f("emp.a_works", "يعمل / تعمل"),
    f("emp.a_concerned", "المعني / المعنية"),
  ];
})();

const CONTRACT_FIELDS = (() => {
  const f = field("Contrat");
  return [
    f("ct.numero", "N° du contrat"),
    f("ct.type", "Type de contrat"),
    f("ct.poste", "Poste (langue du document)"),
    f("ct.poste_fr", "Poste (FR)"),
    f("ct.poste_ar", "Poste (AR)"),
    f("ct.debut", "Date de début"),
    f("ct.fin", "Date de fin (vide si indéterminée)"),
    f("ct.affectation", "Affectation"),
    f("ct.salaire_net", "Salaire net mensuel"),
    f("ct.salaire_net_lettres", "Salaire net en lettres (FR)"),
    f("ct.salaire_net_lettres_ar", "Salaire net en lettres (AR)"),
  ];
})();

const LEAVE_FIELDS = (() => {
  const f = field("Congé");
  return [
    f("lv.nature", "Nature du congé (langue du document)"),
    f("lv.nature_fr", "Nature du congé (FR)"),
    f("lv.nature_ar", "Nature du congé (AR)"),
    f("lv.du", "Du"),
    f("lv.au", "Au"),
    f("lv.jours", "Nombre de jours"),
    f("lv.reprise", "Date de reprise"),
    f("lv.motif", "Motif"),
  ];
})();

const MISSION_FIELDS = (() => {
  const f = field("Ordre de mission");
  return [
    f("om.reference", "Référence de l'ordre de mission"),
    f("om.destination", "Destination(s)"),
    f("om.motif", "Objet de la mission"),
    f("om.depart", "Départ (lieu et date)"),
    f("om.retour", "Retour (lieu et date)"),
    f("om.date_depart", "Date de départ"),
    f("om.date_retour", "Date de retour"),
    f("om.moyen", "Moyen de transport"),
    f("om.immat", "Immatriculation du véhicule"),
  ];
})();

const EXIT_FIELDS = (() => {
  const f = field("Sortie");
  return [
    f("ex.date", "Date de sortie"),
    f("ex.motif", "Motif (langue du document)"),
    f("ex.motif_fr", "Motif (FR)"),
    f("ex.motif_ar", "Motif (AR)"),
    f("ex.solde_conge", "Solde de congé (jours)"),
    f("ex.notes", "Observations"),
  ];
})();

/** Every value the template of a definition can show, grouped for the editor's « Champs » panel. */
export function customDocFields(
  def: Pick<CustomDocDefInput, "source" | "inputs">,
  employeeFields: readonly EmployeeFieldMeta[],
): DocField[] {
  const inputs = def.inputs.flatMap((i): DocField[] => {
    const base: DocField = { path: `input.${i.key}`, label: i.label_fr, group: "Saisie à l'impression" };
    if (i.type === "textarea") return [{ ...base, format: "multiline" }];
    if (i.type !== "amount") return [base];
    return [
      base,
      { ...base, path: `input.${i.key}_lettres`, label: `${i.label_fr} en lettres (FR)` },
      { ...base, path: `input.${i.key}_lettres_ar`, label: `${i.label_fr} en lettres (AR)` },
    ];
  });
  const employee =
    def.source === "free"
      ? []
      : [
          ...employeeFields
            .filter((f) => f.is_active && f.code !== "photo_url")
            .map((f) => ({ path: `emp.${f.code}`, label: f.label_fr, group: "Employé" })),
          ...EMPLOYEE_EXTRA_FIELDS,
        ];
  const bySource: Record<CustomDocSource, DocField[]> = {
    employee: CONTRACT_FIELDS.map((f) => ({ ...f, group: "Contrat en cours" })),
    contract: CONTRACT_FIELDS,
    leave: LEAVE_FIELDS,
    mission: MISSION_FIELDS,
    exit: EXIT_FIELDS,
    free: [],
  };
  return [...DOC_FIELDS, ...inputs, ...employee, ...bySource[def.source], ...COMPANY_DOC_FIELDS];
}

export const CUSTOM_DOC_LISTS: DocList[] = [];

// ---------------------------------------------------------------- data

const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

export function slashDate(iso: string | null | undefined) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

export function frenchLongDate(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const day = Number(m[3]);
  return `${day === 1 ? "1er" : day} ${MONTHS_FR[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

export function arabicAmountInWords(value: number) {
  const abs = Math.abs(Math.round(value * 100) / 100);
  const dinars = Math.floor(abs);
  const cents = Math.round((abs - dinars) * 100);
  return `${arabicNumberWords(dinars)} دينار جزائري${cents ? ` و${arabicNumberWords(cents)} سنتيم` : ""}`;
}

export function parseInputAmount(raw: string) {
  const n = Number(String(raw ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type CustomContractRecord = {
  numero: string;
  type_fr: string;
  type_ar: string;
  poste_fr: string;
  poste_ar: string;
  start_date: string | null;
  end_date: string | null;
  affectation: string;
  salaire_net: number | null;
};

export type CustomLeaveRecord = {
  kind_fr: string;
  kind_ar: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
};

export type CustomMissionRecord = {
  reference: string;
  dest1: string;
  dest2: string;
  motif: string;
  lieu_depart: string;
  date_depart: string;
  lieu_retour: string;
  date_retour: string;
  moyen: string;
  immat: string;
};

export type CustomExitRecord = {
  exit_date: string;
  reason_fr: string;
  reason_ar: string;
  leave_balance_days: number | null;
  notes: string;
};

/** Values gathered for one print (display values: catalogue labels and dates already resolved). */
export type CustomDocContext = {
  employee: Record<string, string> | null;
  sex: "M" | "F" | "";
  contract: CustomContractRecord | null;
  leave: CustomLeaveRecord | null;
  mission: CustomMissionRecord | null;
  exit: CustomExitRecord | null;
};

export const EMPTY_CUSTOM_CONTEXT: CustomDocContext = {
  employee: null,
  sex: "",
  contract: null,
  leave: null,
  mission: null,
  exit: null,
};

export type ListLabel = (kind: string, code: string) => { fr: string; ar: string };

/** Display values of the typed fields (dates as jj/mm/aaaa, amounts formatted and in words, list labels). */
export function inputValues(
  inputs: readonly CustomInput[],
  raw: Record<string, string>,
  lang: CustomDocLang,
  listLabel: ListLabel,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const i of inputs) {
    const v = String(raw[i.key] ?? i.default_value ?? "").trim();
    switch (i.type) {
      case "date":
        out[i.key] = slashDate(v) || v;
        break;
      case "amount": {
        const n = v ? parseInputAmount(v) : null;
        out[i.key] = n == null ? v : formatAmount(n);
        out[`${i.key}_lettres`] = n == null ? "" : frenchAmountWords(n);
        out[`${i.key}_lettres_ar`] = n == null ? "" : arabicAmountInWords(n);
        break;
      }
      case "list": {
        if (!v) {
          out[i.key] = "";
          break;
        }
        const label = listLabel(i.list_kind, v);
        out[i.key] = lang === "ar" ? label.ar || label.fr : label.fr || label.ar;
        break;
      }
      case "bool":
        out[i.key] = v === "true" ? (lang === "ar" ? "نعم" : "Oui") : v === "false" ? (lang === "ar" ? "لا" : "Non") : "";
        break;
      default:
        out[i.key] = v;
    }
  }
  return out;
}

function employeeData(ctx: CustomDocContext, lang: CustomDocLang) {
  if (!ctx.employee) return null;
  const e = ctx.employee;
  const f = ctx.sex === "F";
  const latin = [e.last_name, e.first_name].filter(Boolean).join(" ");
  const arabic = [e.last_name_ar, e.first_name_ar].filter(Boolean).join(" ");
  return {
    ...e,
    nom: lang === "ar" ? arabic || latin : latin || arabic,
    nom_complet: latin,
    nom_complet_ar: arabic,
    civ: f ? "Madame" : "Monsieur",
    civ_court: f ? "Mme" : "M.",
    civ_ar: f ? "السيدة" : "السيد",
    e: f ? "e" : "",
    ne: f ? "née" : "né",
    il: f ? "Elle" : "Il",
    a_ne: f ? "المولودة" : "المولود",
    a_works: f ? "تعمل" : "يعمل",
    a_concerned: f ? "المعنية" : "المعني",
  };
}

function contractData(c: CustomContractRecord | null, lang: CustomDocLang) {
  if (!c) return null;
  const net = c.salaire_net;
  return {
    numero: c.numero,
    type: lang === "ar" ? c.type_ar || c.type_fr : c.type_fr || c.type_ar,
    poste: lang === "ar" ? c.poste_ar || c.poste_fr : c.poste_fr || c.poste_ar,
    poste_fr: c.poste_fr,
    poste_ar: c.poste_ar,
    debut: slashDate(c.start_date),
    fin: slashDate(c.end_date),
    affectation: c.affectation,
    salaire_net: net == null ? "" : formatAmount(net),
    salaire_net_lettres: net == null ? "" : frenchAmountWords(net),
    salaire_net_lettres_ar: net == null ? "" : arabicAmountInWords(net),
  };
}

function leaveData(l: CustomLeaveRecord | null, lang: CustomDocLang) {
  if (!l) return null;
  return {
    nature: lang === "ar" ? l.kind_ar || l.kind_fr : l.kind_fr || l.kind_ar,
    nature_fr: l.kind_fr,
    nature_ar: l.kind_ar,
    du: slashDate(l.start_date),
    au: slashDate(l.end_date),
    jours: String(l.days ?? ""),
    reprise: slashDate(addDays(l.end_date, 1)),
    motif: l.reason,
  };
}

function missionData(m: CustomMissionRecord | null) {
  if (!m) return null;
  const join = (...parts: string[]) => parts.filter(Boolean).join(" — ");
  return {
    reference: m.reference,
    destination: join(m.dest1, m.dest2),
    motif: m.motif,
    depart: join(m.lieu_depart, slashDate(m.date_depart)),
    retour: join(m.lieu_retour, slashDate(m.date_retour)),
    date_depart: slashDate(m.date_depart),
    date_retour: slashDate(m.date_retour),
    moyen: m.moyen,
    immat: m.immat,
  };
}

function exitData(x: CustomExitRecord | null, lang: CustomDocLang) {
  if (!x) return null;
  return {
    date: slashDate(x.exit_date),
    motif: lang === "ar" ? x.reason_ar || x.reason_fr : x.reason_fr || x.reason_ar,
    motif_fr: x.reason_fr,
    motif_ar: x.reason_ar,
    solde_conge: x.leave_balance_days == null ? "" : String(x.leave_balance_days),
    notes: x.notes,
  };
}

export type CustomDocPrintOptions = {
  company: HrCompanyProfile;
  letterheadUrl: string;
  reference: string;
  today: string;
  listLabel: ListLabel;
};

/** Data a custom template is rendered with. */
export function customDocData(
  def: Pick<CustomDocDef, "name_fr" | "name_ar" | "lang" | "inputs">,
  ctx: CustomDocContext,
  rawInputs: Record<string, string>,
  opts: CustomDocPrintOptions,
): DocData {
  const ar = def.lang === "ar";
  return {
    reference: opts.reference,
    date_doc: slashDate(opts.today),
    date_doc_long: ar ? arabicLongDate(opts.today) : frenchLongDate(opts.today),
    fait_a: ar ? opts.company.city_ar || opts.company.city_fr : opts.company.city_fr || opts.company.city_ar,
    doc_title: [opts.reference, ar ? def.name_ar || def.name_fr : def.name_fr].filter(Boolean).join(" · "),
    letterhead: opts.letterheadUrl,
    company: opts.company,
    input: inputValues(def.inputs, rawInputs, def.lang, opts.listLabel),
    emp: employeeData(ctx, def.lang),
    ct: contractData(ctx.contract, def.lang),
    lv: leaveData(ctx.leave, def.lang),
    om: missionData(ctx.mission),
    ex: exitData(ctx.exit, def.lang),
  };
}

/** Letterhead printed by a definition (company one, its own image, or none). */
export function customLetterhead(page: PageSetup, companyLetterhead: string) {
  if (page.letterhead === "none") return "";
  if (page.letterhead === "custom") return page.letterhead_url;
  return companyLetterhead;
}

// ---------------------------------------------------------------- sample shown in the designer

const SAMPLE_EMPLOYEE: Record<string, string> = {
  matricule: "24/017",
  last_name: "BENALI",
  first_name: "Karim",
  last_name_ar: "بن علي",
  first_name_ar: "كريم",
  birth_date: "14/03/1990",
  birth_place_fr: "Ouargla",
  birth_place_ar: "ورقلة",
  hired_at: "01/02/2024",
  nss: "90 1234 5678 12",
  nin: "109900123456789000",
  address_fr: "Cité 500 logements, Hassi Messaoud",
  address_ar: "حي 500 مسكن، حاسي مسعود",
  phone: "0661 23 45 67",
  father_name: "Ahmed",
  mother_name: "Fatima Zohra",
};

/** Sample values for the designer: realistic for the usual fields, « [Libellé] » for the others. */
export function customDocSample(
  def: Pick<CustomDocDef, "name_fr" | "name_ar" | "lang" | "inputs" | "source">,
  employeeFields: readonly EmployeeFieldMeta[],
  opts: Pick<CustomDocPrintOptions, "company" | "letterheadUrl">,
): DocData {
  const today = new Date().toISOString().slice(0, 10);
  const employee =
    def.source === "free"
      ? null
      : Object.fromEntries(
          employeeFields
            .filter((f) => f.is_active)
            .map((f) => [f.code, SAMPLE_EMPLOYEE[f.code] ?? `[${f.label_fr}]`]),
        );
  const ctx: CustomDocContext = {
    employee: employee ? { ...SAMPLE_EMPLOYEE, ...employee } : null,
    sex: "M",
    contract: ["employee", "contract"].includes(def.source)
      ? {
          numero: "CT-2026-014",
          type_fr: "Contrat à durée déterminée",
          type_ar: "عقد محدد المدة",
          poste_fr: "Technicien frigoriste",
          poste_ar: "تقني تبريد",
          start_date: "2026-01-01",
          end_date: "2026-12-31",
          affectation: "Chantier Hassi Messaoud",
          salaire_net: 85000,
        }
      : null,
    leave:
      def.source === "leave"
        ? { kind_fr: "Congé annuel", kind_ar: "عطلة سنوية", start_date: "2026-08-02", end_date: "2026-08-21", days: 20, reason: "" }
        : null,
    mission:
      def.source === "mission"
        ? {
            reference: "NF/OM/0042/26",
            dest1: "Alger",
            dest2: "",
            motif: "Réception de matériel",
            lieu_depart: "Hassi Messaoud",
            date_depart: "2026-10-12",
            lieu_retour: "Hassi Messaoud",
            date_retour: "2026-10-15",
            moyen: "Véhicule de service",
            immat: "01234-122-30",
          }
        : null,
    exit:
      def.source === "exit"
        ? { exit_date: "2026-09-30", reason_fr: "Fin de contrat", reason_ar: "نهاية العقد", leave_balance_days: 6, notes: "" }
        : null,
  };
  const raw = Object.fromEntries(
    def.inputs.map((i) => [
      i.key,
      i.default_value ||
        (i.type === "date" ? today : i.type === "amount" ? "45000" : i.type === "number" ? "3" : i.type === "bool" ? "true" : `[${i.label_fr}]`),
    ]),
  );
  return customDocData(def, ctx, raw, {
    ...opts,
    reference: "NF/DOC/0001/26",
    today,
    listLabel: (_kind, code) => ({ fr: code, ar: code }),
  });
}

// ---------------------------------------------------------------- starter templates

export const CUSTOM_STARTERS = [
  { id: "blank", fr: "Page vierge", hint: "Une page avec ses marges, à remplir librement." },
  { id: "letter", fr: "Lettre", hint: "Référence, destinataire, objet, texte et signature." },
  { id: "attestation", fr: "Attestation", hint: "Titre centré, texte avec les données de l'employé, signature." },
  { id: "form", fr: "Formulaire", hint: "Tableau libellé / valeur avec les champs du document." },
  { id: "table", fr: "Tableau", hint: "Titre et tableau à colonnes à compléter." },
] as const;

export type CustomStarter = (typeof CUSTOM_STARTERS)[number]["id"];

const span = (path: string, label: string) => `<span data-field="${path}">${escapeHtml(label)}</span>`;

type StarterText = { dir: "ltr" | "rtl"; html: string };

function starterBody(starter: CustomStarter, def: Pick<CustomDocDefInput, "name_fr" | "name_ar" | "source">, lang: "fr" | "ar"): StarterText {
  const ar = lang === "ar";
  const title = escapeHtml((ar ? def.name_ar || def.name_fr : def.name_fr || def.name_ar).toUpperCase() || (ar ? "عنوان الوثيقة" : "TITRE DU DOCUMENT"));
  const hasEmployee = def.source !== "free";
  const who = hasEmployee
    ? ar
      ? `${span("emp.civ_ar", "السيد")} ${span("emp.nom", "الاسم واللقب")}`
      : `${span("emp.civ", "Monsieur")} ${span("emp.nom", "Nom et prénom")}`
    : ar
      ? "……………"
      : "……………";
  const signature = ar
    ? `<div class="doc-sign" style="margin-top: 14mm; text-align: left;"><p>${span("fait_a", "المدينة")} في ${span("date_doc", "التاريخ")}</p><p style="font-weight: 700;">${span("company.manager_title_ar", "المسير")}</p></div>`
    : `<div class="doc-sign" style="margin-top: 14mm; text-align: right;"><p>Fait à ${span("fait_a", "Ville")}, le ${span("date_doc", "date")}</p><p style="font-weight: 700;">${span("company.manager_title_fr", "Le Gérant")}</p></div>`;
  const ref = `<p style="font-size: 0.9em;">${ar ? "الرقم :" : "Réf. :"} ${span("reference", "NF/DOC/0001/26")}</p>`;
  switch (starter) {
    case "letter":
      return {
        dir: ar ? "rtl" : "ltr",
        html: [
          ref,
          `<p style="text-align: ${ar ? "left" : "right"};">${span("fait_a", ar ? "المدينة" : "Ville")}${ar ? " في " : ", le "}${span("date_doc", "date")}</p>`,
          `<p style="margin-top: 8mm; margin-${ar ? "right" : "left"}: 90mm;">${ar ? "إلى" : "À l'attention de"} ${who}</p>`,
          `<p style="margin-top: 8mm;"><b>${ar ? "الموضوع :" : "Objet :"}</b> ${title}</p>`,
          `<p style="margin-top: 6mm;">${ar ? "تحية طيبة وبعد،" : "Madame, Monsieur,"}</p>`,
          `<p style="text-align: justify;">${ar ? "اكتب نص الرسالة هنا." : "Rédigez ici le texte de la lettre."}</p>`,
          `<p style="text-align: justify;">${ar ? "تقبلوا فائق الاحترام والتقدير." : "Veuillez agréer, Madame, Monsieur, l'expression de nos salutations distinguées."}</p>`,
          signature,
        ].join("\n"),
      };
    case "attestation":
      return {
        dir: ar ? "rtl" : "ltr",
        html: [
          ref,
          `<h1 style="margin: 14mm 0 10mm; text-align: center; font-size: 20pt; letter-spacing: ${ar ? "0" : "2px"};">${title}</h1>`,
          ar
            ? `<p style="text-align: justify;">نحن الممضين أسفله، ${span("company.manager_title_ar", "المسير")} لمؤسسة ${span("company.name_ar", "المؤسسة")}، نشهد أن ${who}${hasEmployee ? `، ${span("emp.a_ne", "المولود")} بتاريخ ${span("emp.birth_date", "تاريخ الميلاد")}` : ""}، ……………</p>`
            : `<p style="text-align: justify;">Nous soussignés, ${span("company.manager_title_fr", "le Gérant")} de la société ${span("company.name_fr", "Société")}, attestons que ${who}${hasEmployee ? `, ${span("emp.ne", "né")} le ${span("emp.birth_date", "date de naissance")}` : ""}, ……………</p>`,
          `<p style="text-align: justify;">${ar ? "سلمت هذه الشهادة للمعني بطلب منه لاستعمالها فيما يسمح به القانون." : "La présente attestation est délivrée à l'intéressé(e) pour servir et valoir ce que de droit."}</p>`,
          signature,
        ].join("\n"),
      };
    case "form": {
      const rows: [string, string, string][] = hasEmployee
        ? [
            ["Matricule", "الرقم", "emp.matricule"],
            ["Nom et prénom", "الاسم واللقب", "emp.nom"],
            ["Date de naissance", "تاريخ الميلاد", "emp.birth_date"],
            ["Poste", "المنصب", "ct.poste"],
          ]
        : [
            ["Objet", "الموضوع", ""],
            ["Date", "التاريخ", "date_doc"],
          ];
      const cell = "border: 1px solid #000; padding: 2mm 3mm;";
      return {
        dir: ar ? "rtl" : "ltr",
        html: [
          `<h1 style="margin: 6mm 0 6mm; text-align: center; font-size: 18pt;">${title}</h1>`,
          ref,
          `<table style="width: 100%; border-collapse: collapse; margin-top: 4mm;"><tbody>${rows
            .map(
              ([fr, arLabel, path]) =>
                `<tr><td style="${cell} width: 38%; font-weight: 700;">${ar ? arLabel : fr}</td><td style="${cell}">${path ? span(path, ar ? arLabel : fr) : "&nbsp;"}</td></tr>`,
            )
            .join("")}</tbody></table>`,
          signature,
        ].join("\n"),
      };
    }
    case "table": {
      const cell = "border: 1px solid #000; padding: 2mm 3mm;";
      const heads = ar ? ["الرقم", "البيان", "الملاحظات"] : ["N°", "Désignation", "Observations"];
      return {
        dir: ar ? "rtl" : "ltr",
        html: [
          `<h1 style="margin: 6mm 0 6mm; text-align: center; font-size: 18pt;">${title}</h1>`,
          `<table style="width: 100%; border-collapse: collapse;"><thead><tr>${heads.map((h) => `<th style="${cell} background: #f1f1f1;">${h}</th>`).join("")}</tr></thead><tbody>${[1, 2, 3, 4, 5]
            .map((i) => `<tr><td style="${cell} width: 12mm; text-align: center;">${i}</td><td style="${cell}">&nbsp;</td><td style="${cell}">&nbsp;</td></tr>`)
            .join("")}</tbody></table>`,
          signature,
        ].join("\n"),
      };
    }
    default:
      return {
        dir: ar ? "rtl" : "ltr",
        html: `<h1 style="margin: 6mm 0; text-align: center; font-size: 18pt;">${title}</h1>\n<p>${ar ? "اكتب هنا." : "Écrivez ici."}</p>`,
      };
  }
}

/** First template of a new document: the starter layout in the document's language(s), with its page setup. */
export function starterTemplate(
  def: Pick<CustomDocDefInput, "name_fr" | "name_ar" | "source" | "lang" | "page">,
  starter: CustomStarter,
  fontStack: string,
): string {
  const langs: ("fr" | "ar")[] = def.lang === "bi" ? ["fr", "ar"] : [def.lang];
  const parts = langs.map((l) => starterBody(starter, def, l));
  const content =
    parts.length === 1
      ? parts[0].html
      : parts
          .map((p, i) => `<div dir="${p.dir}"${i ? ' style="margin-top: 10mm; padding-top: 6mm; border-top: 1px solid #999;"' : ""}>\n${p.html}\n</div>`)
          .join("\n");
  const html = `<!doctype html>
<html lang="${def.lang === "ar" ? "ar" : "fr"}" dir="${def.lang === "ar" ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<title data-field="doc_title">${escapeHtml(def.name_fr)}</title>
<style>
h1, h2, h3 { margin: 0 0 4mm; }
.doc-header p, .doc-footer p { margin: 0; font-size: 9pt; }
.doc-footer { text-align: center; color: #333; }
</style>
</head>
<body>
<div class="doc-header"><p>${span("company.name_fr", "Raison sociale")}</p></div>
<div class="doc-footer"><p>${span("company.address_fr", "Adresse")} · ${span("company.phone", "Téléphone")}</p></div>
<table class="doc-frame"><thead><tr><td><div class="doc-head-space"></div></td></tr></thead><tbody><tr><td class="doc-body sheet">
${content}
</td></tr></tbody><tfoot><tr><td><div class="doc-foot-space"></div></td></tr></tfoot></table>
</body>
</html>`;
  return applyPageSetup(html, { page: def.page, lang: def.lang, fontStack });
}
