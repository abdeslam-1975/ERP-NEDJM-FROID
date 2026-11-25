import { describe, expect, it } from "vitest";
import { confirmFicheIdentity } from "@/components/rh/employee-identity";
import type { ExistingEmployee } from "@/lib/hr/employee-import";

const existing: ExistingEmployee = {
  id: "old",
  matricule: "019/08",
  nin: "123456789012345678",
  nss: "123456789012",
  last_name: "HANAFI",
  first_name: "ALI",
  birth_date: "1980-01-01",
  hired_at: "2008-12-19",
};

const copy = {
  id: "",
  nin: "123456789012345678",
  nss: "123456789012",
  last_name: "HANAFI",
  first_name: "ALI",
  birth_date: "1980-01-01",
  hired_at: "2026-11-23",
  matricule: "",
};

describe("confirmFicheIdentity nouvelle entrée", () => {
  it("garde le même matricule et la même fiche", () => {
    const decision = confirmFicheIdentity(
      { ...copy, id: "old", matricule: "019/08" },
      [existing],
      false,
      { newEntry: true, previousHiredAt: "2008-12-19" },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.values.id).toBe("old");
    expect(decision.values.matricule).toBe("019/08");
    expect(decision.values.hired_at).toBe("2026-11-23");
    expect(existing.hired_at).toBe("2008-12-19");
  });

  it("refuse la même date que le premier recrutement", () => {
    const decision = confirmFicheIdentity(
      { ...copy, hired_at: "2008-12-19" },
      [existing],
      false,
      { newEntry: true, previousHiredAt: "2008-12-19" },
    );
    expect(decision.ok).toBe(false);
  });

  it("refuse une date incomplète", () => {
    const decision = confirmFicheIdentity(
      { ...copy, hired_at: "2026-11" },
      [existing],
      false,
      { newEntry: true, previousHiredAt: "2008-12-19" },
    );
    expect(decision.ok).toBe(false);
  });

  it("sans nouvelle entrée, le même NIN met à jour l'ancienne carte", () => {
    const decision = confirmFicheIdentity(copy, [existing], false);
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.values.id).toBe("old");
    expect(decision.values.matricule).toBe("019/08");
    expect(decision.values.hired_at).toBe("2026-11-23");
  });
});
