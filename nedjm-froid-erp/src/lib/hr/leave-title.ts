import { z } from "zod";
import type { DocData } from "@/lib/doc/engine";
import { documentReference, type HrCompanyProfile } from "@/lib/hr/company-profile";
import { listLabel, type LeaveKindOption, type PrintLists } from "@/lib/hr/hr-lists";
import { returnDate } from "@/lib/hr/leave";
import { formatOmDate, sheetDocData, type SheetDefaults } from "@/lib/hr/mission-order";

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

/** Print fields of a titre de congé; the leave itself (nature, dates, days) comes from the approved request. */
export const leaveTitleFieldsSchema = z.object({
  matricule: z.string().trim().min(1, { message: "Le matricule et le nom sont obligatoires." }).max(40),
  nom: z.string().trim().min(1, { message: "Le matricule et le nom sont obligatoires." }).max(80),
  prenom: optText(80),
  affectation: optText(160),
  codeAffectation: optText(40),
  poste: optText(160),
  moyen: optText(80),
  modele: optText(80),
  immat: optText(40),
  kmDepart: optText(20),
  kmRetour: optText(20),
  pieceType: optText(80),
  pieceNum: optText(40),
  donneur: optText(80),
  pieceFonction: optText(160),
  faitA: optText(40),
  dateDoc: optDate,
});

export type LeaveTitleFields = z.infer<typeof leaveTitleFieldsSchema>;
export type LeaveTitleFieldKey = keyof LeaveTitleFields;
export const LEAVE_TITLE_FIELD_KEYS = Object.keys(leaveTitleFieldsSchema.shape) as LeaveTitleFieldKey[];

export type LeaveTitleLeave = {
  kind: string;
  dateDebut: string;
  dateFin: string;
  jours: number;
};

export function leaveTitlePayload(
  fields: LeaveTitleFields,
  defaults: SheetDefaults,
): Record<LeaveTitleFieldKey, string | null> {
  return {
    ...fields,
    donneur: fields.donneur ?? (defaults.hr_service || null),
    faitA: fields.faitA ?? (defaults.city_short || null),
  };
}

/** Leave facts stored on the LEAVE correspondence by `hr_leave_decide`. */
export function leaveOfCorrespondence(row: {
  start_date: string | null;
  end_date: string | null;
  payload: Record<string, unknown>;
}): LeaveTitleLeave {
  const dateDebut = (row.start_date ?? "").slice(0, 10);
  const dateFin = (row.end_date ?? "").slice(0, 10);
  const days = Number(row.payload.days);
  return {
    kind: typeof row.payload.kind === "string" ? row.payload.kind : "",
    dateDebut,
    dateFin,
    jours: Number.isFinite(days) && days > 0 ? days : 0,
  };
}

export function leaveNature(kinds: readonly LeaveKindOption[], kind: string) {
  return listLabel(kinds, kind);
}

export function leaveReprise(dateFin: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateFin) ? returnDate(dateFin) : "";
}

export function leaveDaysLabel(jours: number) {
  if (!jours) return "";
  const value = String(jours).replace(".", ",");
  return `${value} ${jours > 1 ? "jours" : "jour"}`;
}

/** "000005/26" → "NF/CNG/0005/26". */
export function leaveTitleReference(numero: string | null | undefined, company: Pick<HrCompanyProfile, "doc_prefix">) {
  return documentReference(company.doc_prefix, "CNG", numero);
}

export function leaveTitleDocData(
  fields: LeaveTitleFields,
  leave: LeaveTitleLeave,
  numero: string | null | undefined,
  company: HrCompanyProfile,
  letterheadUrl: string,
  lists: PrintLists,
): DocData {
  const periode =
    leave.dateDebut && leave.dateFin ? `Du ${formatOmDate(leave.dateDebut)} au ${formatOmDate(leave.dateFin)}` : "";
  const nature = leaveNature(lists.leaveKinds, leave.kind);
  return {
    ...sheetDocData(fields, company, letterheadUrl, lists),
    numero: numero ?? "",
    reference: leaveTitleReference(numero, company),
    doc_title: `TITRE DE CONGÉ ${numero ?? ""}`.trim(),
    nature: nature.fr,
    nature_ar: nature.ar,
    date_debut: formatOmDate(leave.dateDebut),
    date_fin: formatOmDate(leave.dateFin),
    periode,
    jours: leaveDaysLabel(leave.jours),
    reprise: formatOmDate(leaveReprise(leave.dateFin)),
  };
}
