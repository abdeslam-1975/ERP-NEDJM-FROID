import { z } from "zod";
import type { DocData } from "@/lib/doc/engine";
import { documentReference, type HrCompanyProfile } from "@/lib/hr/company-profile";
import { transportBox, type PrintLists } from "@/lib/hr/hr-lists";

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const optDate = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

export const missionOrderFieldsSchema = z
  .object({
    matricule: z.string().trim().min(1, { message: "Le matricule et le nom sont obligatoires." }).max(40),
    nom: z.string().trim().min(1, { message: "Le matricule et le nom sont obligatoires." }).max(80),
    prenom: optText(80),
    affectation: optText(160),
    codeAffectation: optText(40),
    poste: optText(160),
    dest1: optText(200),
    dest2: optText(200),
    lieuDepart: optText(200),
    dateDepart: optDate,
    heureDepart: optText(8),
    lieuRetour: optText(200),
    dateRetour: optDate,
    heureRetour: optText(8),
    motif: optText(500),
    moyen: optText(80),
    modele: optText(80),
    immat: optText(40),
    kmDepart: optText(20),
    kmRetour: optText(20),
    pieceType: optText(80),
    pieceNum: optText(40),
    pieceDelivre: optDate,
    pieceFonction: optText(160),
    pieceLieu: optText(120),
    donneur: optText(80),
    faitA: optText(40),
    dateDoc: optDate,
  })
  .superRefine((v, ctx) => {
    if (v.dateDepart && v.dateRetour && v.dateRetour < v.dateDepart) {
      ctx.addIssue({
        code: "custom",
        message: "La date de retour précède le départ.",
        path: ["dateRetour"],
      });
    }
  });

export type MissionOrderFields = z.infer<typeof missionOrderFieldsSchema>;

export type MissionContractHint = {
  employee_id: string;
  site_id: string;
  poste_fr: string | null;
  poste_ar: string | null;
  affectation_principale: boolean;
  status: string;
  start_date: string;
};

const OPEN_CONTRACT = new Set(["ACTIVE", "DRAFT", "SUSPENDED"]);

export function pickMissionContract<T extends MissionContractHint>(
  contracts: T[],
  employeeId: string,
): T | null {
  if (!employeeId) return null;
  const mine = contracts.filter((c) => c.employee_id === employeeId);
  const open = mine.filter((c) => OPEN_CONTRACT.has(c.status));
  const pool = open.length > 0 ? open : mine;
  const principal = pool.find((c) => c.affectation_principale);
  if (principal) return principal;
  return [...pool].sort((a, b) => b.start_date.localeCompare(a.start_date))[0] ?? null;
}

/** Issuer and place printed when the order leaves them empty. */
export type SheetDefaults = Pick<HrCompanyProfile, "hr_service" | "city_short">;
export type MissionDefaults = SheetDefaults & Pick<HrCompanyProfile, "default_departure">;

export function missionPayload(fields: MissionOrderFields, defaults: SheetDefaults): Record<string, string | null> {
  return {
    matricule: fields.matricule,
    nom: fields.nom,
    prenom: fields.prenom,
    affectation: fields.affectation,
    codeAffectation: fields.codeAffectation,
    poste: fields.poste,
    dest1: fields.dest1,
    dest2: fields.dest2,
    lieuDepart: fields.lieuDepart,
    dateDepart: fields.dateDepart,
    heureDepart: fields.heureDepart,
    lieuRetour: fields.lieuRetour,
    dateRetour: fields.dateRetour,
    heureRetour: fields.heureRetour,
    motif: fields.motif,
    moyen: fields.moyen,
    modele: fields.modele,
    immat: fields.immat,
    kmDepart: fields.kmDepart,
    kmRetour: fields.kmRetour,
    pieceType: fields.pieceType,
    pieceNum: fields.pieceNum,
    pieceDelivre: fields.pieceDelivre,
    pieceFonction: fields.pieceFonction,
    pieceLieu: fields.pieceLieu,
    donneur: fields.donneur ?? (defaults.hr_service || null),
    faitA: fields.faitA ?? (defaults.city_short || null),
    dateDoc: fields.dateDoc,
  };
}

