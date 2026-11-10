import { describe, expect, it } from "vitest";
import { matchBonToOperations, type BonAttachTarget } from "@/lib/caisse/bon-bulk-match";

function target(partial: Partial<BonAttachTarget> & Pick<BonAttachTarget, "operationId" | "op" | "date" | "amount">): BonAttachTarget {
  return {
    buyer: "X",
    hasPhoto: false,
    ...partial,
  };
}

describe("matchBonToOperations", () => {
  const rows = [
    target({ operationId: "a", op: 14, date: "2026-01-03", amount: 1000 }),
    target({ operationId: "b", op: 20, date: "2026-01-03", amount: 500 }),
    target({ operationId: "c", op: 21, date: "2026-01-05", amount: 1000, hasPhoto: true }),
    target({ operationId: "d", op: 22, date: "2026-01-10", amount: 600 }),
    target({ operationId: "e", op: 23, date: "2026-01-10", amount: 600 }),
  ];

  it("returns unique when date+amount match one op without photo", () => {
    const result = matchBonToOperations(rows, "2026-01-03", 1000);
    expect(result.status).toBe("unique");
    expect(result.matches[0]?.op).toBe(14);
  });

  it("returns ambiguous when several ops share date+amount", () => {
    const result = matchBonToOperations(rows, "2026-01-10", 600);
    expect(result.status).toBe("ambiguous");
    expect(result.matches).toHaveLength(2);
  });

  it("returns already when only a photographed op matches", () => {
    const result = matchBonToOperations(rows, "2026-01-05", 1000);
    expect(result.status).toBe("already");
    expect(result.matches[0]?.op).toBe(21);
  });

  it("returns none / unreadable otherwise", () => {
    expect(matchBonToOperations(rows, "2026-01-99", 1000).status).toBe("none");
    expect(matchBonToOperations(rows, null, 1000).status).toBe("unreadable");
  });
});
