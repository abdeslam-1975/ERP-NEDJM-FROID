import { describe, expect, it } from "vitest";
import {
  attendanceFrozenMessage,
  canRequestReopen,
  normalizeRunStatus,
  periodStatus,
  planRunTransition,
} from "@/lib/hr/payroll-run-status";

describe("payroll run transitions", () => {
  it("follows DRAFT → VALIDATED → LOCKED", () => {
    expect(planRunTransition("DRAFT", "validate")).toEqual({ ok: true, to: "VALIDATED" });
    expect(planRunTransition("VALIDATED", "close")).toEqual({ ok: true, to: "LOCKED" });
  });

  it("has no direct reopening: validated and closed runs are reopened on decision D7 only", () => {
    expect(canRequestReopen("VALIDATED")).toBe(true);
    expect(canRequestReopen("LOCKED")).toBe(true);
    expect(canRequestReopen("DRAFT")).toBe(false);
    expect(planRunTransition("VALIDATED", "validate").ok).toBe(false);
  });

  it("refuses closing a draft and any change on a locked run", () => {
    expect(planRunTransition("DRAFT", "close").ok).toBe(false);
    for (const action of ["validate", "close"] as const) {
      const r = planRunTransition("LOCKED", action);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/D7/);
    }
  });

  it("treats unknown statuses as draft", () => {
    expect(normalizeRunStatus(null)).toBe("DRAFT");
    expect(normalizeRunStatus("whatever")).toBe("DRAFT");
  });
});

describe("period status", () => {
  it("is the most restrictive run status covering the period", () => {
    expect(periodStatus([])).toBeNull();
    expect(periodStatus(["DRAFT"])).toBeNull();
    expect(periodStatus(["DRAFT", "VALIDATED"])).toBe("VALIDATED");
    expect(periodStatus(["VALIDATED", "LOCKED", "DRAFT"])).toBe("LOCKED");
  });

  it("explains why the attendance grid is frozen", () => {
    expect(attendanceFrozenMessage(null)).toBeNull();
    expect(attendanceFrozenMessage("VALIDATED")).toMatch(/réouverture.*D7/);
    expect(attendanceFrozenMessage("LOCKED")).toMatch(/clôturée/);
  });
});
