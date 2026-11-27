import { describe, expect, it } from "vitest";
import type { WorkerRegisterRow } from "@/lib/actions/hr-worker-register";
import { buildRegisterReport, parseRegisterMatrix } from "@/lib/hr/worker-register-sheet";

const header = ["Matricule", "Nom", "Prénom", "Date de naissance", "Date d'entrée", "Date de sortie", "NSS", "Statut"];

function row(partial: Partial<WorkerRegisterRow> & Pick<WorkerRegisterRow, "matricule" | "hiredAt">): WorkerRegisterRow {
  return {
    id: 1,
    lineNo: 1,
    lastName: "BENALI",
    firstName: "ALI",
    birthDate: null,
    birthPlace: null,
    sex: "M",
    poste: null,
    endedAt: null,
    nss: null,
    status: "DÉSACTIVE",
    ...partial,
  };
}

describe("parseRegisterMatrix", () => {
  it("reads a register sheet and keeps one row per matricule and start date", () => {
    const parsed = parseRegisterMatrix([
      header,
      ["19/26", "berque", "Mohamed", "01/01/1990", "30/06/2026", "", "970694000739", "Actif"],
      ["019/26", "BERQUE", "MOHAMED", "01/01/1990", "30/06/2026", "", "970694000739", "Actif"],
      ["", "SANS", "NUMERO", "", "01/01/2020", "", "", ""],
    ]);
    expect(parsed.rows).toEqual([
      expect.objectContaining({
        matricule: "019/26",
        lastName: "BERQUE",
        hiredAt: "2026-06-30",
        status: "ACTIVE",
        nss: "970694000739",
      }),
    ]);
    expect(parsed.issues.map((issue) => issue.line)).toEqual([3, 4]);
  });
});

describe("buildRegisterReport", () => {
  it("counts periods by year and flags one NSS used by two matricules", () => {
    const report = buildRegisterReport([
      row({ matricule: "001/26", hiredAt: "2026-01-01", status: "ACTIVE", nss: "111111111111" }),
      row({ matricule: "002/26", hiredAt: "2026-02-01", status: "ACTIVE", nss: "111111111111", lastName: "AUTRE" }),
      row({ matricule: "001/20", hiredAt: "2020-05-01", nss: "12" }),
    ]);
    expect(report.periods).toBe(3);
    expect(report.matricules).toBe(3);
    expect(report.years[0]).toEqual({ year: "2026", periods: 2, active: 2 });
    expect(report.sharedNss).toEqual([{ nss: "111111111111", people: ["BENALI ALI", "AUTRE ALI"] }]);
    expect(report.shortNss).toHaveLength(1);
    expect(report.missingNss).toBe(0);
  });
});
