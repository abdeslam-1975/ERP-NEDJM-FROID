import { describe, expect, it } from "vitest";
import { findEmployeeForFicheSearch } from "@/lib/hr/employee-fiche-search";

const rows = [
  {
    id: "1",
    matricule: "05/26",
    last_name: "Benali",
    first_name: "Karim",
    last_name_ar: "بن علي",
    first_name_ar: "كريم",
    nss: "90041200123",
    nin: "109900123456789012",
  },
  {
    id: "2",
    matricule: "12/24",
    last_name: "Saidi",
    first_name: "Amine",
    nss: null,
    nin: null,
  },
  {
    id: "3",
    matricule: "01/25",
    last_name: "Benali",
    first_name: "Sara",
    nss: null,
    nin: null,
  },
];

describe("findEmployeeForFicheSearch", () => {
  it("matches matricule, NSS and NIN exactly", () => {
    expect(findEmployeeForFicheSearch(rows, "05/26")).toMatchObject({ ok: true, employee: { id: "1" } });
    expect(findEmployeeForFicheSearch(rows, "90041200123")).toMatchObject({ ok: true, employee: { id: "1" } });
    expect(findEmployeeForFicheSearch(rows, "109900123456789012")).toMatchObject({
      ok: true,
      employee: { id: "1" },
    });
  });

  it("matches first name, last name and Arabic names", () => {
    expect(findEmployeeForFicheSearch(rows, "amine")).toMatchObject({ ok: true, employee: { id: "2" } });
    expect(findEmployeeForFicheSearch(rows, "saidi amine")).toMatchObject({ ok: true, employee: { id: "2" } });
    expect(findEmployeeForFicheSearch(rows, "كريم")).toMatchObject({ ok: true, employee: { id: "1" } });
  });

  it("asks to refine when several names match", () => {
    const result = findEmployeeForFicheSearch(rows, "benali");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Plusieurs employés/);
  });

  it("returns a clear miss", () => {
    expect(findEmployeeForFicheSearch(rows, "zzz")).toMatchObject({ ok: false });
    expect(findEmployeeForFicheSearch(rows, "  ")).toMatchObject({ ok: false });
  });
});
