import { describe, expect, it } from "vitest";
import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import type { HrEmployeeFiche, HrEmployeeField } from "@/lib/actions/hr-employees";
import { buildEmployeeExport, employeeExportHtml, exportColumns } from "@/lib/hr/employee-export";
import { buildEmployeeWorkbook } from "@/lib/hr/employee-export-file";
import { readEmployeeSheet } from "@/lib/hr/employee-import-file";

function field(code: string, over: Partial<HrEmployeeField> = {}): HrEmployeeField {
  return {
    id: code,
    code,
    label_fr: code,
    label_ar: "",
    value_type: "text",
    catalog_kind: null,
    storage_group: "core",
    section_ar: null,
    section_fr: null,
    sort_order: 0,
    is_system: true,
    is_active: true,
    is_required: false,
    ...over,
  };
}

const fields: HrEmployeeField[] = [
  field("matricule", { label_fr: "Matricule", label_ar: "الرقم", sort_order: 1 }),
  field("last_name", { label_fr: "Nom", label_ar: "اللقب", sort_order: 2 }),
  field("photo_url", { label_fr: "Photo", sort_order: 3 }),
  field("fiche_poste", { label_fr: "Poste", label_ar: "المنصب", value_type: "catalog", catalog_kind: "poste", sort_order: 4 }),
  field("note", { label_fr: "Note", storage_group: "extra", sort_order: 5 }),
  field("old", { label_fr: "Ancienne", is_active: false, sort_order: 6 }),
];

const catalogs = [{ kind: "poste", code: "FRIGO", label_fr: "Frigoriste", label_ar: "تبريد", is_active: true }] as CatalogItem[];

function person(over: Partial<HrEmployeeFiche>): HrEmployeeFiche {
  return { id: "1", matricule: "001", last_name: "Benali", attrs: {}, ...over } as HrEmployeeFiche;
}

const rows = [
  person({ id: "a", matricule: "001", last_name: "Benali", fiche_poste: "FRIGO", attrs: { note: "A < B" } }),
  person({ id: "b", matricule: "002", last_name: "Saidi", fiche_poste: "INCONNU", attrs: {} }),
];

describe("employee export", () => {
  it("keeps the active columns except the photo, in their order", () => {
    expect(exportColumns(fields).map((c) => c.code)).toEqual(["matricule", "last_name", "fiche_poste", "note"]);
  });

  it("exports the whole base with catalogue labels and extra columns", () => {
    const table = buildEmployeeExport(rows, fields, catalogs);
    expect(table.rows).toEqual([
      ["001", "Benali", "Frigoriste — تبريد", "A < B"],
      ["002", "Saidi", "INCONNU", ""],
    ]);
  });

  it("limits the grid to the employees and columns the user picked", () => {
    const table = buildEmployeeExport(rows, fields, catalogs, {
      employeeIds: new Set(["b"]),
      fieldCodes: new Set(["last_name", "matricule"]),
    });
    expect(table.columns.map((c) => c.code)).toEqual(["matricule", "last_name"]);
    expect(table.rows).toEqual([["002", "Saidi"]]);
  });

  it("escapes the printable page", () => {
    const html = employeeExportHtml(buildEmployeeExport(rows, fields, catalogs, { employeeIds: new Set(["a"]) }), {
      title: "Base",
      subtitle: "1 employé",
    });
    expect(html).toContain("A &lt; B");
    expect(html).toContain("Frigoriste — تبريد");
    expect(html).not.toContain("Saidi");
  });

  it("writes an xlsx that reads back the same grid", async () => {
    const table = buildEmployeeExport(rows, fields, catalogs, { fieldCodes: new Set(["matricule", "last_name"]) });
    const buf = await buildEmployeeWorkbook(table);
    const sheet = await readEmployeeSheet(buf, "base.xlsx");
    expect(sheet[0]).toEqual(["Matricule\nالرقم", "Nom\nاللقب"]);
    expect(sheet.slice(1)).toEqual([
      ["001", "Benali"],
      ["002", "Saidi"],
    ]);
  });
});
