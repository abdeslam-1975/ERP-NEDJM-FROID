import { describe, expect, it } from "vitest";
import { clientUpsertSchema } from "@/lib/validations/client";

const base = { nom_fr: "Sonatrach" };

describe("clientUpsertSchema", () => {
  it("exige le nom français et convertit les champs vides en null", () => {
    const empty = clientUpsertSchema.safeParse({ nom_fr: "  " });
    expect(empty.success).toBe(false);

    const parsed = clientUpsertSchema.parse({
      ...base,
      email: "  ",
      telephone: "",
      nif: "",
    });
    expect(parsed.nom_fr).toBe("Sonatrach");
    expect(parsed.email).toBeNull();
    expect(parsed.telephone).toBeNull();
    expect(parsed.nif).toBeNull();
  });

  it("refuse un e-mail, un téléphone court, un NIF ou un RIB incorrects", () => {
    const bad = clientUpsertSchema.safeParse({
      ...base,
      email: "pas-un-mail",
      telephone: "123",
      nif: "123",
      banque_rib: "12345",
      site_web: "pas un site",
    });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      const messages = bad.error.issues.map((issue) => issue.message).join(" ");
      expect(messages).toContain("E-mail invalide.");
      expect(messages).toContain("Téléphone");
      expect(messages).toContain("NIF");
      expect(messages).toContain("RIB");
      expect(messages).toContain("Site web");
    }
  });

  it("accepte un client complet", () => {
    const parsed = clientUpsertSchema.parse({
      ...base,
      code_client: "cli-ouargla",
      nom_ar: "سوناطراك",
      nif: "123456789012345",
      nis: "123456789012345",
      rc: "30/00-1234567B19",
      telephone: "+213 29 70 00 00",
      email: "contact@sonatrach.dz",
      site_web: "sonatrach.dz",
      wilaya: "Ouargla",
      commune: "Hassi Messaoud",
      banque_rib: "12345678901234567890",
    });
    expect(parsed.code_client).toBe("CLI-OUARGLA");
    expect(parsed.commune).toBe("Hassi Messaoud");
  });
});
