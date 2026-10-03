import { describe, expect, it } from "vitest";
import {
  archiveMetaSchema,
  batchActions,
  chunk,
  decodeCsv,
  detectDelimiter,
  emptyArchiveMeta,
  matchArchiveLinesByName,
  monthOfSheetName,
  parseArchiveAnalysis,
  parseArchiveDate,
  parseCsv,
  parseGridArchive,
  parseRowsArchive,
  periodNature,
  selfValidationBlocker,
  similarNameScore,
  sourceExtOf,
} from "@/lib/hr/attendance-archive";

const SITE = "11111111-1111-4111-8111-111111111111";

describe("parseArchiveDate", () => {
  it("reads the usual date forms", () => {
    expect(parseArchiveDate("2026-03-05")).toBe("2026-03-05");
    expect(parseArchiveDate("05/03/2026")).toBe("2026-03-05");
    expect(parseArchiveDate("5-3-2026")).toBe("2026-03-05");
    expect(parseArchiveDate("05.03.2026")).toBe("2026-03-05");
    expect(parseArchiveDate(new Date(Date.UTC(2026, 2, 5)))).toBe("2026-03-05");
    expect(parseArchiveDate(46086)).toBe("2026-03-05");
    expect(parseArchiveDate({ formula: "A1+1", result: 46086 })).toBe("2026-03-05");
  });

  it("refuses impossible or ambiguous values", () => {
    expect(parseArchiveDate("31/02/2026")).toBeNull();
    expect(parseArchiveDate("2026/03/05")).toBeNull();
    expect(parseArchiveDate("mars")).toBeNull();
    expect(parseArchiveDate(12)).toBeNull();
    expect(parseArchiveDate("")).toBeNull();
  });
});

