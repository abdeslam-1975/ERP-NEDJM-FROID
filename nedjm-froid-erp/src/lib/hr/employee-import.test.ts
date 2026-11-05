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
import { nextMatriculeForHire, reportEmployeeTable } from "@/lib/hr/employee-matricule";
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
  field("nin", "NIN", "رقم التعريف"),
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

describe("matricules", () => {
  function planned(
    body: string[][],
    existing: { id?: string; matricule: string; nin?: string | null; nss?: string | null; last_name?: string; first_name?: string; birth_date?: string; hired_at?: string | null }[],
    links?: Record<number, "same" | "other">,
  ) {
    const matrix = [["Matricule", "Nom", "Prénom", "NSS", "NIN", "Date de naissance", "Date de recrutement"], ...body];
    return buildImportRows({
      matrix,
      headerRow: 0,
      mapping: ["matricule", "last_name", "first_name", "nss", "nin", "birth_date", "hired_at"],
      fields,
      catalogs,
      existing,
      links,
      today: "2026-11-05",
    });
  }

  it("keeps one matricule when the NSS or the NIN is the same", () => {
    const rows = planned(
      [
        ["99/26", "Benali", "Karim", "123456789012", "", "12/03/1985", "02/01/2026"],
        ["", "Benali", "Karim", "", "123456789012345678", "12/03/1985", "01/06/2024"],
      ],
      [{ id: "emp-1", matricule: "05/24", nss: "123456789012", nin: "123456789012345678", last_name: "BENALI", first_name: "KARIM" }],
    );
    expect(rows.map((r) => [r.status, r.matricule, r.expectedMatricule, r.employeeId])).toEqual([
      ["mismatch", "99/26", "05/24", "emp-1"],
      ["exists", "05/24", "05/24", "emp-1"],
    ]);
  });

  it("numbers new people by hire date and does not fill a hole", () => {
    const rows = planned(
      [
        ["", "Ami", "Nora", "", "", "01/01/1990", "01/06/2024"],
        ["", "Boudia", "Ali", "", "", "02/02/1991", "15/01/2024"],
      ],
      [{ matricule: "01/24" }, { matricule: "03/24" }],
    );
    expect(rows.map((r) => [r.line, r.matricule])).toEqual([
      [2, "05/24"],
      [3, "04/24"],
    ]);
  });

  it("keeps the width already used in that year", () => {
    const rows = planned(
      [["", "Ami", "Nora", "", "", "01/01/1990", "01/06/2024"]],
      [{ matricule: "001/24" }],
    );
    expect(rows[0].matricule).toBe("002/24");
  });

  it("keeps every file serial when the hire dates follow the numbers", () => {
    const rows = planned(
      [
        ["05/24", "Ami", "Nora", "", "", "01/01/1990", "15/01/2024"],
        ["06/24", "Boudia", "Ali", "", "", "02/02/1991", "01/06/2024"],
      ],
      [{ matricule: "01/24" }],
    );
    expect(rows.map((r) => [r.status, r.matricule])).toEqual([
      ["new", "05/24"],
      ["new", "06/24"],
    ]);
  });

  it("keeps 10/07 for a 2007 hire even when an earlier serial was hired later", () => {
    const rows = planned(
      [
        ["01/07", "Ami", "Nora", "", "", "01/01/1980", "01/12/2007"],
        ["10/07", "Boudia", "Ali", "", "", "02/02/1981", "15/03/2007"],
      ],
      [],
    );
    expect(rows.map((r) => [r.status, r.matricule, r.issues])).toEqual([
      ["new", "01/07", []],
      ["new", "10/07", []],
    ]);
  });

  it("accepts 1/24, 01/24 and 001/24 as the same number when the sequence matches", () => {
    const rows = planned(
      [["001/24", "Ami", "Nora", "", "", "01/01/1990", "15/01/2024"]],
      [{ matricule: "001/24" }],
    );
    expect(rows[0].status).toBe("exists");
    expect(rows[0].matricule).toBe("001/24");
  });

  it("links a single close name when the file is imported", () => {
    const rows = planned(
      [["", "Benali", "Karime", "", "", "12/03/1985", "01/02/2026"]],
      [{ id: "emp-1", matricule: "05/24", last_name: "BENALI", first_name: "KARIM", birth_date: "1985-03-12" }],
    );
    expect(rows[0].status).toBe("exists");
    expect(rows[0].employeeId).toBe("emp-1");
    expect(rows[0].matricule).toBe("05/24");
    const accepted = planned(
      [["", "Benali", "Karime", "", "", "12/03/1985", "01/02/2026"]],
      [{ id: "emp-1", matricule: "05/24", last_name: "BENALI", first_name: "KARIM", birth_date: "1985-03-12" }],
      { 2: "same" },
    );
    expect(accepted[0].status).toBe("exists");
    expect(accepted[0].matricule).toBe("05/24");
    const refused = planned(
      [["", "Benali", "Karime", "", "", "12/03/1985", "01/02/2026"]],
      [{ id: "emp-1", matricule: "05/24", last_name: "BENALI", first_name: "KARIM", birth_date: "1985-03-12" }],
      { 2: "other" },
    );
    expect(refused[0].status).toBe("new");
    expect(refused[0].matricule).toBe("01/26");
  });

  it("keeps the 2008 number when the same worker returns in 2015 and 2021", () => {
    const rows = planned(
      [
        ["", "Ami", "Nora", "", "123456789012345678", "01/01/1980", "01/03/2021"],
        ["", "Ami", "Nora", "", "123456789012345678", "01/01/1980", "01/06/2015"],
        ["", "Ami", "Nora", "", "123456789012345678", "01/01/1980", "15/02/2008"],
      ],
      [{ matricule: "03/08" }],
    );
    expect(rows.map((r) => r.matricule)).toEqual(["04/08", "04/08", "04/08"]);
  });

  it("does not take a number in the year of a return", () => {
    const rows = planned(
      [
        ["", "Ami", "Nora", "111111111111", "", "01/01/1980", "01/03/2021"],
        ["", "Said", "Ali", "222222222222", "", "02/02/1990", "10/01/2021"],
      ],
      [{ id: "ami", matricule: "05/08", nss: "111111111111", last_name: "AMI", first_name: "NORA", hired_at: "2008-02-15" }],
    );
    expect(rows.map((r) => [r.status, r.matricule])).toEqual([
      ["exists", "05/08"],
      ["new", "01/21"],
    ]);
  });

  it("keeps the same matricule for two hires of one new person", () => {
    const rows = planned(
      [
        ["", "Ami", "Nora", "", "123456789012345678", "01/01/1990", "01/06/2026"],
        ["", "Ami", "Nora", "", "123456789012345678", "01/01/1990", "15/01/2024"],
      ],
      [],
    );
    expect(rows.map((r) => [r.line, r.status, r.matricule, r.leadLine])).toEqual([
      [2, "exists", "01/24", 3],
      [3, "new", "01/24", null],
    ]);
  });

  it("does not treat two different file numbers as one shared matricule", () => {
    const rows = planned(
      [
        ["001/01", "MAMMERI", "KARIM", "", "", "08/04/1980", "02/06/2001"],
        ["002/01", "HADJMAHFOUD", "KARIM", "", "", "13/03/1980", "02/06/2001"],
      ],
      [
        { id: "hadj", matricule: "001/01", last_name: "HADJMAHFOUD", first_name: "KARIM", birth_date: "1980-03-13", hired_at: "2001-06-02" },
        { id: "mam", matricule: "002/01", last_name: "MAMMRI", first_name: "KARIM", birth_date: "1980-04-08", hired_at: "2001-06-02" },
      ],
    );
    expect(rows.map((r) => [r.status, r.matricule, r.employeeId])).toEqual([
      ["exists", "001/01", "mam"],
      ["exists", "002/01", "hadj"],
    ]);
    expect(rows[0].warnings.join(" ")).toMatch(/remplace 002\/01/);
    expect(rows[1].warnings.join(" ")).toMatch(/remplace 001\/01/);
  });

  it("updates the same name when the birth date in the file is different", () => {
    const rows = planned(
      [["003/02", "BENKILA", "NABIL", "", "", "01/01/1977", "01/02/2002"]],
      [{ id: "b", matricule: "003/02", last_name: "BENKILA", first_name: "NABIL", birth_date: "1977-02-02", hired_at: "2002-02-01" }],
    );
    expect(rows.map((r) => [r.status, r.matricule, r.employeeId])).toEqual([["exists", "003/02", "b"]]);
  });

  it("exchanges the stored numbers once both people are confirmed", () => {
    const rows = planned(
      [
        ["001/01", "MAMMERI", "KARIM", "", "", "08/04/1980", "02/06/2001"],
        ["002/01", "HADJMAHFOUD", "KARIM", "", "", "13/03/1980", "02/06/2001"],
      ],
      [
        { id: "hadj", matricule: "001/01", last_name: "HADJMAHFOUD", first_name: "KARIM", birth_date: "1980-03-13", hired_at: "2001-06-02" },
        { id: "mam", matricule: "002/01", last_name: "MAMMRI", first_name: "KARIM", birth_date: "1980-04-08", hired_at: "2001-06-02" },
      ],
      { 2: "same", 3: "same" },
    );
    expect(rows.map((r) => [r.status, r.matricule, r.employeeId])).toEqual([
      ["exists", "001/01", "mam"],
      ["exists", "002/01", "hadj"],
    ]);
    expect(rows[0].warnings.join(" ")).toMatch(/remplace 002\/01/);
    expect(rows[1].warnings.join(" ")).toMatch(/remplace 001\/01/);
  });

  it("gives each file row its own serial when the base holds them the other way", () => {
    const rows = planned(
      [
        ["003/01", "GHRMIT", "MAHMOUD", "", "", "08/05/1969", "01/09/2001"],
        ["004/01", "HAMIOUD", "HOCINE", "", "", "16/01/1975", "04/10/2001"],
      ],
      [
        { id: "h", matricule: "003/01", last_name: "HAMIOUD", first_name: "HOCINE", birth_date: "1975-01-16", hired_at: "2001-10-04" },
        { id: "g", matricule: "004/01", last_name: "GHRMIT", first_name: "MAHMOUD", birth_date: "1969-05-08", hired_at: "2001-09-01" },
      ],
    );
    expect(rows.map((r) => [r.status, r.matricule, r.employeeId])).toEqual([
      ["exists", "003/01", "g"],
      ["exists", "004/01", "h"],
    ]);
  });

  it("does not merge when the NIN and the NSS point to two people", () => {
    const rows = planned(
      [["", "X", "Y", "123456789012", "123456789012345678", "01/01/1990", "01/01/2024"]],
      [
        { id: "a", matricule: "01/24", nin: "123456789012345678", last_name: "AAA", first_name: "AAA" },
        { id: "b", matricule: "02/24", nss: "123456789012", last_name: "BBB", first_name: "BBB" },
      ],
    );
    expect(rows[0].status).toBe("conflict");
  });
});

