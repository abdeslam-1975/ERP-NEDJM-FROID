import { describe, expect, it } from "vitest";
import { dayFirstToIso, isoToDayFirst, maskDayFirst } from "@/lib/hr/day-first-date";

describe("day first dates", () => {
  it("shows a stored date as day, month, then year", () => {
    expect(isoToDayFirst("2024-12-01")).toBe("01/12/2024");
    expect(isoToDayFirst("")).toBe("");
  });

  it("inserts the slashes while the day is typed first", () => {
    expect(maskDayFirst("1")).toBe("1");
    expect(maskDayFirst("0112")).toBe("01/12");
    expect(maskDayFirst("01/12/2024")).toBe("01/12/2024");
  });

  it("reads the day before the month", () => {
    expect(dayFirstToIso("01/12/2024")).toBe("2024-12-01");
    expect(dayFirstToIso("12/01/2024")).toBe("2024-01-12");
    expect(dayFirstToIso("31/02/2024")).toBeNull();
  });
});
