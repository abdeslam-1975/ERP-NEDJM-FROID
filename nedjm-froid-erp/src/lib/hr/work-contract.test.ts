import { describe, expect, it } from "vitest";
import {
  arabicAmountWords,
  arabicLongDate,
  arabicNumberWords,
  articleTitle,
  contractPrintDataToSave,
  contractPrintDefaults,
  fillContractText,
  formatDzd,
  normalizeContractTemplate,
  DEFAULT_CONTRACT_TEMPLATE,
  type ContractPrintSource,
} from "@/lib/hr/work-contract";

const source: ContractPrintSource = {
  contract_number: null,
  contract_type_code: "CDD_CHANTIER",
  poste_ar: "مهندس في التبريد والتكييف",
  poste_fr: "Ingénieur",
  start_date: "2025-12-13",
  end_date: "2026-12-12",
  salaire_net_ref_monthly: 210000,
  salaire_net_recup_monthly: 30000,
  print_data: {},
  employee: {
    matricule: "24/",
    last_name: "CHINE",
    first_name: "ABOUBAKR",
    last_name_ar: "الشين",
    first_name_ar: "أبوبكر",
    birth_date: "1991-12-28",
    birth_place_ar: null,
    birth_place_fr: "TAHIR",
    father_name: "عيسى",
    mother_name: "سيوال فتيحة",
    marital_label_ar: "متزوج",
    id_type_code: "CNI",
    id_number: "204225057",
    id_issued_on: "2019-02-17",
    id_issued_by: "الرويسات ولاية ورقلة",
    address_ar: null,
    address_fr: "BOUHAMDOUN",
  },
};

describe("arabicNumberWords", () => {
  it.each([
    [1, "واحد"],
    [10, "عشرة"],
    [21, "واحد وعشرون"],
    [100, "مائة"],
    [1000, "ألف"],
    [2000, "ألفان"],
    [3000, "ثلاثة آلاف"],
    [30000, "ثلاثون ألفًا"],
    [46000, "ستة وأربعون ألفًا"],
    [100000, "مائة ألف"],
    [200000, "مائتا ألف"],
    [210000, "مائتان وعشرة آلاف"],
    [1250000, "مليون ومائتان وخمسون ألفًا"],
  ])("%i → %s", (n, words) => {
    expect(arabicNumberWords(n)).toBe(words);
  });

  it("adds centimes", () => {
    expect(arabicAmountWords("1500.50")).toBe("ألف وخمسمائة وخمسون سنتيم");
    expect(arabicAmountWords("")).toBe("");
  });
});

describe("formatting", () => {
  it("formats dates and amounts like the paper contract", () => {
    expect(arabicLongDate("1991-12-28")).toBe("28 ديسمبر 1991");
    expect(formatDzd("210000")).toBe("210 000.00");
    expect(articleTitle(0)).toBe("المادة الأولى");
    expect(articleTitle(10)).toBe("المادة الحادية عشر");
  });

  it("fills article placeholders", () => {
    const v = contractPrintDefaults(source);
    const salary = DEFAULT_CONTRACT_TEMPLATE.articles.find((a) => a.key === "salaire")!;
    expect(fillContractText(salary.body, v)).toContain("210 000.00 دج** (مائتان وعشرة آلاف)");
    expect(fillContractText("{retenue} {retenue_lettres}", v)).toBe(".......... ..........");
  });
});

describe("contractPrintDefaults", () => {
  it("prefers Arabic fields and falls back to Latin", () => {
    const v = contractPrintDefaults(source);
    expect(v.nom).toBe("الشين أبوبكر");
    expect(v.birth_place).toBe("TAHIR");
    expect(v.id_piece).toBe("ب.ت.و");
    expect(v.net).toBe("210000");
    expect(v.is_cdi).toBe(false);
  });

  it("applies saved print values and stores only the differences", () => {
    const fileDefaults = contractPrintDefaults(source);
    const edited = { ...fileDefaults, birth_place: "الطاهير", retenue: "7000", cdd_reason: 3 };
    const saved = contractPrintDataToSave(edited, fileDefaults);
    expect(saved).toEqual({ cdd_reason: 3, birth_place: "الطاهير", retenue: "7000" });
    const again = contractPrintDefaults({ ...source, print_data: saved });
    expect(again.birth_place).toBe("الطاهير");
    expect(again.cdd_reason).toBe(3);
    expect(again.nom).toBe("الشين أبوبكر");
  });
});

describe("normalizeContractTemplate", () => {
  it("keeps defaults for missing keys", () => {
    const t = normalizeContractTemplate({ closing: "X", articles: [{ body: "A" }] });
    expect(t.closing).toBe("X");
    expect(t.title_cdd).toBe(DEFAULT_CONTRACT_TEMPLATE.title_cdd);
    expect(t.articles).toEqual([{ key: "art1", body: "A", cdd_only: false }]);
    expect(normalizeContractTemplate(null)).toEqual(DEFAULT_CONTRACT_TEMPLATE);
  });
});
