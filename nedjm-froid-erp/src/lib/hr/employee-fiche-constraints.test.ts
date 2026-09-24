import { describe, expect, it } from "vitest";
import {
  sanitizeFicheInput,
  validateFicheConstraints,
  normalizeFicheValues,
  todayIsoDate,
  tomorrowIsoDate,
  FICHE_ACCOUNT_PREFIX,
} from "@/lib/hr/employee-fiche-constraints";

describe("sanitizeFicheInput", () => {
  it("force la MAJUSCULE sur les champs latins", () => {
    expect(sanitizeFicheInput("last_name", "ben ali")).toBe("BEN ALI");
    expect(sanitizeFicheInput("address_fr", "rue abc")).toBe("RUE ABC");
  });

  it("ne majuscule pas l'arabe ni l'email", () => {
    expect(sanitizeFicheInput("last_name_ar", "بن علي")).toBe("بن علي");
    expect(sanitizeFicheInput("email", "Test@Mail.Dz")).toBe("Test@Mail.Dz");
  });

  it("limite NSS / NIN / acte / pièce / compte aux chiffres", () => {
    expect(sanitizeFicheInput("nss", "12ab345678901234")).toBe("123456789012");
    expect(sanitizeFicheInput("nin", "1".repeat(25))).toHaveLength(18);
    expect(sanitizeFicheInput("birth_act_no", "12a3456")).toBe("12345");
    expect(sanitizeFicheInput("id_number", "1234567890")).toBe("123456789");
    expect(sanitizeFicheInput("account_no", "0079999900156812752399")).toHaveLength(20);
  });

  it("délivrance : refuse le futur, accepte aujourd'hui", () => {
    expect(sanitizeFicheInput("id_issued_on", "2099-01-01")).toBe("");
    expect(sanitizeFicheInput("id_issued_on", todayIsoDate())).toBe(todayIsoDate());
  });

  it("expiration : refuse passé et aujourd'hui, accepte demain", () => {
    expect(sanitizeFicheInput("id_expires_on", "2020-01-01")).toBe("");
    expect(sanitizeFicheInput("id_expires_on", todayIsoDate())).toBe("");
    expect(sanitizeFicheInput("id_expires_on", tomorrowIsoDate())).toBe(tomorrowIsoDate());
  });
});

describe("validateFicheConstraints", () => {
  it("accepte des valeurs valides", () => {
    expect(
      validateFicheConstraints({
        nss: "914379002240",
        nin: "1".repeat(18),
        birth_act_no: "12345",
        id_number: "123456789",
        account_no: `${FICHE_ACCOUNT_PREFIX}001568127523`,
        id_issued_on: "2020-01-15",
        id_expires_on: tomorrowIsoDate(),
      }),
    ).toEqual([]);
  });

  it("rejette NSS trop court et compte sans préfixe", () => {
    const issues = validateFicheConstraints({
      nss: "123",
      account_no: "12345678901234567890",
    });
    expect(issues.some((i) => i.code === "nss")).toBe(true);
    expect(issues.some((i) => i.code === "account_no")).toBe(true);
  });

  it("délivrance future refusée ; expiration passée / aujourd'hui refusées", () => {
    const issues = validateFicheConstraints({
      id_issued_on: "2099-01-01",
      id_expires_on: todayIsoDate(),
    });
    expect(issues.some((i) => i.code === "id_issued_on")).toBe(true);
    expect(issues.some((i) => i.code === "id_expires_on")).toBe(true);
  });

  it("laisse vide = ok", () => {
    expect(validateFicheConstraints({ nss: "", nin: null })).toEqual([]);
  });
});

describe("normalizeFicheValues", () => {
  it("applique MAJUSCULE et digits", () => {
    const n = normalizeFicheValues({
      last_name: "hani",
      nss: "914-379-002-240",
    });
    expect(n.last_name).toBe("HANI");
    expect(n.nss).toBe("914379002240");
  });
});
