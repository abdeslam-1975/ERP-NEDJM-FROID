import { describe, expect, it } from "vitest";
import { cardPeriodMatches, interpretSentence } from "@/lib/hr/filter-sentence";

const now = new Date("2026-11-25T12:00:00Z");
const november = [{ field: "card" as const, value: "2026-11" }];

describe("interpretSentence", () => {
  it("keeps the same month from different sentences", () => {
    const sentences = [
      "ارجو عرض البطاقات التي انجزتها خلال شهر نوفمبر 2026",
      "2026 نوفمبر تم تعديلها",
      "modifiées en novembre 2026",
      "11/2026",
    ];
    for (const sentence of sentences) {
      const read = interpretSentence(sentence, now);
      expect(read, sentence).toMatchObject({ status: "ready", period: { year: 2026, month: 11 } });
      if (read?.status !== "ready") continue;
      expect(cardPeriodMatches(november, read.period ?? { year: 0, month: null })).toBe(true);
      expect(cardPeriodMatches([{ field: "card", value: "2026-10" }], read.period ?? { year: 0, month: null })).toBe(false);
    }
  });

  it("keeps a name written inside the sentence", () => {
    const read = interpretSentence("حنافي الذي سجلته في نوفمبر 2026", now);
    expect(read).toMatchObject({ status: "ready", words: ["حنافي"] });
  });

  it("reads status, a missing document and a matricule from one sentence", () => {
    const read = interpretSentence("ابحث عن النشطين بدون ضمان رقم 048/24", now);
    expect(read).toMatchObject({
      status: "ready",
      facets: [
        { field: "manque", hint: "nss" },
        { field: "statut", hint: "actif" },
      ],
      matricules: ["048/24"],
      words: [],
    });
  });

  it("understands this week and last month from the current day", () => {
    const week = interpretSentence("البطاقات التي عدلتها هذا الاسبوع", now);
    const previous = interpretSentence("الشهر الماضي", now);
    expect(week).toMatchObject({ status: "ready", period: { year: 2026, month: 11 } });
    expect(previous).toMatchObject({ status: "ready", period: { year: 2026, month: 10 } });
  });

  it("waits for the year and leaves a plain name as a normal search", () => {
    expect(interpretSentence("انجزت شهر نوفمبر", now)).toEqual({ status: "pending" });
    expect(interpretSentence("benali", now)).toBeNull();
    expect(interpretSentence("ابحث عن benali", now)).toMatchObject({ status: "ready", words: ["benali"] });
  });

  it("reads the same request in French", () => {
    const read = interpretSentence("salariés actifs sans numéro de sécurité 048/24", now);
    expect(read).toMatchObject({
      status: "ready",
      facets: [
        { field: "manque", hint: "nss" },
        { field: "statut", hint: "actif" },
      ],
      matricules: ["048/24"],
      words: [],
    });
    expect(read?.status === "ready" ? read.label : "").toContain("Actif");
    expect(interpretSentence("fiches modifiées en novembre 2026", now)).toMatchObject({
      status: "ready",
      period: { year: 2026, month: 11 },
    });
    expect(interpretSentence("documents incomplets", now)).toMatchObject({
      facets: [{ field: "documents", hint: "missing" }],
    });
    expect(interpretSentence("embauchés en 2024", now)).toMatchObject({
      facets: [{ field: "annee", hint: "2024" }],
    });
    expect(interpretSentence("بدون رقم الضمان", now)).toMatchObject({
      facets: [{ field: "manque", hint: "nss" }],
    });
  });

  it("reads a hire year and incomplete documents", () => {
    expect(interpretSentence("توظيف 2024", now)).toMatchObject({
      status: "ready",
      facets: [{ field: "annee", hint: "2024" }],
    });
    expect(interpretSentence("وثائق ناقصة", now)).toMatchObject({
      status: "ready",
      facets: [{ field: "documents", hint: "missing" }],
    });
  });
});
