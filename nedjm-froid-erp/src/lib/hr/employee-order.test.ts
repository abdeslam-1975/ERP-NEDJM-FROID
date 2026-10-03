import { describe, expect, it } from "vitest";
import { sortEmployees } from "@/lib/hr/employee-order";

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
});
