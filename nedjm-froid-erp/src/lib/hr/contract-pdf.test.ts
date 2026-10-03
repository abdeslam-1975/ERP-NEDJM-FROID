import { describe, expect, it } from "vitest";
import { contractFormFromPdf, contractPdfSchema, matchPdfEmployee } from "@/lib/hr/contract-pdf";

const read = contractPdfSchema.parse({
  contract_number: "2025/108",
  contract_kind: "CDD",
  last_name_ar: "الشين",
  first_name_ar: "أبوبكر",
  last_name_latin: "CHINE",
  first_name_latin: "ABOUBAKR",
  serial_number: "24/",
  birth_date: "1991-12-28",
  poste_ar: "مهندس في التبريد والتكييف",
  poste_fr: "Ingenieur en froid et climatisation",
  start_date: "2025-12-13",
  end_date: "2026-12-12",
  net_salary_monthly: 210000,
  recup_monthly: 30000,
  absence_deduction_daily: 46000,
  site: null,
});

const employees = [
  { id: "a", matricule: "0012", last_name: "CHINE", first_name: "ABOUBAKR", birth_date: "1991-12-28" },
  { id: "b", matricule: "0013", last_name: "CHINE", first_name: "MOHAMED", birth_date: "1988-01-02" },
  { id: "c", matricule: "0014", last_name: "TAMER", first_name: "SAID", birth_date: null },
];

describe("contract pdf", () => {
  it("nulls fields the model returns in a wrong shape", () => {
    const r = contractPdfSchema.parse({ ...read, birth_date: "28/12/1991", net_salary_monthly: "210 000", contract_kind: "X" });
    expect(r.birth_date).toBeNull();
    expect(r.net_salary_monthly).toBeNull();
    expect(r.contract_kind).toBeNull();
  });

  it("matches on birth date and name", () => {
    expect(matchPdfEmployee(read, employees).employee_id).toBe("a");
  });

  it("matches on Arabic name without diacritics or hamza", () => {
    const list = [{ ...employees[2], id: "z", last_name_ar: "الشين", first_name_ar: "ابوبكر" }, employees[1]];
    expect(matchPdfEmployee({ ...read, birth_date: null, last_name_latin: null, first_name_latin: null }, list).employee_id).toBe("z");
  });

  it("uses the file name when nothing else is read", () => {
    const blind = { ...read, birth_date: null, last_name_ar: null, first_name_ar: null, last_name_latin: null, first_name_latin: null };
    expect(matchPdfEmployee(blind, employees, "CHINE ABOUBAKR (1).PDF").employee_id).toBe("a");
  });

  it("proposes candidates without choosing on a tie", () => {
    const blind = { ...read, birth_date: null, last_name_ar: null, first_name_ar: null, first_name_latin: null };
    const m = matchPdfEmployee(blind, employees);
    expect(m.employee_id).toBeNull();
    expect(m.candidates).toEqual(expect.arrayContaining(["a", "b"]));
  });

  it("snaps the start to the 1st and fills the form", () => {
    const { form, warnings } = contractFormFromPdf(read);
    expect(form).toMatchObject({
      contract_type_code: "CDD",
      start_date: "2025-12-01",
      end_date: "2026-12-12",
      poste_fr: "INGENIEUR EN FROID ET CLIMATISATION",
      salaire_net_ref_monthly: "210000",
      salaire_net_recup_monthly: "30000",
      retenue: "46000",
    });
    expect(warnings.join(" ")).toMatch(/13\/12\/2025/);
    expect(warnings.join(" ")).toMatch(/Chantier/);
  });
});
