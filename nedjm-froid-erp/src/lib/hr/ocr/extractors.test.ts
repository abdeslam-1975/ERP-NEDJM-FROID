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
    expect(map.hired_at).toBe("2015-11-29");
    expect(map.address_fr).toMatch(/TOUDRAINE/);
  });

  it("déclaration d'affiliation : employeur NEDJM FROID puis l'assuré seulement", () => {
    const text = `
      Déclaration et demande d'affiliation d'un assuré social
      RENSEIGNEMENTS CONCERNANT L'EMPLOYEUR OU L'ORGANISME ASSIMILE
      Numéro de l'employeur : 30562357 53
      Nom/Prénom ou Raison sociale
      EURL NEDJEM FROID ENT MONTAGE SYSTEME FROID
      CITE SI EL HAOUES 1850 LOGTS HASSI MESSAOUD
      RENSEIGNEMENTS CONCERNANT L'ASSURE SOCIAL
      Numéro d'immatriculation : 9143790022 40
      Nom : CHINE
      اللقب شين
      Prénom : ABOUBAKR
      الاسم أبوبكر
      Date de naissance : 28 DÉCEMBRE 1991
      Numéro d'acte de naissance : 04379
      Sexe : Masculin
      Situation familiale : Marié(e)
      Groupe sanguin : A+
      Prénom du père : AISSA
      Nom de la mère : SIOUAL
      Prénom de la mère : FATIHA
      Nationalité : ALGERIE
      Commune de naissance : TAHER
      Numéro d'identification national : 109910652043790001
      Wilaya de naissance : JIJEL
      RIP/RIB : 007 99999 001568127523
      Adresse complète : CITE 1200 LOGTS HASSI MESSAOUD حي 1200
      Commune : HASSI MESSAOUD
      Wilaya : OUARGLA
      Code postal : 30500
      Téléphone : 0661234567
      RENSEIGNEMENTS CONCERNANT L'AFFILIATION
      Date de recrutement : 13 DÉCEMBRE 2024
      Date de déclaration : 16 DÉCEMBRE 2024
      Poste occupé : INGENIEUR EN FROID ET CLIMATISATION
      RENSEIGNEMENTS CONCERNANT LE(S) CONJOINT(S) AYANTS DROIT
      Nom : TOUIL
      Prénom : CHAIM
    `;
    const r = extractFieldsFromOcrText("SS_REGISTRATION", text);
    const map = Object.fromEntries(r.suggestions.map((s) => [s.code, s.value]));
    expect(r.notice).toBeUndefined();
    expect(map.nss).toBe("914379002240");
    expect(map.last_name).toBe("CHINE");
    expect(map.last_name_ar).toBe("شين");
    expect(map.first_name).toBe("ABOUBAKR");
    expect(map.first_name_ar).toBe("أبوبكر");
    expect(map.birth_date).toBe("1991-12-28");
    expect(map.commune_birth).toBe("TAHER");
    expect(map.birth_act_no).toBe("04379");
    expect(map.sex_code).toBe("M");
    expect(map.marital_code).toBe("M");
    expect(map.blood_code).toBe("A+");
    expect(map.nin).toBe("109910652043790001");
    expect(map.father_name).toBe("AISSA");
    expect(map.mother_name).toBe("SIOUAL FATIHA");
    expect(map.nationality).toBe("ALGERIE");
    expect(map.hired_at).toBe("2024-12-13");
    expect(map.declaration_date).toBe("2024-12-16");
    expect(map.poste).toBe("INGENIEUR EN FROID ET CLIMATISATION");
    expect(map.account_no).toBe("00799999001568127523");
    expect(map.address_fr).toBe("CITE 1200 LOGTS HASSI MESSAOUD");
    expect(map.commune).toBe("HASSI MESSAOUD");
    expect(map.wilaya_code).toBe("OUARGLA");
    expect(map.postal_code).toBe("30500");
    expect(map.phone).toBe("0661234567");
    expect(map.last_name).not.toBe("TOUIL");
  });

  it("déclaration HANAFI : extrait la page assuré et ignore enfants et conjoint", () => {
    const text = `
      Agence : OUARGLA
      Déclaration et demande d'affiliation d'un assuré social
      N°2430562357000069
      RENSEIGNEMENTS CONCERNANT L'EMPLOYEUR OU L'ORGANISME ASSIMILE
      Numéro de l'employeur : 30562357 53
      Nom/Prénom ou Raison sociale
      EURL NEDJEM FROID ENT MONTAGE SYSTEME FROID
      CITE SI EL HAOUES 1850 LOGTS HASSI MESSAOUD
      RENSEIGNEMENTS CONCERNANT L'ASSURE SOCIAL
      Numéro d'immatriculation : 8506300109 56
      Nom : HANAFI                    اللقب حنفي
      Prénom : ALI                    الاسم علي
      Date de naissance : 22 SEPTEMBRE 1985    Numéro d'acte de naissance : 00630
      Sexe : Masculin    Situation familiale : Marié(e)    Groupe sanguin : A-
      Prénom du père : ABD ELLEH      إسم الأب عبد الله
      Nom de la mère : HANAFI         لقب الأم حنفي
      Prénom de la mère : AIDA        إسم الأم عيدة
      Nationalité : ALGERIE
      Pays de naissance : ALGERIE
      Wilaya de naissance : DJELFA
      Commune de naissance : FEIDH EL BOTMA
      Numéro d'identification national : 108850616006300001    RIP/RIB : 00799999001126913614
      Adresse complète                 العنوان الكامل
      CITE 50 N°21 AIN SAHRA NEZLA TOUGGOURT    حي 50 رقم 21 عين الصحراء النزلة توقرت
      - NEZLA - Touggourt
      RENSEIGNEMENTS CONCERNANT L'AFFILIATION
      Date de recrutement : 13 DÉCEMBRE 2024    Date de déclaration : 16 DÉCEMBRE 2024
      Poste occupé : Technicien supérieur en froid et climatisation
      Edité le dimanche, 22 novembre 2026
      RENSEIGNEMENTS CONCERNANT LES ENFANTS AYANTS DROIT
      Nom : HANAFI
      Prénom : ABD ELLEH
      Date de naissance : 20/09/2016
      Sexe : Masculin
      Nom : HANAFI
      Prénom : BEN AISSA
      Date de naissance : 13/03/2019
      Sexe : Masculin
      Nom : HANAFI
      Prénom : SALSABILE
      Date de naissance : 09/05/2022
      Sexe : Féminin
      RENSEIGNEMENTS CONCERNANT LE(S) CONJOINT(S) AYANTS DROIT
      Nom : HANAFI
      Prénom : SOUMIA
      Date de naissance : 18/06/1991
      Sexe : Féminin
    `;
    const r = extractFieldsFromOcrText("SS_REGISTRATION", text);
    const map = Object.fromEntries(r.suggestions.map((s) => [s.code, s.value]));
    expect(r.notice).toBeUndefined();
    expect(map.nss).toBe("850630010956");
    expect(map.last_name).toBe("HANAFI");
    expect(map.last_name_ar).toBe("حنفي");
    expect(map.first_name).toBe("ALI");
    expect(map.first_name_ar).toBe("علي");
    expect(map.birth_date).toBe("1985-09-22");
    expect(map.birth_act_no).toBe("00630");
    expect(map.sex_code).toBe("M");
    expect(map.marital_code).toBe("M");
    expect(map.blood_code).toBe("A-");
    expect(map.father_name).toBe("ABD ELLEH عبد الله");
    expect(map.mother_name).toBe("HANAFI AIDA حنفي عيدة");
    expect(map.nationality).toBe("ALGERIE");
    expect(map.commune_birth).toBe("FEIDH EL BOTMA");
    expect(map.nin).toBe("108850616006300001");
    expect(map.account_no).toBe("00799999001126913614");
    expect(map.address_fr).toBe("CITE 50 N°21 AIN SAHRA NEZLA TOUGGOURT - NEZLA - TOUGGOURT");
    expect(map.hired_at).toBe("2024-12-13");
    expect(map.declaration_date).toBe("2024-12-16");
    expect(map.poste).toBe("TECHNICIEN SUPÉRIEUR EN FROID ET CLIMATISATION");
    expect(map.first_name).not.toBe("SOUMIA");
    expect(map.birth_date).not.toBe("2016-09-20");
  });

  it("déclaration d'affiliation : refuse l'extraction si l'employeur n'est pas NEDJM FROID", () => {
    const text = `
      Déclaration et demande d'affiliation d'un assuré social
      RENSEIGNEMENTS CONCERNANT L'EMPLOYEUR
      Nom/Prénom ou Raison sociale
      AUTRE SOCIETE SARL
      RENSEIGNEMENTS CONCERNANT L'ASSURE SOCIAL
      Numéro d'immatriculation : 9143790022 40
      Nom : CHINE
      Prénom : ABOUBAKR
    `;
    const r = extractFieldsFromOcrText("SS_REGISTRATION", text);
    expect(r.suggestions).toEqual([]);
    expect(r.notice).toMatch(/NEDJM FROID/);
  });
});
