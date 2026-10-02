import { describe, expect, it } from "vitest";
import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import type { HrEmployeeField } from "@/lib/actions/hr-employees";
import {
  EXCEL_NO,
  buildImportRows,
  findHeaderRow,
  guessMapping,
  toIsoDate,
} from "@/lib/hr/employee-import";
import { cellText, parseCsvMatrix } from "@/lib/hr/employee-import-file";

let order = 0;
function field(code: string, label_fr: string, label_ar: string, over: Partial<HrEmployeeField> = {}): HrEmployeeField {
  order += 1;
  return {
    id: code,
    code,
    label_fr,
    label_ar,
    value_type: "text",
    catalog_kind: null,
    storage_group: "core",
    section_ar: null,
    section_fr: null,
    sort_order: order,
    is_system: true,
    is_active: true,
    is_required: false,
    ...over,
  };
}

const fields: HrEmployeeField[] = [
  field("matricule", "Matricule", "الرقم", { is_required: true }),
  field("status", "Statut", "الحالة", { is_required: true }),
  field("last_name", "Nom", "اللقب باللاتينية", { is_required: true }),
  field("first_name", "Prénom", "الاسم باللاتينية", { is_required: true }),
  field("last_name_ar", "Nom AR", "اللقب"),
  field("birth_date", "Né(e) le", "تاريخ الميلاد", { value_type: "date" }),
  field("nss", "N° NSS", "رقم الضمان"),
  field("sex_code", "Sexe", "الجنس", { value_type: "catalog", catalog_kind: "sex", storage_group: "civil" }),
  field("poste", "Poste Occupé", "المنصب", { value_type: "catalog", catalog_kind: "job_title", storage_group: "extra" }),
  field("hired_at", "Date de recrutement", "تاريخ التوظيف", { value_type: "date" }),
];

const catalogs = [
  { kind: "sex", code: "M", label_fr: "Masculin", label_ar: "ذكر" },
  { kind: "sex", code: "F", label_fr: "Féminin", label_ar: "أنثى" },
  { kind: "job_title", code: "TSF", label_fr: "TS en froid", label_ar: "تقني سامي" },
] as CatalogItem[];

describe("guessMapping", () => {
  it("recognises labels, Arabic labels, usual aliases and the old row number", () => {
    expect(
      guessMapping(["N°", "MATRICULE", "Nom", "Prénom", "اللقب", "Date de naissance", "N° Sécurité sociale", "Fonction", "Divers"], fields),
    ).toEqual([EXCEL_NO, "matricule", "last_name", "first_name", "last_name_ar", "birth_date", "nss", "poste", null]);
  });

  it("uses each field once and reads bilingual headers", () => {
    expect(guessMapping(["Nom / اللقب باللاتينية", "Nom"], fields)).toEqual(["last_name", null]);
  });
});

describe("findHeaderRow", () => {
  it("skips title lines above the header", () => {
    const matrix = [["LISTE DU PERSONNEL 2024"], [""], ["Matricule", "Nom", "Prénom"], ["12", "ALI", "KARIM"]];
    expect(findHeaderRow(matrix, fields)).toBe(2);
  });
});

describe("toIsoDate", () => {
  it("reads the usual date forms", () => {
    expect(toIsoDate("1985-03-12")).toBe("1985-03-12");
    expect(toIsoDate("12/03/1985")).toBe("1985-03-12");
    expect(toIsoDate("1.3.85")).toBe("1985-03-01");
    expect(toIsoDate("31142")).toBe("1985-04-05");
    expect(toIsoDate("31/02/1985")).toBeNull();
    expect(toIsoDate("hier")).toBeNull();
  });
});

describe("buildImportRows", () => {
  const matrix = [
    ["N°", "Matricule", "Nom", "Prénom", "Sexe", "Fonction", "Date de naissance", "Statut"],
    ["1", "07/24", "Benali", "Karim", "Masculin", "TS en froid", "12/03/1985", "actif"],
    ["2", "01/26", "Déjà", "Là", "F", "", "", ""],
    ["3", "07/24", "Double", "Ligne", "", "", "", ""],
    ["4", "", "Sans", "Matricule", "X", "Soudeur", "le 3 mai", "sorti"],
    ["5", "09/24", "", "Incomplet", "", "", "", ""],
    ["", "", "", "", "", "", "", ""],
  ];
  const rows = buildImportRows({
    matrix,
    headerRow: 0,
    mapping: guessMapping(matrix[0], fields),
    fields,
    catalogs,
    existing: [{ matricule: "01/26", nin: null }],
  });

  it("classifies each line and skips empty ones", () => {
    expect(rows.map((r) => [r.line, r.status])).toEqual([
      [2, "new"],
      [3, "exists"],
      [4, "duplicate"],
      [5, "new"],
      [6, "invalid"],
    ]);
  });

  it("converts values to fiche codes", () => {
    expect(rows[0].values).toMatchObject({
      matricule: "07/24",
      last_name: "BENALI",
      sex_code: "M",
      poste: "TSF",
      birth_date: "1985-03-12",
      status: "ACTIVE",
    });
    expect(rows[0].excelNo).toBe(1);
  });

  it("keeps unknown job titles, drops unknown codes and reports them", () => {
    const r = rows[3];
    expect(r.values.poste).toBe("Soudeur");
    expect(r.values.sex_code ?? "").toBe("");
    expect(r.values.status).toBe("INACTIVE");
    expect(r.warnings.join(" ")).toMatch(/Matricule absent/);
    expect(r.warnings.join(" ")).toMatch(/date illisible/);
    expect(rows[4].issues[0]).toMatch(/Nom/);
  });
});

describe("file reading", () => {
  it("parses ; separated CSV with quotes", () => {
    expect(parseCsvMatrix('\uFEFFMatricule;Nom\r\n"07/24";"BEN; ALI"\n')).toEqual([
      ["Matricule", "Nom"],
      ["07/24", "BEN; ALI"],
    ]);
  });

  it("turns Excel cells into text", () => {
    expect(cellText(new Date(Date.UTC(1985, 2, 12)))).toBe("1985-03-12");
    expect(cellText(799999000012345)).toBe("799999000012345");
    expect(cellText({ formula: "A1", result: 12 })).toBe("12");
    expect(cellText({ richText: [{ text: "BEN" }, { text: "ALI" }] })).toBe("BENALI");
  });
});
