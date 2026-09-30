import { describe, expect, it } from "vitest";
import {
  chainDecisionRequired,
  earliestOpen,
  firstOpenFor,
  isMonthClosed,
  parseChainState,
} from "@/lib/hr/payroll-chains";

describe("payroll chain state", () => {
  it("parses the RPC payload, 1900-01-01 meaning no validated run", () => {
    const s = parseChainState({
      mode: "SEPARATE",
      decision_id: "d6",
      global_open: "2026-11-01",
      external_open: "1900-01-01",
      operational_open: "2026-11-01",
      operational_start: "2026-09-01",
    });
    expect(s).toMatchObject({ mode: "SEPARATE", globalOpen: "2026-11-01", externalOpen: null, operationalOpen: "2026-11-01" });
    expect(parseChainState(null)).toMatchObject({ mode: "UNDECIDED", globalOpen: null, operationalOpen: "2026-09-01" });
  });

  it("keeps one chronological chain unless D6 separated the chains", () => {
    const frozen = parseChainState({ mode: "FROZEN", global_open: "2026-10-01" });
    expect(firstOpenFor(frozen, "2026-03-01")).toBe("2026-10-01");
    expect(isMonthClosed(frozen, "2026-03-01")).toBe(true);
    expect(isMonthClosed(frozen, "2026-10-01")).toBe(false);
    expect(earliestOpen(frozen)).toBe("2026-10-01");
  });

  it("computes the first open month per chain when separated", () => {
    const s = parseChainState({
      mode: "SEPARATE",
      global_open: "2026-10-01",
      external_open: "2026-04-01",
      operational_open: "2026-10-01",
    });
    expect(isMonthClosed(s, "2026-03-01")).toBe(true);
    expect(isMonthClosed(s, "2026-05-01")).toBe(false);
    expect(isMonthClosed(s, "2026-09-01")).toBe(true);
    expect(isMonthClosed(s, "2026-10-01")).toBe(false);
    expect(earliestOpen(s)).toBe("2026-04-01");
    const allRepriseDone = parseChainState({ mode: "SEPARATE", external_open: "2026-09-01", operational_open: "2026-12-01" });
    expect(earliestOpen(allRepriseDone)).toBe("2026-12-01");
  });

  it("requires D6 only for an operational month while reprise months are open and nothing is decided", () => {
    const open = parseChainState({ mode: "UNDECIDED", global_open: "1900-01-01" });
    expect(chainDecisionRequired(open, "2026-09-01")).toBe(true);
    expect(chainDecisionRequired(open, "2026-05-01")).toBe(false);
    expect(chainDecisionRequired(parseChainState({ mode: "UNDECIDED", global_open: "2026-09-01" }), "2026-10-01")).toBe(false);
    expect(chainDecisionRequired(parseChainState({ mode: "SEPARATE" }), "2026-09-01")).toBe(false);
  });
});
