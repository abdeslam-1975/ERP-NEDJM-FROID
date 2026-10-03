import { describe, expect, it } from "vitest";
import { sortEmployees } from "@/lib/hr/employee-order";

describe("staff order", () => {
  it("sorts by matricule year (latest first), active first, then matricule number", () => {
    const rows = [
      { matricule: "03/24", status: "ACTIVE" },
      { matricule: "10/26", status: "ACTIVE" },
      { matricule: "01/26", status: "INACTIVE" },
      { matricule: "02/26", status: "ACTIVE" },
      { matricule: "X-OLD", status: "ACTIVE" },
      { matricule: "01/25", status: "ACTIVE" },
      { matricule: "01/24", status: "INACTIVE" },
      { matricule: "2/26", status: "ACTIVE" },
    ];
    expect(sortEmployees(rows).map((r) => r.matricule)).toEqual([
      "02/26",
      "2/26",
      "10/26",
      "01/26",
      "01/25",
      "03/24",
      "01/24",
      "X-OLD",
    ]);
  });
});
