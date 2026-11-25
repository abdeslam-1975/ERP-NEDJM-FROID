import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import type { HrEmployeeField } from "@/lib/actions/hr-employees";
import { isFieldApplicable, missingRequiredFields } from "@/lib/hr/employee-field-utils";
import {
  isDocumentRequiredForSave,
  isEmployeeUploadDocument,
} from "@/lib/hr/required-documents";

/** كل الوثائق/الحقول، أو الإجبارية فقط، أو ناقص. */
export type CompletionLevel = "all" | "required" | "missing";

export type FicheCompletion = {
  documents: CompletionLevel;
  fields: CompletionLevel;
};

export const COMPLETION_LABELS: Record<
  "documents" | "fields",
  Record<CompletionLevel, { fr: string; ar: string }>
> = {
  documents: {
    all: { fr: "Tous les documents", ar: "كل الوثائق مكتملة" },
    required: { fr: "Documents obligatoires seulement", ar: "الوثائق الإجبارية فقط" },
    missing: { fr: "Documents incomplets", ar: "وثائق ناقصة" },
  },
  fields: {
    all: { fr: "Tous les champs", ar: "كل الحقول ممتلئة" },
    required: { fr: "Champs obligatoires seulement", ar: "الحقول الإجبارية فقط" },
    missing: { fr: "Champs incomplets", ar: "حقول ناقصة" },
  },
};

function filled(value: unknown): boolean {
  if (value == null) return false;
  return String(value).trim() !== "";
}

export function assessFicheCompletion(input: {
  values: Record<string, unknown>;
  fields: HrEmployeeField[];
  catalogs: CatalogItem[];
  uploadedDocTypeCodes: Iterable<string>;
}): FicheCompletion {
  const applicable = input.fields.filter(
    (field) => field.is_active && isFieldApplicable(field, input.values),
  );
  const emptyFields = applicable.filter((field) => !filled(input.values[field.code]));
  const fields: CompletionLevel =
    emptyFields.length === 0
      ? "all"
      : missingRequiredFields(input.values, input.fields).length === 0
        ? "required"
        : "missing";

  const slots = input.catalogs.filter(
    (item) =>
      item.kind === "document_type" &&
      item.is_active &&
      isEmployeeUploadDocument(item),
  );
  const have = new Set(
    [...input.uploadedDocTypeCodes].map((code) => String(code).trim()).filter(Boolean),
  );
  const missingSlots = slots.filter((slot) => !have.has(slot.code));
  const missingRequired = slots.filter(
    (slot) => isDocumentRequiredForSave(slot) && !have.has(slot.code),
  );
  const documents: CompletionLevel =
    missingSlots.length === 0 ? "all" : missingRequired.length === 0 ? "required" : "missing";

  return { documents, fields };
}

export function formatFicheDoneAt(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-DZ", {
    timeZone: "Africa/Algiers",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function compareCompletedFiches(
  a: { fiche_done_at: string | null; matricule: string },
  b: { fiche_done_at: string | null; matricule: string },
): number {
  const ad = a.fiche_done_at ?? "";
  const bd = b.fiche_done_at ?? "";
  if (ad !== bd) return bd.localeCompare(ad);
  return a.matricule.localeCompare(b.matricule, "fr", { numeric: true });
}