describe("live matricules", () => {
  it("proposes the next number of the hire year and skips holes", () => {
    expect(nextMatriculeForHire("2024-06-01", ["01/24", "03/24"])).toBe("04/24");
    expect(nextMatriculeForHire("2024-06-01", ["001/24"])).toBe("002/24");
    expect(nextMatriculeForHire("", ["01/24"])).toBe("");
  });

  it("reports two rows that share an NSS", () => {
    const report = reportEmployeeTable([
      {
        id: "a",
        matricule: "01/24",
        nss: "123456789012",
        last_name: "BENALI",
        first_name: "KARIM",
        hired_at: "2024-01-15",
      },
      {
        id: "b",
        matricule: "09/24",
        nss: "123456789012",
        last_name: "BENALI",
        first_name: "KARIM",
        hired_at: "2024-06-01",
      },
    ]);
    expect(report.total).toBe(2);
    expect(report.lines.map((line) => [line.id, line.status, line.expectedMatricule])).toEqual([
      ["b", "mismatch", "01/24"],
    ]);
  });

  it("does not renumber a 2008 matricule when the fiche date is the 2021 return", () => {
    const report = reportEmployeeTable([
      { id: "a", matricule: "05/08", last_name: "AMI", first_name: "NORA", hired_at: "2021-03-01", nss: "111111111111" },
      { id: "b", matricule: "01/21", last_name: "SAID", first_name: "ALI", hired_at: "2021-01-10", nss: "222222222222" },
      { id: "c", matricule: "03/21", last_name: "KACI", first_name: "OMAR", hired_at: "2021-06-01", nss: "333333333333" },
    ]);
    expect(report.returns).toBe(1);
    expect(report.lines.map((line) => line.id)).not.toContain("c");
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
