import { z } from "zod";
import { leaveKindLabel, returnDate } from "@/lib/hr/leave";
import { OM_DONNEUR, OM_FAIT_A } from "@/lib/hr/mission-order";

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

export function leaveTitlePayload(fields: LeaveTitleFields): Record<LeaveTitleFieldKey, string | null> {
  return {
    ...fields,
    donneur: fields.donneur ?? OM_DONNEUR,
    faitA: fields.faitA ?? OM_FAIT_A,
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

export function leaveNature(kind: string) {
  const label = leaveKindLabel(kind);
  return { fr: label.fr, ar: label.ar };
}

export function leaveReprise(dateFin: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateFin) ? returnDate(dateFin) : "";
}

export function leaveDaysLabel(jours: number) {
  if (!jours) return "";
  const value = String(jours).replace(".", ",");
  return `${value} ${jours > 1 ? "jours" : "jour"}`;
}
