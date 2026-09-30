import { describe, expect, it } from "vitest";
import { legendCoefficientRequestSchema, legendUpsertSchema } from "@/lib/validations/hr";
import {
  formatLegendCoefficient,
  groupLegendCoefficientVersions,
  legendCoefficientAt,
  parseLegendCoefficient,
  sanitizeLegendCoefficientInput,
  scheduledLegendCoefficients,
} from "@/lib/hr/legend-coefficient";

const base = { code: "px", label_fr: "Présent" };

describe("legend coefficient", () => {
  it("accepts a comma or a dot and keeps three decimals", () => {
    expect(parseLegendCoefficient("0,5")).toBe(0.5);
    expect(parseLegendCoefficient("1.25")).toBe(1.25);
    expect(parseLegendCoefficient(",5")).toBe(0.5);
    expect(parseLegendCoefficient("0,")).toBe(0);
    expect(parseLegendCoefficient("2")).toBe(2);
    expect(parseLegendCoefficient("abc")).toBeNull();
    expect(parseLegendCoefficient("-1")).toBeNull();
  });

  it("keeps only digits and one comma while typing", () => {
    expect(sanitizeLegendCoefficientInput("0,5")).toBe("0,5");
    expect(sanitizeLegendCoefficientInput("0.5")).toBe("0,5");
    expect(sanitizeLegendCoefficientInput("12a,3456")).toBe("12,345");
    expect(formatLegendCoefficient(0.5)).toBe("0,5");
  });

  it("validates any coefficient from 0 to 999,999", () => {
    expect(legendUpsertSchema.parse({ ...base, coefficient: "0,5" }).coefficient).toBe(0.5);
    expect(legendUpsertSchema.parse({ ...base, coefficient: "1,5" }).coefficient).toBe(1.5);
    expect(legendUpsertSchema.safeParse({ ...base, coefficient: "1000" }).success).toBe(false);
    expect(legendUpsertSchema.safeParse({ ...base, coefficient: "" }).success).toBe(false);
  });
});

describe("dated legend coefficients (D14)", () => {
  const versions = [
    { effective_from: "1900-01-01", coefficient: 1 },
    { effective_from: "2026-11-01", coefficient: 0.5 },
    { effective_from: "2027-03-01", coefficient: 0.75 },
  ];

  it("takes the latest version starting on or before the month of the day", () => {
    expect(legendCoefficientAt(versions, "2026-10-31", 9)).toBe(1);
    expect(legendCoefficientAt(versions, "2026-11-01", 9)).toBe(0.5);
    expect(legendCoefficientAt(versions, "2026-11-30", 9)).toBe(0.5);
    expect(legendCoefficientAt(versions, "2027-02-15", 9)).toBe(0.5);
    expect(legendCoefficientAt(versions, "2027-03-02", 9)).toBe(0.75);
  });

  it("falls back to the legend coefficient without versions", () => {
    expect(legendCoefficientAt(undefined, "2026-10-01", 1.5)).toBe(1.5);
    expect(legendCoefficientAt([], "2026-10-01", 0)).toBe(0);
  });

  it("lists the changes decided for later months only", () => {
    expect(scheduledLegendCoefficients(versions, "2026-11-15")).toEqual([{ effective_from: "2027-03-01", coefficient: 0.75 }]);
    expect(scheduledLegendCoefficients(versions, "2027-03-01")).toEqual([]);
  });

  it("groups versions by legend and drops unreadable coefficients", () => {
    const map = groupLegendCoefficientVersions([
      { legend_id: "a", coefficient: "0.500", effective_from: "2026-11-01T00:00:00" },
      { legend_id: "a", coefficient: 1, effective_from: "1900-01-01" },
      { legend_id: "b", coefficient: "x", effective_from: "1900-01-01" },
    ]);
    expect(map.get("a")).toEqual([
      { effective_from: "2026-11-01", coefficient: 0.5 },
      { effective_from: "1900-01-01", coefficient: 1 },
    ]);
    expect(map.has("b")).toBe(false);
  });

  it("validates a change request: month of effect, coefficient, reason", () => {
    const req = { legend_id: "55555555-5555-4555-8555-555555555555", coefficient: "0,5", month: "2026-11", reason: "Nouvelle convention" };
    expect(legendCoefficientRequestSchema.parse(req)).toEqual({ ...req, coefficient: 0.5, month: "2026-11-01" });
    expect(legendCoefficientRequestSchema.parse({ ...req, month: "2026-11-01" }).month).toBe("2026-11-01");
    expect(legendCoefficientRequestSchema.safeParse({ ...req, month: "2026-11-15" }).success).toBe(false);
    expect(legendCoefficientRequestSchema.safeParse({ ...req, reason: "court" }).success).toBe(false);
    expect(legendCoefficientRequestSchema.safeParse({ ...req, coefficient: "1000" }).success).toBe(false);
  });
});
