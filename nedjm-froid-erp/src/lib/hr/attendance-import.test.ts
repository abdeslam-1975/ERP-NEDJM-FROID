import { describe, expect, it } from "vitest";
import { cellText, parseAttendanceMatrix } from "./attendance-import";
import { contractsForMonth } from "./attendance-columns";

const ctx = {
  year: 2026,
  month: 2,
  employeeByMatricule: new Map([
    ["031", "e1"],
    ["045", "e2"],
  ]),
  allowedCodes: new Set(["P", "W", "CA"]),
  hourColumns: ["HS50", "HS75", "HS100"],
};

describe("attendance import", () => {
  it("reads day codes and overtime hours under a Matricule header", () => {
    const matrix = [
      ["POINTAGE FEVRIER 2026"],
      ["Matricule", "Nom", 1, 2, "3", "HS 50", "HS100"],
      ["031", "A", "p", "W", "", "4,5", ""],
      [45, "B", "CA", "CA", "CA", "", 2],
    ];
    const r = parseAttendanceMatrix(matrix, ctx);
    expect(r.errors).toEqual([]);
    expect(r.rows).toBe(2);
    expect(r.cells).toContainEqual({ employee_id: "e1", work_date: "2026-02-01", legend_code: "P" });
    expect(r.cells.filter((c) => c.employee_id === "e1")).toHaveLength(2);
    expect(r.cells.filter((c) => c.employee_id === "e2")).toHaveLength(3);
    expect(r.hours).toEqual({ e1: { HS50: "4.5" }, e2: { HS100: "2" } });
  });

  it("reports unknown matricules, codes and days beyond the month", () => {
    const matrix = [
      ["MAT", 1, 29, 30],
      ["999", "P", "P", "P"],
      ["031", "ZZ", "P", "P"],
    ];
    const r = parseAttendanceMatrix(matrix, ctx);
    expect(r.cells).toEqual([]);
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0]).toContain("999");
    expect(r.errors[1]).toContain("ZZ");
  });

  it("fails clearly without a Matricule column", () => {
    expect(parseAttendanceMatrix([["Nom", 1, 2]], ctx).errors[0]).toContain("Matricule");
  });

  it("flattens exceljs rich values", () => {
    expect(cellText({ richText: [{ text: "C" }, { text: "A" }] })).toBe("CA");
    expect(cellText({ formula: "x", result: 3 })).toBe("3");
    expect(cellText(null)).toBe("");
  });

  it("keeps contracts that covered the month, ended ones included", () => {
    const rows = [
      { employee_id: "e1", site_id: "s1", start_date: "2025-01-01", end_date: "2026-01-20" },
      { employee_id: "e2", site_id: "s1", start_date: "2025-01-01", end_date: null },
      { employee_id: "e3", site_id: "s1", start_date: "2026-03-01", end_date: null },
      { employee_id: "e2", site_id: "s1", start_date: "2026-01-10", end_date: null },
    ];
    const jan = contractsForMonth(rows, 2026, 1);
    expect(jan.map((c) => c.employee_id).sort()).toEqual(["e1", "e2"]);
    expect(jan.find((c) => c.employee_id === "e2")?.start_date).toBe("2026-01-10");
    expect(contractsForMonth(rows, 2026, 2).map((c) => c.employee_id)).toEqual(["e2"]);
  });
});
