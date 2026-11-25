import { describe, expect, it } from "vitest";
import { nextFicheReference } from "@/lib/hr/fiche-reference";

describe("nextFicheReference", () => {
  it("starts the year at 001", () => {
    expect(nextFicheReference(2026, [])).toBe("2026/001");
  });

  it("continues after the highest number of that year and ignores other years", () => {
    expect(nextFicheReference(2026, ["2025/040", "2026/014", "2026/2"])).toBe("2026/015");
  });
});
