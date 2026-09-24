import type { HrEmployeeFiche, HrEmployeeField } from "@/lib/actions/hr-employees";

/** Situations familiales où le nombre d'enfants s'applique (Marié / Divorcé / Veuf). */
export const MARITAL_WITH_CHILDREN = new Set(["M", "D", "V"]);

export function maritalAllowsChildren(maritalCode: unknown): boolean {
  return MARITAL_WITH_CHILDREN.has(String(maritalCode ?? "").trim().toUpperCase());
}

/** Flat string map used by fiche UI / PDF (data-driven from hr_employee_fields). */
export function valuesFromFicheRecord(
  row: HrEmployeeFiche,
  fields: HrEmployeeField[],
): Record<string, string> {
  const values: Record<string, string> = { id: row.id };
  for (const field of fields) {
    let raw: unknown;
    if (field.storage_group === "extra") raw = row.attrs?.[field.code];
    else raw = (row as unknown as Record<string, unknown>)[field.code];
    values[field.code] = raw == null || raw === "" ? "" : String(raw);
    if (field.code === "irg_category" && !values[field.code]) {
      values[field.code] = "STANDARD";
    }
  }
  return values;
}

/** Champ visible / applicable selon le contexte de la fiche. */
export function isFieldApplicable(
  field: Pick<HrEmployeeField, "code">,
  values: Record<string, unknown>,
): boolean {
  if (field.code === "children_count") {
    return maritalAllowsChildren(values.marital_code);
  }
  return true;
}

/** Validate required fields from DB flags — no hardcoded required list. */
export function missingRequiredFields(
  values: Record<string, unknown>,
  fields: HrEmployeeField[],
): HrEmployeeField[] {
  return fields.filter((f) => {
    if (!f.is_active || !f.is_required) return false;
    if (f.code === "photo_url") return false;
    if (!isFieldApplicable(f, values)) return false;
    const v = values[f.code];
    if (v == null) return true;
    return String(v).trim() === "";
  });
}
