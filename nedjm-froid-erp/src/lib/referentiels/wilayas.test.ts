import { describe, expect, it } from "vitest";
import { COMMUNES_BY_WILAYA, WILAYAS, communesOf } from "@/lib/referentiels/wilayas";

describe("découpage administratif", () => {
  it("couvre 69 wilayas et 1541 communes", () => {
    expect(WILAYAS).toHaveLength(69);
    const total = Object.values(COMMUNES_BY_WILAYA).reduce(
      (count, names) => count + names.length,
      0,
    );
    expect(total).toBe(1541);
    expect(communesOf("Ouargla")).toContain("Hassi Messaoud");
    expect(communesOf("Inconnue")).toEqual([]);
  });
});
