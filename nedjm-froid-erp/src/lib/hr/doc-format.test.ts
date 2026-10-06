import { describe, expect, it } from "vitest";
import { formatAmount, frenchAmountWords, frenchNumberWords, slashDateIso } from "@/lib/hr/doc-format";

describe("frenchNumberWords", () => {
  it.each([
    [0, "zéro"],
    [1, "un"],
    [17, "dix-sept"],
    [21, "vingt et un"],
    [71, "soixante et onze"],
    [77, "soixante-dix-sept"],
    [80, "quatre-vingts"],
    [81, "quatre-vingt-un"],
    [99, "quatre-vingt-dix-neuf"],
    [100, "cent"],
    [200, "deux cents"],
    [201, "deux cent un"],
    [1000, "mille"],
    [80000, "quatre-vingt mille"],
    [200000, "deux cent mille"],
    [2000000, "deux millions"],
    [1234567, "un million deux cent trente-quatre mille cinq cent soixante-sept"],
  ])("%i → %s", (n, words) => {
    expect(frenchNumberWords(n)).toBe(words);
  });

  it("writes dinars and centimes", () => {
    expect(frenchAmountWords(210000)).toBe("Deux cent dix mille dinars algériens");
    expect(frenchAmountWords(1.5)).toBe("Un dinar algérien et cinquante centimes");
  });
});

describe("printed formats", () => {
  it("formats amounts and dates", () => {
    expect(formatAmount(45000)).toBe("45 000,00");
    expect(formatAmount(1234567.891)).toBe("1 234 567,89");
    expect(slashDateIso("2026-09-26")).toBe("26/09/2026");
    expect(slashDateIso("")).toBe("");
  });
});
