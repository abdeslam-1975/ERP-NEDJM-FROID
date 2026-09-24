import { describe, expect, it } from "vitest";
import {
  accumulateAttendanceMovements,
  legendMovementBucket,
} from "@/lib/hr/attendance-movements";

const legends = [
  { code: "P", label_fr: "Présent", label_ar: "حاضر", coefficient: 1, counts_as_presence: true },
  { code: "CA", label_fr: "Congé annuel", label_ar: "عطلة سنوية", coefficient: 1, counts_as_presence: false },
  { code: "AN", label_fr: "Absence injustifiée", label_ar: "غياب", coefficient: 0, counts_as_presence: false },
  { code: "W", label_fr: "Week-end", label_ar: "نهاية أسبوع", coefficient: 0, counts_as_presence: false },
];

describe("attendance movements for bulletin", () => {
  it("classifies legends from labels and presence flag", () => {
    expect(legendMovementBucket(legends[0]!)).toBe("worked");
    expect(legendMovementBucket(legends[1]!)).toBe("leave");
    expect(legendMovementBucket(legends[2]!)).toBe("absence");
    expect(legendMovementBucket(legends[3]!)).toBe("weekend");
  });

  it("aggregates monthly movement counts from attendance cells", () => {
    const map = accumulateAttendanceMovements(
      [
        ...Array.from({ length: 14 }, () => ({ employee_id: "e1", legend_code: "P" })),
        ...Array.from({ length: 15 }, () => ({ employee_id: "e1", legend_code: "CA" })),
        { employee_id: "e1", legend_code: "AN" },
      ],
      legends,
    );
    const m = map.get("e1");
    expect(m?.days_worked).toBe(14);
    expect(m?.days_leave).toBe(15);
    expect(m?.days_absence).toBe(1);
    expect(m?.days_paid).toBe(29);
  });

  it("classifies system codes even when labels vary", () => {
    expect(
      legendMovementBucket({
        code: "CA",
        label_fr: "CA",
        coefficient: 1,
        counts_as_presence: false,
      }),
    ).toBe("leave");
    expect(
      legendMovementBucket({
        code: "AN",
        label_fr: "AN",
        coefficient: 0,
        counts_as_presence: false,
      }),
    ).toBe("absence");
    expect(
      legendMovementBucket({
        code: "JF",
        label_fr: "JF",
        coefficient: 1,
        counts_as_presence: false,
      }),
    ).toBe("weekend");
  });
});
