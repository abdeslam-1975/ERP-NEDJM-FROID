import { describe, expect, it } from "vitest";
import { SEED_COMPANY, SEED_LIST_ITEMS } from "@/lib/doc/hr-docs.fixtures";
import { seededTemplate } from "@/lib/doc/migration-templates";
import { contractTypeDefaults } from "@/lib/hr/hr-lists";
import {
  arabicAmountWords,
  arabicLongDate,
  arabicNumberWords,
  contractCddReasons,
  contractDocData,
  contractDocType,
  contractPrintDataToSave,
  contractPrintDefaults,
  formatDzd,
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

const cdd = contractTypeDefaults(SEED_LIST_ITEMS, "CDD");

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
  });

  it("gives the templates formatted amounts, words and dotted blanks", () => {
    const v = contractPrintDefaults(source, cdd);
    const data = contractDocData(v, SEED_COMPANY);
    expect(contractDocType(v)).toBe("contrat_cdd");
    expect(data.net).toBe("210 000.00");
    expect(data.net_words).toBe("مائتان وعشرة آلاف");
    expect(data.birth_date).toBe("28 ديسمبر 1991");
    expect([data.retenue, data.retenue_words]).toEqual(["..........", ".........."]);
  });
});

describe("contractCddReasons", () => {
  it("reads the five reasons of article 12 from the seeded CDD template", () => {
    const reasons = contractCddReasons(seededTemplate("contrat_cdd"));
    expect(reasons).toHaveLength(5);
    expect(reasons[0]).toBe("عندما يوظف العامل(ة) عمل مرتبط بعقود وأشغال أو خدمات غير متجددة.");
  });
});

describe("contractPrintDefaults", () => {
  it("prefers Arabic fields and falls back to Latin", () => {
    const v = contractPrintDefaults(source, cdd);
    expect(v.nom).toBe("الشين أبوبكر");
    expect(v.birth_place).toBe("TAHIR");
    expect(v.id_piece).toBe("ب.ت.و");
    expect(v.net).toBe("210000");
    expect(v.is_cdi).toBe(false);
  });

  it("takes essai, préavis, motif and the CDI flag from the contract type", () => {
    expect([cdd.essai, cdd.preavis, cdd.cdd_reason, cdd.cdi]).toEqual(["شهرا واحدا", "ثلاثة أشهر", 5, false]);
    const cdi = contractPrintDefaults(source, contractTypeDefaults(SEED_LIST_ITEMS, "cdi"));
    expect(cdi.is_cdi).toBe(true);
    expect(contractDocType(cdi)).toBe("contrat_cdi");
    const custom = contractPrintDefaults(source, { cdi: false, essai: "ستة أشهر", preavis: "شهر", cdd_reason: 2 });
    expect([custom.essai, custom.preavis, custom.cdd_reason]).toEqual(["ستة أشهر", "شهر", 2]);
    expect(contractTypeDefaults(SEED_LIST_ITEMS, "INCONNU")).toEqual({ cdi: false, essai: "", preavis: "", cdd_reason: 1 });
  });

  it("applies saved print values and stores only the differences", () => {
    const fileDefaults = contractPrintDefaults(source, cdd);
    const edited = { ...fileDefaults, birth_place: "الطاهير", retenue: "7000", cdd_reason: 3 };
    const saved = contractPrintDataToSave(edited, fileDefaults);
    expect(saved).toEqual({ cdd_reason: 3, birth_place: "الطاهير", retenue: "7000" });
    const again = contractPrintDefaults({ ...source, print_data: saved }, cdd);
    expect(again.birth_place).toBe("الطاهير");
    expect(again.cdd_reason).toBe(3);
    expect(again.nom).toBe("الشين أبوبكر");
  });
});