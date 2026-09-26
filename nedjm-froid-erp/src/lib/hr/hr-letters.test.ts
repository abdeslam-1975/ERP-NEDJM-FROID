import { describe, expect, it } from "vitest";
import {
  defaultLetterBody,
  emptyLetterValues,
  frenchAmountWords,
  frenchNumberWords,
  letterParagraphs,
  normalizeLetterValues,
} from "@/lib/hr/hr-letters";
import { buildHrLetterHtml } from "@/components/rh/hr-letter-print";

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

describe("letters", () => {
  const v = {
    ...emptyLetterValues("ATTEST"),
    numero: "000004/26",
    nom_fr: "CHINE ABOUBAKR",
    nom_ar: "شين أبوبكر",
    poste_fr: "Frigoriste",
    poste_ar: "تقني تبريد",
    birth_date: "1990-05-02",
    birth_place_fr: "Ouargla",
    start_date: "2024-03-01",
    date_doc: "2026-09-26",
  };

  it("agrees with the employee's gender", () => {
    expect(defaultLetterBody(v)[0]).toContain("Monsieur CHINE ABOUBAKR, né le 02/05/1990 à Ouargla, est employé ");
    const f = defaultLetterBody({ ...v, sex: "F" })[0];
    expect(f).toContain("Madame CHINE ABOUBAKR, née le");
    expect(f).toContain("employée");
    expect(defaultLetterBody({ ...v, sex: "F", lang: "ar" })[0]).toContain("السيدة شين أبوبكر المولودة");
  });

  it("uses typed text when provided", () => {
    expect(letterParagraphs({ ...v, body: "Ligne 1\n\nLigne 2" })).toEqual(["Ligne 1", "Ligne 2"]);
  });

  it("writes the receipt amount in words", () => {
    const stc = { ...v, kind: "STC" as const, amount: "45000", end_date: "2026-09-15" };
    expect(defaultLetterBody(stc)[0]).toContain("45 000,00 DA (Quarante-cinq mille dinars algériens)");
  });

  it("normalizes a stored payload", () => {
    const n = normalizeLetterValues({ lang: "ar", sex: "X", nom_fr: 12, lines: [{ label_fr: "ICP", amount: "10" }], hack: 1 }, "STC");
    expect(n.lang).toBe("ar");
    expect(n.sex).toBe("M");
    expect(n.nom_fr).toBe("12");
    expect(n.lines).toEqual([{ label_fr: "ICP", label_ar: "", amount: 10 }]);
    expect("hack" in n).toBe(false);
  });

  it("renders an RTL page with the letterhead and isolated numbers", () => {
    const html = buildHrLetterHtml({ ...v, lang: "ar" }, "https://x/hr-letterhead.png");
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("إفادة عمل");
    expect(html).toContain('src="https://x/hr-letterhead.png"');
    expect(html).toContain('<bdi dir="ltr">000004/26</bdi>');
  });

  it("escapes user text", () => {
    const html = buildHrLetterHtml({ ...v, body: "<script>x</script>" }, "/l.png");
    expect(html).not.toContain("<script>x");
    expect(html).toContain("&lt;script&gt;");
  });
});
