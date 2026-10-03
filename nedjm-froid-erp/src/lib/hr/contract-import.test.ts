import { describe, expect, it } from "vitest";
import {
  buildContractImportRows,
  findContractHeaderRow,
  guessContractMapping,
  matriculeKey,
  type ContractImportDefaults,
} from "@/lib/hr/contract-import";

const employees = [
  { id: "e1", matricule: "01/24", last_name: "FREDJ", first_name: "SAID", hired_at: "2024-03-15" },
  { id: "e2", matricule: "02/24", last_name: "TAMER", first_name: "ABDENNACER", hired_at: null },
  { id: "e3", matricule: "03/24", last_name: "TAMER", first_name: "ABDENNACER", hired_at: "2024-05-01" },
  { id: "e4", matricule: "04/25", last_name: "BIROUK", first_name: "AHMED TAREK", hired_at: "2025-01-01" },
];
const sites = [
  { id: "s1", code: "HMD-DEG", name_fr: "El Gassi", activity_code_id: "a1" },
  { id: "s2", code: "HASSI-01", name_fr: "HMD", activity_code_id: null },
];
const contractTypes = [
  { code: "CDI", label_fr: "CDI" },
  { code: "CDD", label_fr: "CDD" },
];
const defaults: ContractImportDefaults = {
  match_by: "NAME",
  site_id: "s1",
  activity_code_id: "",
  contract_type_code: "CDD",
  work_regime_code: "4X4",
  status: "ACTIVE",
};

function build(matrix: string[][], extra: Partial<Parameters<typeof buildContractImportRows>[0]> = {}) {
  const headerRow = findContractHeaderRow(matrix);
  return buildContractImportRows({
    matrix,
    headerRow,
    mapping: guessContractMapping(matrix[headerRow]),
    defaults,
    employees,
    sites,
    contractTypes,
    existing: [],
    today: "2026-10-03",
    ...extra,
  });
}

describe("contract import", () => {
  it("normalises matricules", () => {
    expect(matriculeKey("01/24")).toBe(matriculeKey("1/24"));
    expect(matriculeKey(" 001 / 24 ")).toBe("1/24");
  });

  it("finds the header below a title and maps the usual columns", () => {
    const matrix = [["LISTE DES CONTRATS"], [], ["N", "Nom", "Prénom", "Chantier", "Poste", "Type de contrat", "Date début", "Date fin", "Salaire de base"]];
    expect(findContractHeaderRow(matrix)).toBe(2);
    expect(guessContractMapping(matrix[2])).toEqual([
      null,
      "last_name",
      "first_name",
      "site",
      "poste",
      "contract_type",
      "start_date",
      "end_date",
      "salaire_base",
    ]);
  });

  it("builds a contract from the sheet, snapping the start to the 1st of the month", () => {
    const [row] = build([
      ["Nom", "Prénom", "Chantier", "Poste", "Type", "Date début", "Date fin", "Salaire de base"],
      ["Fredj", "Saïd", "HMD-DEG", "soudeur", "CDI", "12/03/2024", "", "45 000"],
    ]);
    expect(row.status).toBe("ready");
    expect(row.payload).toMatchObject({
      employee_id: "e1",
      site_id: "s1",
      activity_code_id: "a1",
      contract_type_code: "CDI",
      work_regime_code: "4X4",
      poste_fr: "SOUDEUR",
      start_date: "2024-03-01",
      end_date: null,
      salaire_base_monthly: 45000,
      status: "ACTIVE",
    });
    expect(row.warnings.join(" ")).toContain("01/03/2024");
  });

  it("falls back on the default site and the hire date, and closes contracts already over", () => {
    const [row] = build([
      ["Nom", "Prénom", "Date fin"],
      ["FREDJ", "SAID", "2025-12-31"],
    ]);
    expect(row.payload).toMatchObject({ site_id: "s1", start_date: "2024-03-01", end_date: "2025-12-31", status: "ENDED" });
  });

  it("asks for the employee when the name is unknown or ambiguous, and accepts a manual choice", () => {
    const matrix = [
      ["Nom", "Prénom"],
      ["BIROUK", "TAREK"],
      ["TAMER", "ABDENNACER"],
    ];
    const rows = build(matrix);
    expect(rows.map((r) => r.status)).toEqual(["unmatched", "unmatched"]);
    expect(rows[1].candidates).toEqual(["e2", "e3"]);
    const fixed = build(matrix, { overrides: { 2: "e4", 3: "e3" } });
    expect(fixed.map((r) => [r.status, r.employee_id])).toEqual([
      ["ready", "e4"],
      ["ready", "e3"],
    ]);
  });

  it("matches by matricule and flags a different name", () => {
    const [row] = build(
      [
        ["Matricule", "Nom", "Prénom"],
        ["1/24", "FRADJ", "SAID"],
      ],
      { defaults: { ...defaults, match_by: "MATRICULE" } },
    );
    expect(row.employee_id).toBe("e1");
    expect(row.warnings.join(" ")).toContain("Nom différent");
  });

  it("skips employees already under contract and repeats in the file", () => {
    const rows = build(
      [
        ["Nom", "Prénom", "Date début"],
        ["FREDJ", "SAID", "01/01/2026"],
        ["BIROUK", "AHMED TAREK", "01/01/2026"],
        ["BIROUK", "AHMED TAREK", "01/06/2026"],
      ],
      {
        existing: [{ employee_id: "e1", start_date: "2025-01-01", end_date: null, status: "ACTIVE", affectation_principale: true }],
      },
    );
    expect(rows.map((r) => r.status)).toEqual(["exists", "ready", "duplicate"]);
  });

  it("rejects an unknown site and a missing activity", () => {
    const rows = build([
      ["Nom", "Prénom", "Chantier"],
      ["FREDJ", "SAID", "TIMIMOUN"],
      ["BIROUK", "AHMED TAREK", "HMD"],
    ]);
    expect(rows.map((r) => r.status)).toEqual(["invalid", "invalid"]);
    expect(rows[0].issues[0]).toContain("TIMIMOUN");
    expect(rows[1].issues[0]).toContain("Activité");
  });
});
