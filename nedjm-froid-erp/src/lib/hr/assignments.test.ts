import { describe, expect, it } from "vitest";
import {
  assignmentAt,
  firstOfMonth,
  isFirstOfMonth,
  monthAssignment,
  monthAssignmentsByEmployee,
  siteWilayaAt,
  type AssignmentRow,
} from "@/lib/hr/assignments";

const rows: AssignmentRow[] = [
  { id: "a1", contract_id: "c1", site_id: "S-ORAN", effective_from: "2026-01-01" },
  { id: "a2", contract_id: "c1", site_id: "S-ALGER", effective_from: "2026-10-01" },
  { id: "b1", contract_id: "c2", site_id: "S-SETIF", effective_from: "2026-09-15" },
];

describe("assignmentAt", () => {
  it("returns the assignment in force on the date", () => {
    expect(assignmentAt(rows, "c1", "2026-09-01")?.id).toBe("a1");
    expect(assignmentAt(rows, "c1", "2026-10-01")?.id).toBe("a2");
    expect(assignmentAt(rows, "c1", "2027-03-01")?.id).toBe("a2");
  });

  it("returns null before the first assignment", () => {
    expect(assignmentAt(rows, "c1", "2025-12-31")).toBeNull();
  });
});

describe("monthAssignment", () => {
  const c1 = { id: "c1", site_id: "S-ALGER", start_date: "2026-01-01", end_date: null };

  it("uses the site in force on the 1st, not the current mirror site of the contract", () => {
    expect(monthAssignment([c1], rows, "2026-09-01")).toEqual({ contractId: "c1", siteId: "S-ORAN", assignmentId: "a1" });
    expect(monthAssignment([c1], rows, "2026-10-01")).toEqual({ contractId: "c1", siteId: "S-ALGER", assignmentId: "a2" });
  });

  it("uses the assignment at the start for a documented mid-month exception", () => {
    const c2 = { id: "c2", site_id: "S-SETIF", start_date: "2026-09-15", end_date: null };
    expect(monthAssignment([c2], rows, "2026-09-01")).toEqual({ contractId: "c2", siteId: "S-SETIF", assignmentId: "b1" });
  });

  it("falls back to the contract site when there is no history", () => {
    const c3 = { id: "c3", site_id: "S-BLIDA", start_date: "2026-09-01", end_date: null };
    expect(monthAssignment([c3], rows, "2026-09-01")).toEqual({ contractId: "c3", siteId: "S-BLIDA", assignmentId: null });
  });

  it("prefers the contract covering the 1st over a later one", () => {
    const ended = { id: "c1", site_id: "S-ALGER", start_date: "2026-01-01", end_date: "2026-09-30" };
    const later = { id: "c2", site_id: "S-SETIF", start_date: "2026-09-15", end_date: null };
    expect(monthAssignment([later, ended], rows, "2026-09-01")?.contractId).toBe("c1");
  });

  it("returns null without contract", () => {
    expect(monthAssignment([], rows, "2026-09-01")).toBeNull();
  });
});

describe("monthAssignmentsByEmployee", () => {
  it("groups contracts per employee and accepts Date values", () => {
    const m = monthAssignmentsByEmployee(
      [
        { id: "c1", employee_id: "e1", site_id: "S-ALGER", start_date: "2026-01-01", end_date: null },
        { id: "c3", employee_id: "e2", site_id: "S-BLIDA", start_date: "2026-09-01", end_date: null },
      ],
      rows,
      "2026-09-01",
    );
    expect(m.get("e1")?.siteId).toBe("S-ORAN");
    expect(m.get("e2")?.siteId).toBe("S-BLIDA");
  });
});

describe("siteWilayaAt", () => {
  const hist = [
    { site_id: "s", effective_from: "2000-01-01", wilaya_code: "31" },
    { site_id: "s", effective_from: "2026-11-01", wilaya_code: "16" },
  ];

  it("returns the dated coded wilaya", () => {
    expect(siteWilayaAt(hist, "s", "2026-10-01")).toBe("31");
    expect(siteWilayaAt(hist, "s", "2026-11-01")).toBe("16");
  });

  it("returns null for an unconfirmed site", () => {
    expect(siteWilayaAt(hist, "other", "2026-10-01")).toBeNull();
  });
});

describe("date helpers", () => {
  it("detects the 1st of the month", () => {
    expect(isFirstOfMonth("2026-09-01")).toBe(true);
    expect(isFirstOfMonth("2026-09-01T00:00:00Z")).toBe(true);
    expect(isFirstOfMonth("2026-09-15")).toBe(false);
  });

  it("returns the 1st of the month", () => {
    expect(firstOfMonth("2026-09-15")).toBe("2026-09-01");
  });
});