describe("parseGridArchive", () => {
  const matrix = [
    ["POINTAGE 02/2026", "Chantier A"],
    ["Matricule", "Nom", "Prénom", 1, 2, 29, 30, "HS50", "HS100", "Remarque"],
    ["031", "Benali", "Karim", "P", "ab", "", "P", 4, "", "ok"],
    ["", "", "", "", "", "", "", "", "", ""],
    ["45", "Saidi", "Nora", "", "", "", "", "x", 2, ""],
  ];

  it("turns each non-empty day cell and the overtime of a row into lines", () => {
    const r = parseGridArchive(matrix, { year: 2026, month: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report.header_row).toBe(2);
    expect(r.report.ignored_columns).toEqual(["Remarque"]);
    expect(r.report.rows).toBe(2);
    const refs = r.lines.map((l) => l.source_ref);
    expect(refs).toEqual(["L3-J1", "L3-J2", "L3-J30", "L3-HS", "L5-HS"]);
    const first = r.lines[0];
    expect(first).toMatchObject({ kind: "DAY", matricule: "031", work_date: "2026-02-01", source_code: "P", last_name: "Benali" });
    expect(r.lines[1].source_code).toBe("AB");
  });

  it("flags a day that does not exist in the month and unreadable hours", () => {
    const r = parseGridArchive(matrix, { year: 2026, month: 2 });
    if (!r.ok) throw new Error(r.error);
    const day30 = r.lines.find((l) => l.source_ref === "L3-J30")!;
    expect(day30.work_date).toBeNull();
    expect(day30.parse_errors).toContain("DAY_OUT_OF_MONTH");
    const hs = r.lines.find((l) => l.source_ref === "L3-HS")!;
    expect(hs).toMatchObject({ kind: "HOURS", work_date: "2026-02-01", hours: { HS50: 4 } });
    const bad = r.lines.find((l) => l.source_ref === "L5-HS")!;
    expect(bad.hours).toEqual({ HS100: 2 });
    expect(bad.parse_errors).toContain("HOURS_INVALID");
  });

  it("requires a Matricule header and day or hour columns", () => {
    expect(parseGridArchive([["Nom", 1]], { year: 2026, month: 1 }).ok).toBe(false);
    expect(parseGridArchive([["Matricule", "Nom"]], { year: 2026, month: 1 }).ok).toBe(false);
  });

  it("reads a site sheet: weekday day headers, extra columns, totals and legend below the staff", () => {
    const sheet = [
      [1, 2026],
      [],
      ["", "N", "MAT", "NOM", "PRENOM", "POSTE OCCUPE", "AFFECTATION", "1 Jeu", "2 Ven", "31 Sam", "MS", "SALAIRE MENSUEL", "NET à PAYER"],
      ["", 1, 1, "CHINE", "ABOUBAKR", "INGENIEUR", "EL GASSI", "MS", "MS", "CRP", 2, 210000, 120000],
      ["", 2, 2, "BEN SAYAH", "LOTFI", "TS", "EL GASSI", "CRP", "", "MS", 1, 160000, 95000],
      [],
      ["", "", "", "", "", "", "", "TOTAUX", "", "", "", "", ""],
      ["", "", "", "", "", "", "", 13, "MS", "Mission", "", "", ""],
    ];
    const r = parseGridArchive(sheet, { year: 2026, month: 1 });
    if (!r.ok) throw new Error(r.error);
    expect(r.report.header_row).toBe(3);
    expect(r.report.day_columns).toBe(3);
    expect(r.report.rows).toBe(2);
    expect(r.lines.map((l) => `${l.last_name}:${l.work_date}:${l.source_code}`)).toEqual([
      "CHINE:2026-01-01:MS",
      "CHINE:2026-01-02:MS",
      "CHINE:2026-01-31:CRP",
      "BEN SAYAH:2026-01-01:CRP",
      "BEN SAYAH:2026-01-31:MS",
    ]);
  });

  it("clips over-long values and records it", () => {
    const r = parseGridArchive([["Matricule", 1], ["M".repeat(50), "P"]], { year: 2026, month: 1 });
    if (!r.ok) throw new Error(r.error);
    expect(r.lines[0].matricule).toHaveLength(40);
    expect(r.lines[0].parse_errors).toContain("FIELD_TOO_LONG");
  });
});

describe("site workbooks", () => {
  it("reads the month of a sheet name", () => {
    expect(monthOfSheetName("JANVIER 2026")).toBe("2026-01");
    expect(monthOfSheetName("Février 2026")).toBe("2026-02");
    expect(monthOfSheetName("AOUT 2026")).toBe("2026-08");
    expect(monthOfSheetName("SEPTEMBRE 2026")).toBe("2026-09");
    expect(monthOfSheetName("Permissions")).toBeNull();
    expect(monthOfSheetName("MARS")).toBeNull();
  });

  it("ties lines to employees by last and first name", () => {
    const r = parseGridArchive(
      [
        ["MAT", "NOM", "PRENOM", 1],
        [1, "Chine", "Aboubakr", "MS"],
        [2, "BEN-SAYAH", "Lotfi", "MS"],
        [3, "INCONNU", "X", "MS"],
        [4, "DOUBLE", "Y", "MS"],
      ],
      { year: 2026, month: 1 },
    );
    if (!r.ok) throw new Error(r.error);
    const matched = matchArchiveLinesByName(r.lines, [
      { matricule: "05/26", last_name: "CHINE", first_name: "ABOUBAKR" },
      { matricule: "07/25", last_name: "BEN SAYAH", first_name: "LOTFI" },
      { matricule: "01/24", last_name: "DOUBLE", first_name: "Y" },
      { matricule: "02/24", last_name: "DOUBLE", first_name: "Y" },
    ]);
    expect(matched.map((l) => l.matricule)).toEqual(["05/26", "07/25", "?INCONNU X", "?DOUBLE Y"]);
  });
});

describe("parseRowsArchive", () => {
  it("reads one line per employee and day", () => {
    const r = parseRowsArchive([
      ["Matricule", "Nom", "Prénom", "Date", "Code", "Chantier", "HS50"],
      ["12", "Amrani", "Ali", "03/01/2026", "p", "CH-01", "2,5"],
      ["13", "", "", "32/01/2026", "P", "CH-01", ""],
      ["14", "", "", "", "", "", "abc"],
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lines).toHaveLength(3);
    expect(r.lines[0]).toMatchObject({
      source_ref: "L2",
      kind: "DAY",
      matricule: "12",
      work_date: "2026-01-03",
      source_code: "P",
      site_code: "CH-01",
      hours: { HS50: 2.5 },
      parse_errors: [],
    });
    expect(r.lines[1].work_date).toBeNull();
    expect(r.lines[1].parse_errors).toEqual(["DATE_INVALID"]);
    expect(r.lines[2]).toMatchObject({ raw_date: null, source_code: null, site_code: null });
    expect(r.lines[2].parse_errors).toEqual(["HOURS_INVALID"]);
  });

  it("names the missing mandatory columns", () => {
    const r = parseRowsArchive([["Matricule", "Date"]]);
    expect(r).toEqual({ ok: false, error: "Colonne(s) obligatoire(s) absente(s) : Code, Chantier." });
    expect(parseRowsArchive([["Nom", "Code"]]).ok).toBe(false);
  });

  it("accepts header variants (accents, case, Arabic)", () => {
    const r = parseRowsArchive([
      ["MATRICULE", "التاريخ", "Légende", "code chantier"],
      ["7", "2026-01-02", "P", "CH-02"],
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lines[0]).toMatchObject({ work_date: "2026-01-02", source_code: "P", site_code: "CH-02" });
  });
});

describe("CSV", () => {
  it("detects the separator and handles quotes", () => {
    const text = 'Matricule;Nom;Date\n"01";"Ben ""Ali""";05/01/2026\r\n02;Saidi;06/01/2026';
    expect(detectDelimiter(text)).toBe(";");
    expect(parseCsv(text)).toEqual([
      ["Matricule", "Nom", "Date"],
      ["01", 'Ben "Ali"', "05/01/2026"],
      ["02", "Saidi", "06/01/2026"],
    ]);
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("a\tb\n1\t2")).toBe("\t");
  });

  it("accepts UTF-8 only and strips the BOM", () => {
    const utf8 = new TextEncoder().encode("\uFEFFNom\nBenaïssa");
    expect(decodeCsv(utf8)).toEqual({ ok: true, text: "Nom\nBenaïssa" });
    expect(decodeCsv(new Uint8Array([0x4e, 0xef, 0x6d])).ok).toBe(false);
  });
});

describe("archiveMetaSchema", () => {
  const base = {
    ...emptyArchiveMeta(),
    format: "ROWS" as const,
    period_from: "2026-01",
    period_to: "2026-03",
    reference_year: 2026,
    site_ids: [SITE],
    provenance_detail: "Registre papier du chantier A",
  };

  it("accepts a complete batch description", () => {
    expect(archiveMetaSchema.safeParse(base).success).toBe(true);
  });

  it("requires one site and one month for a grid, a coherent year and a provenance", () => {
    expect(archiveMetaSchema.safeParse({ ...base, format: "GRID" }).success).toBe(false);
    expect(archiveMetaSchema.safeParse({ ...base, reference_year: 2025 }).success).toBe(false);
    expect(archiveMetaSchema.safeParse({ ...base, period_to: "2025-12" }).success).toBe(false);
    expect(archiveMetaSchema.safeParse({ ...base, provenance_detail: " " }).success).toBe(false);
    expect(archiveMetaSchema.safeParse({ ...base, site_ids: [] }).success).toBe(false);
  });
});

describe("helpers", () => {
  it("classifies the period without deducing the month status", () => {
    expect(periodNature("2026-01", "2026-08")).toBe("REPRISE");
    expect(periodNature("2026-08", "2026-09")).toBe("MIXED");
    expect(periodNature("2026-09", "2026-10")).toBe("OPERATIONAL");
  });

  it("offers the actions the status allows", () => {
    expect(batchActions("ANALYZED", true)).toMatchObject({ commit: true, reject: true, cancel: false, validate: false });
    expect(batchActions("PENDING_DECISION", true)).toMatchObject({ commit: false, mapping: true });
    expect(batchActions("DRAFT", false).analyze).toBe(false);
    expect(batchActions("IMPORTED", true)).toMatchObject({ validate: true, cancel: true, reject: false });
    expect(batchActions("CANCELLED", true).pieces).toBe(false);
  });

  it("keeps the author away from validating their batch unless allowed (D12)", () => {
    const base = { createdBy: "u1", userId: "u1", isSuperAdmin: false, importerMayValidate: null };
    expect(selfValidationBlocker(base)).toMatch(/Séparation des tâches/);
    expect(selfValidationBlocker({ ...base, importerMayValidate: false })).not.toBeNull();
    expect(selfValidationBlocker({ ...base, importerMayValidate: true })).toBeNull();
    expect(selfValidationBlocker({ ...base, isSuperAdmin: true })).toBeNull();
    expect(selfValidationBlocker({ ...base, userId: "u2" })).toBeNull();
  });

  it("parses the analysis summary defensively", () => {
    const a = parseArchiveAnalysis({
      counts: { read: 5, ok: "3", conflict: 1 },
      warnings: [{ code: "CONTROL_LINES", expected: 6, actual: 5 }],
      errors_by_code: { UNKNOWN_CODE: 2 },
    });
    expect(a.counts).toMatchObject({ read: 5, ok: 3, conflict: 1, error: 0 });
    expect(a.warnings[0]).toMatchObject({ code: "CONTROL_LINES", expected: 6, actual: 5 });
    expect(a.errors_by_code).toEqual({ UNKNOWN_CODE: 2 });
    expect(parseArchiveAnalysis(null).counts.read).toBe(0);
  });

  it("recognises source files and splits the upload in chunks", () => {
    expect(sourceExtOf("Pointage.XLSX")).toBe("xlsx");
    expect(sourceExtOf("export.csv")).toBe("csv");
    expect(sourceExtOf("scan.pdf")).toBeNull();
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("scores close spellings of a name", () => {
    expect(similarNameScore("FRADJ SAID", "FREDJ SAID")).toBe(1);
    expect(similarNameScore("YAHIA CHERIF ALI ABDERAHMANE", "YAHIA CHERIF ALI ABDERRAHMANE")).toBe(4);
    expect(similarNameScore("MENZER MERWAN", "TAMER BOUBAKER")).toBe(0);
  });
});
