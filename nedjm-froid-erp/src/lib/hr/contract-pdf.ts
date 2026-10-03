import { z } from "zod";
import { similarNameScore } from "@/lib/hr/attendance-archive";
import { matriculeKey } from "@/lib/hr/contract-import";

export const CONTRACT_PDF_MAX_BYTES = 14 * 1024 * 1024;
export const CONTRACT_PDF_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type ContractPdfMime = (typeof CONTRACT_PDF_MIME)[number];

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .catch(null);
const text = z.string().trim().max(300).nullable().catch(null);
const money = z.number().min(0).max(1_000_000_000).nullable().catch(null);

/** What the model reads in a work contract; every field is null when the document does not say it. */
export const contractPdfSchema = z.object({
  contract_number: text,
  contract_kind: z.enum(["CDD", "CDI", "OTHER"]).nullable().catch(null),
  last_name_ar: text,
  first_name_ar: text,
  last_name_latin: text,
  first_name_latin: text,
  serial_number: text,
  birth_date: isoDate,
  poste_ar: text,
  poste_fr: text,
  start_date: isoDate,
  end_date: isoDate,
  net_salary_monthly: money,
  recup_monthly: money,
  absence_deduction_daily: money,
  site: text,
});
export type ContractPdfRead = z.infer<typeof contractPdfSchema>;

const S = { type: ["string", "null"] };
const N = { type: ["number", "null"] };

export const CONTRACT_PDF_JSON_SCHEMA = {
  type: "object",
  properties: {
    contract_number: S,
    contract_kind: { type: ["string", "null"], enum: ["CDD", "CDI", "OTHER", null] },
    last_name_ar: S,
    first_name_ar: S,
    last_name_latin: S,
    first_name_latin: S,
    serial_number: S,
    birth_date: S,
    poste_ar: S,
    poste_fr: S,
    start_date: S,
    end_date: S,
    net_salary_monthly: N,
    recup_monthly: N,
    absence_deduction_daily: N,
    site: S,
  },
  required: [
    "contract_number",
    "contract_kind",
    "last_name_ar",
    "first_name_ar",
    "last_name_latin",
    "first_name_latin",
    "serial_number",
    "birth_date",
    "poste_ar",
    "poste_fr",
    "start_date",
    "end_date",
    "net_salary_monthly",
    "recup_monthly",
    "absence_deduction_daily",
    "site",
  ],
};

export function contractPdfPrompt(fileName: string): string {
  return [
    "Tu lis un contrat de travail algérien, souvent rédigé en arabe et scanné. Réponds uniquement avec le JSON demandé.",
    "N'invente rien : un champ absent du document vaut null.",
    "- contract_number : numéro du contrat (رقم), tel qu'écrit (ex. 2025/108).",
    "- contract_kind : CDD pour « عقد عمل محدد المدة » ou une date de fin, CDI pour « غير محدد المدة », sinon OTHER.",
    "- last_name_ar / first_name_ar : le salarié (pas l'employeur ni le gérant). En Algérie l'اللقب (nom) précède le prénom : « الشين أبوبكر » → nom « الشين », prénom « أبوبكر ».",
    `- last_name_latin / first_name_latin : le nom en lettres latines s'il est écrit ; sinon la translittération algérienne usuelle en majuscules (ex. CHINE / ABOUBAKR). Le nom du fichier peut le contenir : « ${fileName} ».`,
    "- serial_number : « الرقم التسلسلي » ou matricule du salarié, tel qu'écrit.",
    "- birth_date, start_date (ابتداء من), end_date (إلى غاية) : format AAAA-MM-JJ. Les documents écrivent souvent AAAA/MM/JJ ou « 28 ديسمبر 1991 ».",
    "- poste_ar : le poste tel qu'écrit ; poste_fr : sa traduction française courte en majuscules (ex. INGENIEUR EN FROID ET CLIMATISATION).",
    "- net_salary_monthly : salaire mensuel net à payer (الأجر الصافي) en dinars, nombre sans séparateur.",
    "- recup_monthly : montant de la période de récupération / العطلة التعويضية.",
    "- absence_deduction_daily : retenue par jour d'absence non justifiée (اقتطاع عن كل يوم غياب).",
    "- site : chantier ou lieu d'affectation s'il est nommé.",
  ].join("\n");
}

function arabicKey(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[إأآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\u0621-\u064A]/g, "");
}

export type PdfEmployee = {
  id: string;
  matricule: string;
  last_name: string;
  first_name: string;
  last_name_ar?: string | null;
  first_name_ar?: string | null;
  birth_date?: string | null;
};

/**
 * Employee of the contract: birth date and names (Arabic, Latin, file name) each add to a score;
 * a match needs a clear winner, otherwise the closest employees are proposed.
 */
export function matchPdfEmployee(read: ContractPdfRead, employees: readonly PdfEmployee[], fileName = "") {
  const stem = fileName.replace(/\.[a-z0-9]+$/i, "").replace(/\(\d+\)/g, " ");
  const latin = [read.last_name_latin, read.first_name_latin].filter(Boolean).join(" ");
  const ar = arabicKey(`${read.last_name_ar ?? ""}${read.first_name_ar ?? ""}`);
  const serial = (read.serial_number ?? "").match(/\d+/)?.[0];
  const scored = employees
    .map((e) => {
      const full = `${e.last_name} ${e.first_name}`;
      let score = 0;
      if (read.birth_date && e.birth_date?.slice(0, 10) === read.birth_date) score += 3;
      const own = arabicKey(`${e.last_name_ar ?? ""}${e.first_name_ar ?? ""}`);
      if (ar && own && ar === own) score += 3;
      score += Math.max(latin ? similarNameScore(latin, full) : 0, stem ? similarNameScore(stem, full) : 0);
      if (serial && matriculeKey(e.matricule).startsWith(`${Number(serial)}/`)) score += 1;
      return { id: e.id, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  const clear = best && best.score >= 2 && (!second || best.score > second.score);
  return { employee_id: clear ? best.id : null, candidates: scored.slice(0, 5).map((s) => s.id) };
}

const frDate = (iso: string) => iso.split("-").reverse().join("/");

/** Contract form values proposed from the reading, with what the user must check. */
export function contractFormFromPdf(read: ContractPdfRead) {
  const warnings: string[] = [];
  let start = read.start_date ?? "";
  if (start && !start.endsWith("-01")) {
    const first = `${start.slice(0, 7)}-01`;
    warnings.push(`Début lu le ${frDate(start)}, ramené au ${frDate(first)} (un contrat commence le 1er du mois).`);
    start = first;
  }
  if (!start) warnings.push("Date de début non lue : saisissez-la.");
  if (!read.site) warnings.push("Chantier non indiqué dans le contrat : choisissez l'affectation.");
  if (read.net_salary_monthly == null) warnings.push("Salaire net non lu : saisissez-le.");
  return {
    form: {
      contract_type_code: read.contract_kind === "CDI" ? "CDI" : read.contract_kind === "CDD" ? "CDD" : "",
      poste_ar: read.poste_ar ?? "",
      poste_fr: (read.poste_fr ?? "").toLocaleUpperCase("fr-DZ"),
      start_date: start,
      end_date: read.end_date ?? "",
      salaire_net_ref_monthly: read.net_salary_monthly == null ? "" : String(read.net_salary_monthly),
      salaire_net_recup_monthly: read.recup_monthly == null ? "" : String(read.recup_monthly),
      retenue: read.absence_deduction_daily == null ? "" : String(read.absence_deduction_daily),
    },
    warnings,
  };
}
