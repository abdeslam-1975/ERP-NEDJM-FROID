import {
  getHrEmployeeFiche,
  upsertHrEmployee,
  type HrEmployeeFiche,
  type HrEmployeeField,
} from "@/lib/actions/hr-employees";
import { archiveEmployeeFicheRenseignements, listHrFilesForEmployee } from "@/lib/actions/hr-documents";
import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import { missingRequiredFields } from "@/lib/hr/employee-field-utils";
import { employeePayloadFromValues } from "@/lib/hr/employee-payload";
import { normalizeFicheValues, validateFicheConstraints } from "@/lib/hr/employee-fiche-constraints";
import { missingRequiredDocuments } from "@/lib/hr/required-documents";

function asText(value: unknown) {
  if (value == null || value === "") return "";
  return String(value);
}

/** Form values of an employee card, one per field (catalogue fields keep their code). */
export function valuesFromFiche(row: HrEmployeeFiche, fields: HrEmployeeField[]): Record<string, string> {
  const values: Record<string, string> = { id: row.id };
  for (const field of fields) {
    const raw =
      field.storage_group === "extra"
        ? row.attrs?.[field.code]
        : (row as unknown as Record<string, unknown>)[field.code];
    values[field.code] = asText(raw);
    if (field.code === "irg_category" && !values[field.code]) values[field.code] = "STANDARD";
  }
  return values;
}

export function emptyFicheValues(activeFields: HrEmployeeField[]) {
  const empty: Record<string, string> = {};
  for (const field of activeFields) {
    empty[field.code] =
      field.code === "status"
        ? "ACTIVE"
        : field.code === "irg_category"
          ? "STANDARD"
          : field.code === "nationality"
            ? "Algérienne"
            : "";
  }
  return empty;
}

/** Normalised values and the first blocking issue (required fields, then field constraints). */
export function checkFicheValues(values: Record<string, string>, activeFields: HrEmployeeField[]) {
  const normalized = normalizeFicheValues(values) as Record<string, string>;
  const missing = missingRequiredFields(normalized, activeFields);
  if (missing.length) {
    return {
      normalized,
      error: `Champs obligatoires manquants : ${missing
        .slice(0, 6)
        .map((f) => f.label_fr || f.label_ar || f.code)
        .join(", ")}`,
    };
  }
  const issues = validateFicheConstraints(normalized);
  return { normalized, error: issues.length ? issues.map((i) => i.message).join(" ") : null };
}

export type FicheSaveResult =
  | { ok: true; fiche: HrEmployeeFiche | null; info: string }
  | { ok: false; error: string };

/** Saves checked values, then archives the fiche de renseignements PDF (an archive failure never fails the save). */
export async function saveEmployeeFiche(
  normalized: Record<string, string>,
  activeFields: HrEmployeeField[],
  ficheCatalogs: CatalogItem[],
): Promise<FicheSaveResult> {
  if (normalized.id) {
    const files = await listHrFilesForEmployee(normalized.id);
    if (files.ok) {
      const missingDocs = missingRequiredDocuments(
        ficheCatalogs,
        files.data.map((f) => f.doc_type_code),
      );
      if (missingDocs.length) {
        return {
          ok: false,
          error: `Documents obligatoires manquants : ${missingDocs
            .slice(0, 6)
            .map((d) => d.label_fr || d.code)
            .join(", ")}. Onglet Documents.`,
        };
      }
    }
  }
  const result = await upsertHrEmployee(employeePayloadFromValues(normalized, activeFields));
  if (!result.ok) return { ok: false, error: result.error };
  const fiche = await getHrEmployeeFiche(result.data.id);
  let info = "Fiche enregistrée.";
  try {
    const archived = await archiveEmployeeFicheRenseignements(result.data.id);
    info = archived.ok
      ? `Fiche enregistrée. PDF : ${archived.data.file_name}`
      : `Fiche enregistrée. PDF plus tard : ${archived.error}`;
  } catch {
    info = "Fiche enregistrée. Génération PDF reportée.";
  }
  return { ok: true, fiche: fiche.ok ? fiche.data : null, info };
}
