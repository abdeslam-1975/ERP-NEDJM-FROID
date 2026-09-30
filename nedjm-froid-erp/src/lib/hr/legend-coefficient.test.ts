import { describe, expect, it } from "vitest";
import { legendUpsertSchema } from "@/lib/validations/hr";
import {
  formatLegendCoefficient,
  parseLegendCoefficient,
  sanitizeLegendCoefficientInput,
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
