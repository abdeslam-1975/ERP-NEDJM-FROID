import { describe, expect, it } from "vitest";
import {
  editableRowValueCodes,
  isEditableColumn,
  pickVisibleValues,
  rowValuePatch,
  pointageColumns,
  visibleColumns,
  withSonatrachColumn,
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

  it("puts NJ, commentaire, the Sonatrach penalty, net à payer and validation straight after the days", () => {
    const sheet = [
      col({ code: "NOM", kind: "IDENTITY", source: "LAST_NAME", sort_order: 30 }),
      col({ code: "COMMENTAIRE", kind: "INPUT", sort_order: 40 }),
      col({ code: "DAYS", kind: "DAYS", sort_order: 100 }),
      col({ code: "HS50", kind: "INPUT", sort_order: 115 }),
      col({ code: "NJ", kind: "TOTAL", source: "NJ", sort_order: 300 }),
      col({ code: "COEF", kind: "TOTAL", source: "COEF", sort_order: 310 }),
      col({ code: "VALIDATION", kind: "INPUT", sort_order: 410 }),
      col({ code: "SANCTION_SONATRACH", kind: "INPUT", sort_order: 890 }),
      col({ code: "NET_A_PAYER", kind: "INPUT", sort_order: 900 }),
    ];
    expect(pointageColumns(sheet).map((c) => c.code)).toEqual([
      "NOM",
      "DAYS",
      "NJ",
      "COMMENTAIRE",
      "SANCTION_SONATRACH",
      "NET_A_PAYER",
      "VALIDATION",
      "HS50",
      "COEF",
    ]);
  });

  it("adds the Sonatrach column before the net when that role can see the net", () => {
    const sheet = [
      col({ code: "DAYS", kind: "DAYS", sort_order: 100 }),
      col({ code: "NET_A_PAYER", kind: "INPUT", sort_order: 130 }),
    ];
    const access = {
      DAYS: { view: true, edit: true },
      NET_A_PAYER: { view: true, edit: false },
    };
    const withPenalty = withSonatrachColumn(sheet, access);
    expect(pointageColumns(visibleColumns(withPenalty.columns, withPenalty.access)).map((c) => c.code)).toEqual([
      "DAYS",
      "SANCTION_SONATRACH",
      "NET_A_PAYER",
    ]);
  });

  it("leaves the penalty column out when the net is hidden", () => {
    const sheet = [col({ code: "DAYS", kind: "DAYS", sort_order: 100 })];
    const access = { DAYS: { view: true, edit: true } };
    expect(withSonatrachColumn(sheet, access).columns.map((c) => c.code)).toEqual(["DAYS"]);
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

  it("patches only editable values and clears empty ones", () => {
    const editable = new Set(["COMMENTAIRE", "POSTE_EFFECTIF"]);
    expect(
      rowValuePatch({ COMMENTAIRE: " ", POSTE_EFFECTIF: " Soudeur ", VALIDATION: "NO" }, editable),
    ).toEqual({ set: { POSTE_EFFECTIF: "Soudeur" }, unset: ["COMMENTAIRE"] });
    expect(rowValuePatch({ VALIDATION: "NO" }, editable)).toBeNull();
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
