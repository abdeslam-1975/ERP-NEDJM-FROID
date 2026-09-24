import { describe, expect, it } from "vitest";
import { extractFieldsFromOcrText } from "@/lib/hr/ocr/extractors";

describe("extractFieldsFromOcrText — CNI", () => {
  it("extrait les champs de la carte biométrique DZ (face + verso simulé)", () => {
    const text = `
      الجمهورية الجزائرية الديمقراطية الشعبية
      بطاقة التعريف الوطنية
      100922262
      رقم التعريف الوطني 109820210001860006
      سلطة الإصدار باتنة - باتنة
      تاريخ الإصدار 2016.09.24
      تاريخ الإنتهاء 2026.09.23
      اللقب معجوج
      الإسم حسام
      تاريخ الميلاد 1982.02.10
      مكان الميلاد باتنة
      الجنس ذكر
      Rh: A+
      NOM MAADJOUDJ
      PRENOM HOUSSAM
    `;
    const r = extractFieldsFromOcrText("CNI", text);
    const map = Object.fromEntries(r.suggestions.map((s) => [s.code, s.value]));
    expect(map.nin).toBe("109820210001860006");
    expect(map.id_number).toBe("100922262");
    expect(map.last_name_ar).toContain("معجوج");
    expect(map.first_name_ar).toContain("حسام");
    expect(map.last_name).toBe("MAADJOUDJ");
    expect(map.first_name).toBe("HOUSSAM");
    expect(map.blood_code).toBe("A+");
    expect(map.sex_code).toBe("M");
    expect(map.birth_date).toBe("1982-02-10");
    expect(map.birth_place_ar).toMatch(/باتنة/);
    expect(map.id_issued_on).toBe("2016-09-24");
    expect(map.id_expires_on).toBe("2026-09-23");
    expect(map.id_issued_by).toMatch(/باتنة/);
    expect(r.suggestions.find((s) => s.code === "id_issued_by")?.label).toBe("صادرة عن");
    expect(map.id_type_code).toBe("CNI");
  });
});

describe("extractFieldsFromOcrText — BIRTH / SS", () => {
  it("BIRTH : champs demandés (noms, date, acte, sexe, père, mère, commune)", () => {
    const text = `
      وزارة الداخلية والجماعات المحلية
      ولاية الجزائر
      دائرة الدار البيضاء
      بلدية باب الزوار
      رقم الحالة المدنية 12345
      شهادة الميلاد
      اللقب فلان
      الإسم علان
      ابن عبد الرحمان
      و من فاطمة الزهراء بنت محمد
      الجنس ذكر
      المولود في 15.03.1995
      ببلدية وهران
      رقم التعريف الوطني 185010120001234567
    `;
    const r = extractFieldsFromOcrText("BIRTH", text);
    const map = Object.fromEntries(r.suggestions.map((s) => [s.code, s.value]));
    expect(map.last_name_ar).toContain("فلان");
    expect(map.first_name_ar).toContain("علان");
    expect(map.birth_act_no).toBe("12345");
    expect(map.birth_date).toBe("1995-03-15");
    expect(map.sex_code).toBe("M");
    expect(map.father_name).toMatch(/عبد\s*الرحمان/);
    expect(map.mother_name).toMatch(/فاطمة/);
    expect(map.commune_birth).toMatch(/وهران/);
  });

  it("SS_REGISTRATION : NSS prioritaire + identité si lisible", () => {
    const text = `
      ATTESTATION N° 2TQQMJCZLFG
      Nom : TAHRI
      Prénom : SAMI
      Date et lieu de Naissance : 14/05/1982 à EL BIAR
      N° Acte : 12345
      Adresse : INFSCJ TOUDRAINE
      Sous le numéro : 111222333444
      Immatriculé(e) sous le numéro : 914 379 002 240
      المسجل تحت رقم 914379002240
      Depuis le 29/11/2015
    `;
    const r = extractFieldsFromOcrText("SS_REGISTRATION", text);
    const map = Object.fromEntries(r.suggestions.map((s) => [s.code, s.value]));
    expect(map.nss).toBe("914379002240");
    expect(map.last_name).toBe("TAHRI");
    expect(map.first_name).toBe("SAMI");
    expect(map.birth_date).toBe("1982-05-14");
    expect(map.birth_act_no).toBe("12345");
  });
});