export function formatEstablishmentDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const day = iso.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const [y, m, d] = day.split("-");
    return `${d}/${m}/${y}`;
  }
  try {
    return new Intl.DateTimeFormat("fr-DZ", {
      timeZone: "Africa/Algiers",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatOmDate(iso: string | null | undefined) {
  if (!iso) return "";
  const parts = String(iso).split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function todayIsoAlgiers(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers" }).format(now);
}

export function addDaysIso(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export type MissionDateField = "dateDepart" | "dateRetour";

type MissionDates = {
  dateDepart?: string | null;
  dateRetour?: string | null;
};

/**
 * Departure must be today or later, return strictly after departure (hence in the future).
 * An empty return leaves the mission open (« Fin de mission »); closing a saved open order
 * only needs a return after the departure.
 * Dates already stored on an existing order are not re-checked against `today`,
 * so an ordre can still be completed (km, heures) after the mission started.
 */
export function missionDateIssue(
  value: MissionDates,
  today: string,
  original?: MissionDates | null,
): { field: MissionDateField; message: string } | null {
  const depart = value.dateDepart || "";
  const retour = value.dateRetour || "";
  if (!depart) {
    return { field: "dateDepart", message: "Date de départ obligatoire. · تاريخ الذهاب إجباري." };
  }
  const departKept = Boolean(original) && (original?.dateDepart || "") === depart;
  const retourKept = Boolean(original) && (original?.dateRetour || "") === retour;
  const closingOpen = Boolean(original) && !original?.dateRetour;
  if (departKept && retourKept) return null;
  if (!departKept && depart < today) {
    return {
      field: "dateDepart",
      message:
        "La date de départ doit être aujourd'hui ou une date future. · تاريخ الذهاب يجب أن يكون اليوم أو تاريخًا مستقبليًا.",
    };
  }
  if (!retour) return null;
  if (!retourKept && !closingOpen && retour <= today) {
    return {
      field: "dateRetour",
      message: "La date de retour doit être une date future. · تاريخ العودة يجب أن يكون تاريخًا مستقبليًا.",
    };
  }
  if (retour <= depart) {
    return {
      field: "dateRetour",
      message:
        "La date de retour doit être postérieure à la date de départ. · تاريخ العودة يجب أن يكون بعد تاريخ الذهاب.",
    };
  }
  return null;
}

export function missionDateBounds(value: MissionDates, today: string, original?: MissionDates | null) {
  const departKept = Boolean(original) && (original?.dateDepart || "") === (value.dateDepart || "");
  const minDepart = departKept ? undefined : today;
  const afterDepart = value.dateDepart ? addDaysIso(value.dateDepart, 1) : "";
  const tomorrow = addDaysIso(today, 1);
  const closingOpen = Boolean(original) && !original?.dateRetour;
  const minRetour = closingOpen ? afterDepart || undefined : afterDepart > tomorrow ? afterDepart : tomorrow;
  return { minDepart, minRetour };
}

/** Printed in place of the return date of an open-ended ordre de mission. */
export function openReturnLabel(company: Pick<HrCompanyProfile, "mission_open_return">) {
  return company.mission_open_return.trim();
}

export function missionPointageHref(input: {
  employeeId: string;
  siteId: string | null;
  dateDepart: string | null;
}) {
  const params = new URLSearchParams({ employee: input.employeeId });
  if (input.siteId) params.set("site", input.siteId);
  if (input.dateDepart) params.set("mois", input.dateDepart.slice(0, 7));
  return `/rh/presence?${params.toString()}`;
}

export function omJoin(...parts: Array<string | null | undefined>) {
  return parts.filter((part) => part && String(part).trim() !== "").join(" — ");
}

export type SheetDocFields = Pick<
  MissionOrderFields,
  | "matricule"
  | "nom"
  | "prenom"
  | "affectation"
  | "codeAffectation"
  | "poste"
  | "moyen"
  | "modele"
  | "immat"
  | "kmDepart"
  | "kmRetour"
  | "pieceType"
  | "pieceNum"
  | "pieceFonction"
  | "donneur"
  | "faitA"
  | "dateDoc"
>;

/** Values shared by the ordre de mission and the titre de congé templates. */
export function sheetDocData(
  fields: SheetDocFields,
  company: HrCompanyProfile,
  letterheadUrl: string,
  lists: PrintLists,
): DocData {
  const km = (value: string | null) => (value ? `${value} km` : "");
  const mode = transportBox(lists.transportModes, fields.moyen);
  return {
    letterhead: letterheadUrl,
    company,
    matricule: fields.matricule,
    nom_complet: `${fields.nom} ${fields.prenom ?? ""}`.trim().toUpperCase(),
    affectation: fields.affectation,
    code_affectation: fields.codeAffectation,
    poste: fields.poste,
    moyen: fields.moyen,
    mode_tous: mode === "tous" ? "✓" : "",
    mode_service: mode === "service" ? "✓" : "",
    modele: fields.modele,
    immat: fields.immat,
    km_depart: km(fields.kmDepart),
    km_retour: km(fields.kmRetour),
    piece_type: fields.pieceType,
    piece_num: fields.pieceNum,
    piece_fonction: fields.pieceFonction,
    donneur: fields.donneur,
    fait_a: fields.faitA || company.city_short,
    date_doc: formatOmDate(fields.dateDoc),
  };
}

export function missionReference(numero: string | null | undefined, company: Pick<HrCompanyProfile, "doc_prefix">) {
  return documentReference(company.doc_prefix, "OM", numero);
}

export function missionDocData(
  fields: MissionOrderFields & { numero?: string | null },
  company: HrCompanyProfile,
  letterheadUrl: string,
  lists: PrintLists,
): DocData {
  const retour = fields.dateRetour ? formatOmDate(fields.dateRetour) : fields.dateDepart ? openReturnLabel(company) : "";
  const numero = fields.numero ?? "";
  return {
    ...sheetDocData(fields, company, letterheadUrl, lists),
    numero,
    reference: missionReference(numero, company),
    doc_title: `ORDRE DE MISSION ${numero}`.trim(),
    dest1: fields.dest1,
    dest2: fields.dest2,
    destinations: omJoin(fields.dest1, fields.dest2),
    depart: omJoin(fields.lieuDepart, formatOmDate(fields.dateDepart)),
    retour: omJoin(fields.lieuRetour, retour),
    depart_heure: omJoin(fields.lieuDepart, formatOmDate(fields.dateDepart), fields.heureDepart),
    retour_heure: omJoin(fields.lieuRetour, retour, fields.dateRetour ? fields.heureRetour : null),
    motif: fields.motif,
    piece_delivre: formatOmDate(fields.pieceDelivre),
    piece_lieu: fields.pieceLieu,
  };
}
