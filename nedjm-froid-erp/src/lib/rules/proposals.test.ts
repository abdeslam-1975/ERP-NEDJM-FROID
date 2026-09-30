import { describe, expect, it } from "vitest";
import {
  applicationMonthError,
  applicationMonthsForDate,
  approvalCheck,
  fractionPct,
  isIsoDay,
  isOpenRuleStatus,
  nextMonthStart,
  parseIrgRowStatus,
  parseProposalOverview,
  plainPct,
  ruleSourceSchema,
} from "@/lib/rules/proposals";

describe("approvalCheck (separation of duties)", () => {
  const base = { status: "SUBMITTED", canApprove: true, isSuperAdmin: false, isContributor: false };

  it("lets a delegated approver approve someone else's proposal", () => {
    expect(approvalCheck(base)).toEqual({ allowed: true, selfApproval: false, reason: null });
  });

  it("refuses a delegate who contributed to the proposal", () => {
    const r = approvalCheck({ ...base, isContributor: true });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/Séparation des tâches/);
  });

  it("lets the SUPER_ADMIN approve their own proposal, flagged as self-approval", () => {
    expect(approvalCheck({ ...base, canApprove: false, isSuperAdmin: true, isContributor: true })).toEqual({
      allowed: true,
      selfApproval: true,
      reason: null,
    });
  });

  it("refuses without approval right or when the proposal is not submitted", () => {
    expect(approvalCheck({ ...base, canApprove: false }).allowed).toBe(false);
    expect(approvalCheck({ ...base, status: "DRAFT" }).reason).toBe("Proposition non soumise.");
    expect(approvalCheck({ ...base, status: "APPROVED", isSuperAdmin: true }).allowed).toBe(false);
  });
});

describe("D2 application month", () => {
  it("never splits a month: a date after the 1st attaches to the next month by default", () => {
    expect(applicationMonthsForDate("2026-10-01")).toEqual({ suggested: "2026-10-01", alternative: null });
    expect(applicationMonthsForDate("2026-10-15")).toEqual({ suggested: "2026-11-01", alternative: "2026-10-01" });
    expect(applicationMonthsForDate("2026-12-31")).toEqual({ suggested: "2027-01-01", alternative: "2026-12-01" });
  });

  it("requires the 1st of an open month", () => {
    expect(applicationMonthError({ month: "2026-10-15", firstOpen: null })).toMatch(/1er/);
    expect(applicationMonthError({ month: "2026-08-01", firstOpen: "2026-09-01" })).toMatch(/Mois déjà traité/);
    expect(applicationMonthError({ month: "2026-09-01", firstOpen: "2026-09-01" })).toBeNull();
  });

  it("accepts only the date's own month or the next one", () => {
    expect(applicationMonthError({ month: "2026-11-01", firstOpen: null, date: "2026-10-15" })).toBeNull();
    expect(applicationMonthError({ month: "2026-10-01", firstOpen: null, date: "2026-10-15" })).toBeNull();
    expect(applicationMonthError({ month: "2026-12-01", firstOpen: null, date: "2026-10-15" })).toMatch(/rattache/);
  });

  it("computes the next month across years and validates ISO days", () => {
    expect(nextMonthStart("2026-12-20")).toBe("2027-01-01");
    expect(isIsoDay("2026-02-29")).toBe(false);
    expect(isIsoDay("2028-02-29")).toBe(true);
  });
});

describe("rule source", () => {
  it("requires a legal source and the text's effective date", () => {
    expect(ruleSourceSchema.safeParse({ source_ref: "LF 2026 art. 12", text_effective_date: "2026-01-01" }).success).toBe(
      true,
    );
    expect(ruleSourceSchema.safeParse({ source_ref: "  ", text_effective_date: "2026-01-01" }).success).toBe(false);
    expect(ruleSourceSchema.safeParse({ source_ref: "LF 2026", text_effective_date: "" }).success).toBe(false);
  });
});

describe("statuses and formatting", () => {
  it("treats unknown IRG row statuses as LEGACY (never trusted)", () => {
    expect(parseIrgRowStatus("APPLIED")).toBe("APPLIED");
    expect(parseIrgRowStatus(undefined)).toBe("LEGACY");
    expect(parseIrgRowStatus("WHATEVER")).toBe("LEGACY");
  });

  it("knows which proposals are still open", () => {
    expect(["DRAFT", "SUBMITTED", "APPROVED"].every(isOpenRuleStatus)).toBe(true);
    expect(["APPLIED", "REJECTED", "WITHDRAWN", "SUPERSEDED"].some(isOpenRuleStatus)).toBe(false);
  });

  it("formats fractions and plain percents", () => {
    expect(fractionPct(0.09)).toBe("9 %");
    expect(fractionPct(0.0075)).toBe("0,75 %");
    expect(fractionPct(null)).toBe("—");
    expect(plainPct(4.5)).toBe("4,5 %");
    expect(plainPct(null)).toBe("taux légal");
  });
});

describe("parseProposalOverview", () => {
  it("parses rows defensively and drops rows without id", () => {
    const rows = parseProposalOverview([
      {
        id: "p1",
        family: "IRG_ZONE_SCOPE",
        action: "SET",
        status: "APPROVED",
        origin: "AI",
        self_approved: true,
        requested_month: "2026-11-01T00:00:00",
        contributors: [{ name: "A", role: "AI_EXTRACT", at: "2026-10-01" }, null],
        proposed: { zone_code: "SUD" },
        current: [],
      },
      { family: "LEGAL_VAR" },
      { id: "p2", family: "NOPE", action: "NOPE", status: "NOPE" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: "p1",
      family: "IRG_ZONE_SCOPE",
      origin: "AI",
      self_approved: true,
      requested_month: "2026-11-01",
      contributors: [{ name: "A", role: "AI_EXTRACT", at: "2026-10-01" }],
      proposed: { zone_code: "SUD" },
      current: null,
    });
    expect(rows[1]).toMatchObject({ family: "LEGAL_VAR", action: "SET", status: "DRAFT", origin: "MANUAL" });
    expect(parseProposalOverview(null)).toEqual([]);
  });
});
