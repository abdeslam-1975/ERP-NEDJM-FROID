import type { HrEmployeeField } from "@/lib/actions/hr-employees";
import { maritalAllowsChildren } from "@/lib/hr/employee-field-utils";

/** Fiche values (one string per field code) → payload accepted by upsertHrEmployee. */
export function employeePayloadFromValues(
  values: Record<string, string>,
  activeFields: HrEmployeeField[],
  extraAttrs: Record<string, unknown> = {},
): Record<string, unknown> {
  const attrs: Record<string, unknown> = { ...extraAttrs };
  const payload: Record<string, unknown> = {
    id: values.id || undefined,
    irg_category: values.irg_category || "STANDARD",
    status: values.status || "ACTIVE",
  };
  for (const field of activeFields) {
    const v = values[field.code] ?? "";
    if (field.storage_group === "extra") {
      attrs[field.code] = v === "" ? null : v;
    } else if (field.code === "experience_years" || field.code === "children_count") {
      if (field.code === "children_count" && !maritalAllowsChildren(values.marital_code)) {
        payload.children_count = null;
      } else {
        payload[field.code] = v === "" ? null : Number(v);
      }
    } else if (field.code === "irg_category") {
      payload.irg_category = v || "STANDARD";
    } else if (field.code === "status") {
      payload.status = v || "ACTIVE";
    } else {
      payload[field.code] = v;
    }
  }
  payload.attrs = attrs;
  return payload;
}
