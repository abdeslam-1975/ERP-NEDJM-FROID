import { describe, expect, it } from "vitest";
import { suggestWilayaCode, wilayaName } from "@/lib/referentiels/wilaya-match";

describe("suggestWilayaCode", () => {
  it("matches names regardless of case and accents", () => {
    expect(suggestWilayaCode("Alger")).toBe("16");
    expect(suggestWilayaCode("  oran ")).toBe("31");
    expect(suggestWilayaCode("Sétif")).toBe("19");
  });

  it("matches numeric codes and 'code - name' values", () => {
    expect(suggestWilayaCode("16")).toBe("16");
    expect(suggestWilayaCode("9")).toBe("09");
    expect(suggestWilayaCode("16 - Alger")).toBe("16");
  });

  it("refuses inconsistent or unknown values instead of guessing", () => {
    expect(suggestWilayaCode("16 - Oran")).toBeNull();
    expect(suggestWilayaCode("99")).toBeNull();
    expect(suggestWilayaCode("Chantier nord")).toBeNull();
    expect(suggestWilayaCode("")).toBeNull();
    expect(suggestWilayaCode(null)).toBeNull();
  });
});

describe("wilayaName", () => {
  it("resolves the code", () => {
    expect(wilayaName("31")).toBe("Oran");
    expect(wilayaName("00")).toBeNull();
    expect(wilayaName(null)).toBeNull();
  });
});
