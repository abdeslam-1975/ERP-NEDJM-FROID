import { describe, expect, it } from "vitest";
import { resetStorageTargets, resetSummary } from "./test-data-reset";

describe("resetStorageTargets", () => {
  it("purges employee folders, draft photos and the referenced files once", () => {
    const targets = resetStorageTargets({
      employee_ids: ["a1b2-c3", "d4"],
      files: {
        "hr-docs": ["a1b2-c3/x.pdf", "a1b2-c3/x.pdf"],
        "attendance-imports": ["2026/10/batch.xlsx"],
        "hr-external-docs": [],
      },
    });
    expect(targets["hr-docs"]).toEqual({ folders: ["a1b2-c3", "d4"], files: ["a1b2-c3/x.pdf"] });
    expect(targets["hr-photos"].folders).toEqual(["a1b2-c3", "d4", "draft"]);
    expect(targets["attendance-imports"]).toEqual({ folders: [], files: ["2026/10/batch.xlsx"] });
    expect(targets["hr-external-docs"].files).toEqual([]);
  });

  it("never targets the letterhead folder", () => {
    const targets = resetStorageTargets({ employee_ids: [], files: {} });
    expect(targets["hr-photos"].folders).toEqual(["draft"]);
  });
});

describe("resetSummary", () => {
  it("defaults missing tables to zero", () => {
    const rows = resetSummary({ hr_employees: 6 });
    expect(rows.find((r) => r.key === "hr_employees")?.count).toBe(6);
    expect(rows.find((r) => r.key === "hr_contracts")?.count).toBe(0);
  });
});
