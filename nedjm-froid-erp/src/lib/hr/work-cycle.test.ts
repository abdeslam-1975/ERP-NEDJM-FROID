import { describe, expect, it } from "vitest";
import { coversWorkPeriod, hasOpenWorkContract } from "@/lib/hr/work-cycle";

const open = { status: "ACTIVE", start_date: "2026-03-12", end_date: "2026-12-31" };

describe("coversWorkPeriod", () => {
  it("covers a mission or a leave inside the contract", () => {
    expect(coversWorkPeriod(open, "2026-04-01", "2026-04-10")).toBe(true);
  });

  it("keeps a worker only while a work contract is still open", () => {
    const contracts = [
      { employee_id: "hired", status: "ACTIVE" },
      { employee_id: "ended", status: "ENDED" },
    ];
    expect(hasOpenWorkContract(contracts, "hired")).toBe(true);
    expect(hasOpenWorkContract(contracts, "ended")).toBe(false);
    expect(hasOpenWorkContract(contracts, "unknown")).toBe(false);
  });

  it("refuses a period before the contract or after it has ended", () => {
    expect(coversWorkPeriod(open, "2026-03-01", "2026-03-11")).toBe(false);
    expect(coversWorkPeriod({ ...open, status: "ENDED" }, "2026-04-01", "2026-04-10")).toBe(false);
    expect(coversWorkPeriod({ ...open, end_date: null }, "2026-11-01", "2026-11-05")).toBe(true);
  });
});
