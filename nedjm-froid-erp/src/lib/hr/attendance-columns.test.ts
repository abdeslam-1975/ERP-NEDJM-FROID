import { describe, expect, it } from "vitest";
import {
  editableRowValueCodes,
  isEditableColumn,
  mergeRowValues,
  pickVisibleValues,
  visibleColumns,
  type AttendanceColumn,
} from "@/lib/hr/attendance-columns";

function col(partial: Partial<AttendanceColumn> & Pick<AttendanceColumn, "code" | "kind">): AttendanceColumn {
  return {
    id: partial.code,
    label_fr: partial.code,
    label_ar: null,
    source: null,
    value_type: "text",
    catalog_kind: null,
    sort_order: 0,
    is_system: false,
    is_active: true,
    ...partial,
  };
}

const columns = [
  col({ code: "NOM", kind: "IDENTITY", source: "LAST_NAME", sort_order: 30 }),
  col({ code: "POSTE_EFFECTIF", kind: "IDENTITY", source: "POSTE_EFFECTIF", sort_order: 50 }),
  col({ code: "DAYS", kind: "DAYS", sort_order: 100 }),
  col({ code: "NJ", kind: "TOTAL", source: "NJ", sort_order: 300 }),
  col({ code: "COMMENTAIRE", kind: "INPUT", sort_order: 400 }),
  col({ code: "OLD", kind: "INPUT", sort_order: 5, is_active: false }),
];

describe("attendance columns", () => {
  it("only days, poste effectif and input columns can be edited", () => {
    expect(columns.filter(isEditableColumn).map((c) => c.code)).toEqual([
      "POSTE_EFFECTIF",
      "DAYS",
      "COMMENTAIRE",
      "OLD",
    ]);
  });

  it("shows active columns the role may view, in order", () => {
    const access = {
      NOM: { view: true, edit: false },
      DAYS: { view: true, edit: true },
      NJ: { view: false, edit: false },
      OLD: { view: true, edit: true },
    };
    expect(visibleColumns(columns, access).map((c) => c.code)).toEqual(["NOM", "DAYS"]);
  });

  it("row value codes exclude the days grid and non-editable columns", () => {
    const access = {
      DAYS: { view: true, edit: true },
      POSTE_EFFECTIF: { view: true, edit: true },
      COMMENTAIRE: { view: true, edit: false },
    };
    expect([...editableRowValueCodes(columns, access)]).toEqual(["POSTE_EFFECTIF"]);
  });

  it("merges only editable values and clears empty ones", () => {
    const editable = new Set(["COMMENTAIRE", "POSTE_EFFECTIF"]);
    const stored = { COMMENTAIRE: "old", VALIDATION: "OK" };
    expect(
      mergeRowValues(stored, { COMMENTAIRE: " ", POSTE_EFFECTIF: " Soudeur ", VALIDATION: "NO" }, editable),
    ).toEqual({ VALIDATION: "OK", POSTE_EFFECTIF: "Soudeur" });
    expect(mergeRowValues(stored, { COMMENTAIRE: "old" }, editable)).toBeNull();
  });

  it("strips values of columns the role cannot view", () => {
    expect(
      pickVisibleValues(
        { COMMENTAIRE: "x", VALIDATION: "OK" },
        { COMMENTAIRE: { view: true, edit: false } },
      ),
    ).toEqual({ COMMENTAIRE: "x" });
  });
});
