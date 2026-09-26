import { describe, expect, it } from "vitest";
import {
  attendanceFrozenMessage,
  normalizeRunStatus,
  periodStatus,
  planRunTransition,
} from "@/lib/hr/payroll-run-status";

describe("payroll run transitions", () => {
  it("follows DRAFT → VALIDATED → LOCKED", () => {
    expect(planRunTransition("DRAFT", "validate")).toEqual({ ok: true, to: "VALIDATED" });
    expect(planRunTransition("VALIDATED", "close")).toEqual({ ok: true, to: "LOCKED" });
  });

  it("reopens only a validated run", () => {
    expect(planRunTransition("VALIDATED", "reopen")).toEqual({ ok: true, to: "DRAFT" });
    expect(planRunTransition("DRAFT", "reopen").ok).toBe(false);
  });

  it("refuses closing a draft and any change on a locked run", () => {
    expect(planRunTransition("DRAFT", "close").ok).toBe(false);
    for (const action of ["validate", "reopen", "close"] as const) {
      expect(planRunTransition("LOCKED", action).ok).toBe(false);
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
    expect(attendanceFrozenMessage("VALIDATED")).toMatch(/réouvrez/);
    expect(attendanceFrozenMessage("LOCKED")).toMatch(/clôturée/);
  });
});
