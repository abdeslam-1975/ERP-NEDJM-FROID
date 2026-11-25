import { describe, expect, it } from "vitest";
import { dayBefore, planPrincipalClose, rangesOverlap } from "@/lib/hr/principal-contract";

describe("principal contract overlap", () => {
  it("treats open-ended ranges as overlapping", () => {
    expect(rangesOverlap("2024-01-01", null, "2026-01-01", null)).toBe(true);
    expect(rangesOverlap("2024-01-01", "2024-12-31", "2025-01-01", null)).toBe(false);
  });

  it("refuses a new principal while the previous one is still open", () => {
    const plan = planPrincipalClose(
      [{ id: "old", start_date: "2024-01-01", end_date: null, status: "ACTIVE" }],
      { start_date: "2026-09-01", end_date: null, status: "DRAFT" },
    );
    expect(plan.ok).toBe(false);
  });

  it("accepts a new principal that starts after the previous end date", () => {
    const plan = planPrincipalClose(
      [{ id: "old", start_date: "2024-01-01", end_date: "2026-08-31", status: "ENDED" }],
      { start_date: "2026-09-01", end_date: null, status: "ACTIVE" },
    );
    expect(plan).toEqual({ ok: true, close: [] });
  });

  it("refuses a new principal that starts on the previous end date", () => {
    const plan = planPrincipalClose(
      [{ id: "old", start_date: "2024-01-01", end_date: "2026-09-01", status: "ENDED" }],
      { start_date: "2026-09-01", end_date: null, status: "ACTIVE" },
    );
    expect(plan.ok).toBe(false);
  });

  it("refuses a second principal starting on the same day", () => {
    const plan = planPrincipalClose(
      [{ id: "old", start_date: "2026-01-01", end_date: null, status: "ACTIVE" }],
      { start_date: "2026-01-01", end_date: null, status: "ACTIVE" },
    );
    expect(plan.ok).toBe(false);
  });

  it("dayBefore stays on calendar dates", () => {
    expect(dayBefore("2026-03-01")).toBe("2026-02-28");
  });
});
