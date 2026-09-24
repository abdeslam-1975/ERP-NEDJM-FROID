import { describe, expect, it } from "vitest";
import {
  isFieldApplicable,
  maritalAllowsChildren,
  missingRequiredFields,
} from "@/lib/hr/employee-field-utils";
import type { HrEmployeeField } from "@/lib/actions/hr-employees";

function field(partial: Partial<HrEmployeeField> & { code: string }): HrEmployeeField {
  return {
    id: partial.id ?? "00000000-0000-0000-0000-000000000001",
    code: partial.code,
    label_ar: partial.label_ar ?? partial.code,
    label_fr: partial.label_fr ?? partial.code,
    value_type: partial.value_type ?? "number",
    catalog_kind: null,
    storage_group: partial.storage_group ?? "civil",
    section_ar: null,
    section_fr: null,
    sort_order: 0,
    is_system: true,
    is_active: partial.is_active ?? true,
    is_required: partial.is_required ?? false,
  };
}

describe("maritalAllowsChildren", () => {
  it("accepte Marié / Divorcé / Veuf", () => {
    expect(maritalAllowsChildren("M")).toBe(true);
    expect(maritalAllowsChildren("D")).toBe(true);
    expect(maritalAllowsChildren("V")).toBe(true);
  });

  it("refuse Célibataire et vide", () => {
    expect(maritalAllowsChildren("C")).toBe(false);
    expect(maritalAllowsChildren("")).toBe(false);
    expect(maritalAllowsChildren(null)).toBe(false);
  });
});

describe("missingRequiredFields — children_count", () => {
  const children = field({
    code: "children_count",
    label_fr: "Nombre d'enfants",
    is_required: true,
  });

  it("n'exige pas children_count si célibataire", () => {
    expect(
      missingRequiredFields({ marital_code: "C", children_count: "" }, [children]),
    ).toEqual([]);
  });

  it("exige children_count si marié et champ obligatoire", () => {
    const missing = missingRequiredFields(
      { marital_code: "M", children_count: "" },
      [children],
    );
    expect(missing.map((f) => f.code)).toEqual(["children_count"]);
  });

  it("accepte 0 enfants si renseigné", () => {
    expect(
      missingRequiredFields({ marital_code: "M", children_count: "0" }, [children]),
    ).toEqual([]);
  });

  it("isFieldApplicable suit la situation familiale", () => {
    expect(isFieldApplicable(children, { marital_code: "V" })).toBe(true);
    expect(isFieldApplicable(children, { marital_code: "C" })).toBe(false);
  });
});
