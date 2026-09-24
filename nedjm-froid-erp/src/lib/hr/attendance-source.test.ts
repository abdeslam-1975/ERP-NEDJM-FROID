import { describe, expect, it } from "vitest";
import type { AttendanceCell } from "@/lib/actions/hr-ops";
import {
  cellOriginLabel,
  countPending,
  isAutoProposed,
  paintAttendanceCells,
} from "@/lib/hr/attendance-source";

const om = (date: string): AttendanceCell => ({
  employee_id: "e1",
  site_id: "s1",
  work_date: date,
  legend_code: "MS",
  source_code: "OM",
  status_code: "PROPOSED",
  correspondence_id: "c1",
  correspondence_number: "000007/26",
});

describe("attendance source", () => {
  const cells = [om("2026-09-25"), om("2026-09-26"), om("2026-09-27")];

  it("flags OM proposals only", () => {
    expect(isAutoProposed(cells[0])).toBe(true);
    expect(isAutoProposed({ ...cells[0], status_code: "VALIDATED" })).toBe(false);
    expect(isAutoProposed({ ...cells[0], source_code: "MANUAL" })).toBe(false);
    expect(cellOriginLabel(cells[0])).toContain("000007/26");
  });

  it("turns a changed day into a manual value and keeps untouched OM days", () => {
    const next = paintAttendanceCells(cells, {
      employeeId: "e1",
      siteId: "s1",
      dates: ["2026-09-26"],
      code: "p",
    });
    const byDate = new Map(next.map((c) => [c.work_date, c]));
    expect(byDate.get("2026-09-25")?.source_code).toBe("OM");
    expect(byDate.get("2026-09-26")).toMatchObject({
      legend_code: "P",
      source_code: "MANUAL",
      correspondence_id: null,
    });
    expect(countPending(next)).toEqual({ proposed: 2, edited: 1 });
  });

  it("keeps the OM origin when the same code is re-applied", () => {
    const next = paintAttendanceCells(cells, {
      employeeId: "e1",
      siteId: "s1",
      dates: ["2026-09-25", "2026-09-26"],
      code: "MS",
    });
    expect(next.every((c) => c.source_code === "OM")).toBe(true);
  });

  it("clears days with an empty code", () => {
    const next = paintAttendanceCells(cells, {
      employeeId: "e1",
      siteId: "s1",
      dates: ["2026-09-27"],
      code: "",
    });
    expect(next.map((c) => c.work_date)).toEqual(["2026-09-25", "2026-09-26"]);
  });
});
