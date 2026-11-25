import { describe, expect, it } from "vitest";
import { compareByHired, compareByName, compareBySerial, sortEmployees } from "@/lib/hr/employee-order";

describe("staff order", () => {
  it("puts the latest hire first: matricule year, then number, both descending", () => {
    const rows = [
      { matricule: "03/24" },
      { matricule: "10/26" },
      { matricule: "01/26" },
      { matricule: "X-OLD" },
      { matricule: "01/25" },
      { matricule: "01/24" },
      { matricule: "2/26" },
    ];
    expect(sortEmployees(rows).map((r) => r.matricule)).toEqual([
      "10/26",
      "2/26",
      "01/26",
      "01/25",
      "03/24",
      "01/24",
      "X-OLD",
    ]);
  });

  it("orders a register by serial number, hire date, or name", () => {
    const rows = [
      { matricule: "02/26", hired_at: "2026-02-01", last_name: "ZEKIRI", first_name: "AHMED" },
      { matricule: "10/26", hired_at: "2024-01-01", last_name: "BOUGUERRA", first_name: "NACEUR" },
      { matricule: "01/26", hired_at: null, last_name: "FREDJ", first_name: "SAID" },
    ];
    expect([...rows].sort(compareBySerial).map((row) => row.matricule)).toEqual(["01/26", "02/26", "10/26"]);
    expect([...rows].sort(compareByHired).map((row) => row.matricule)).toEqual(["02/26", "10/26", "01/26"]);
    expect([...rows].sort(compareByName).map((row) => row.matricule)).toEqual(["10/26", "01/26", "02/26"]);
  });
});
