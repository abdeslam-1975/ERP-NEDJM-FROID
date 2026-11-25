import { describe, expect, it } from "vitest";
import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import type { HrEmployeeField } from "@/lib/actions/hr-employees";
import { assessFicheCompletion, formatFicheDoneAt } from "@/lib/hr/fiche-completion";

function field(code: string, extra: Partial<HrEmployeeField> = {}): HrEmployeeField {
  return {
    id: code,
    code,
    label_ar: code,
    label_fr: code,
    value_type: "text",
    catalog_kind: null,
    storage_group: "core",
    section_ar: null,
    section_fr: null,
    sort_order: 0,
    is_system: true,
    is_active: true,
    is_required: false,
    ...extra,
  };
}

function doc(code: string, extra: Record<string, unknown>): CatalogItem {
  return {
    id: code,
    kind: "document_type",
    code,
    label_ar: code,
    label_fr: code,
    extra,
    color_bg: null,
    color_fg: null,
    sort_order: 1,
    is_active: true,
  };
}

const fields = [
  field("last_name", { is_required: true }),
  field("phone"),
  field("children_count", { is_required: true }),
  field("hidden", { is_active: false, is_required: true }),
];

const catalogs = [
  doc("CNI", { upload_slot: true, required_for_save: true }),
  doc("PHOTO_ID", { upload_slot: true, required_for_save: false }),
  doc("FICHE_RENSEIGNEMENTS", { upload_slot: false, auto_generated: true }),
];

describe("assessFicheCompletion", () => {
  it("يميز اكتمال الكل عن الإجبارية فقط", () => {
    const full = assessFicheCompletion({
      values: { last_name: "HANAFI", phone: "0550", marital_code: "C" },
      fields,
      catalogs,
      uploadedDocTypeCodes: ["CNI", "PHOTO_ID", "FICHE_RENSEIGNEMENTS"],
    });
    expect(full).toEqual({ documents: "all", fields: "all" });

    const requiredOnly = assessFicheCompletion({
      values: { last_name: "HANAFI", phone: "", marital_code: "C" },
      fields,
      catalogs,
      uploadedDocTypeCodes: ["CNI"],
    });
    expect(requiredOnly).toEqual({ documents: "required", fields: "required" });
  });

  it("يعتبر النقص عندما تغيب الإجبارية", () => {
    const missing = assessFicheCompletion({
      values: { last_name: "", phone: "0550", marital_code: "M", children_count: "" },
      fields,
      catalogs,
      uploadedDocTypeCodes: ["PHOTO_ID"],
    });
    expect(missing).toEqual({ documents: "missing", fields: "missing" });
  });

  it("لا يحسب عدد الأطفال للعازب ضمن كل الحقول", () => {
    const row = assessFicheCompletion({
      values: { last_name: "ALI", phone: "1", marital_code: "C", children_count: "" },
      fields,
      catalogs,
      uploadedDocTypeCodes: ["CNI", "PHOTO_ID"],
    });
    expect(row.fields).toBe("all");
  });
});

describe("formatFicheDoneAt", () => {
  it("يعرض تاريخ الجزائر", () => {
    expect(formatFicheDoneAt("2026-11-25T12:00:00.000Z")).toMatch(/25/);
    expect(formatFicheDoneAt("2026-11-25T12:00:00.000Z")).toMatch(/11/);
    expect(formatFicheDoneAt("2026-11-25T12:00:00.000Z")).toMatch(/2026/);
    expect(formatFicheDoneAt(null)).toBe("");
  });
});
