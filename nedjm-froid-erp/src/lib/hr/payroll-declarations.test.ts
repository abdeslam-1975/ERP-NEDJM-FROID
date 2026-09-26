import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  declarationStatus,
  normalizePaymentMode,
  summarizeAnnualDas,
  summarizeMonthlyDeclarations,
  type DeclarationSlip,
} from "@/lib/hr/payroll-declarations";
import { buildAnnualDasWorkbook, buildMonthlyDeclarationsWorkbook } from "@/lib/hr/payroll-declarations-excel";

function slip(over: Partial<DeclarationSlip>): DeclarationSlip {
  return {
    employee_id: "e1",
    period_year: 2026,
    period_month: 9,
    site_name: "Chantier A",
    matricule: "M001",
    employee_name: "BENALI Karim",
    nss: "123456789012",
    birth_date: "1990-01-01",
    hired_at: "2024-03-01",
    days_worked: 22,
    days_paid: 30,
    gross_amount: 50000,
    employee_ss: 4500,
    employer_ss: 13000,
    cacobatph: 6105,
    intemperies_employee: 375,
    intemperies_employer: 375,
    irg_base: 45500,
    irg_amount: 4200,
    net_payable: 40925,
    status_code: "VALIDATED",
    payment_mode_code: "CCP",
    account_no: "0012345678",
    account_key: "12",
    lines: [
      { nature: "gain", amount: 50000 },
      { nature: "indemnite", amount: 3000 },
      { nature: "retenue", amount: -1000 },
    ],
    ...over,
  };
}

const employer = {
  name: "NEDJM FROID",
  address: "Alger",
  nif: "000116000000000",
  nis: "000116000000000",
  cnas_no: "16000000",
  cacobatph_no: "",
};

describe("monthly declarations", () => {
  const slips = [
    slip({}),
    slip({
      employee_id: "e2",
      matricule: "M002",
      employee_name: "SAIDI Amine",
      nss: null,
      gross_amount: 30000,
      employee_ss: 2700,
      employer_ss: 7800,
      cacobatph: 0,
      intemperies_employee: 0,
      intemperies_employer: 0,
      irg_base: 27300,
      irg_amount: 0,
      net_payable: 27300,
      payment_mode_code: "bank",
      account_no: "",
      lines: [{ nature: "gain", amount: 30000 }],
    }),
  ];
  const d = summarizeMonthlyDeclarations(slips);

  it("totals CNAS parts on the cotisable base", () => {
    expect(d.cnas.totals).toEqual({ assiette: 80000, part_salariale: 7200, part_patronale: 20800, total: 28000 });
    expect(d.cnas.missing_nss).toEqual(["M002 SAIDI Amine"]);
  });

  it("reports IRG withheld for the G50 and counts only taxed employees", () => {
    expect(d.irg.totals).toEqual({ taxed_employees: 1, irg_base: 72800, irg_amount: 4200 });
  });

  it("keeps only employees subject to CACOBATPH", () => {
    expect(d.cacobatph.rows).toHaveLength(1);
    expect(d.cacobatph.totals.total).toBe(6855);
  });

  it("groups transfers by payment mode and flags missing accounts", () => {
    expect(d.transfers.groups.map((g) => [g.mode, g.total])).toEqual([
      ["CCP", 40925],
      ["BANK", 27300],
    ]);
    expect(d.transfers.groups[0].rows[0].account).toBe("0012345678 clé 12");
    expect(d.transfers.missing_account).toEqual(["M002 SAIDI Amine"]);
    expect(d.transfers.total).toBe(68225);
  });

  it("computes gross from gain lines and the employer cost", () => {
    expect(d.journal.gross_total).toBe(83000);
    expect(d.journal.employer_cost).toBe(68225 + 7200 + 375 + 4200 + 20800 + 6105 + 375);
  });

  it("builds a workbook with one sheet per declaration", async () => {
    const buffer = await buildMonthlyDeclarationsWorkbook({
      year: 2026,
      month: 9,
      status: "PROVISIONAL",
      employer,
      scopeLabel: "Tous les chantiers",
      slips,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Récapitulatif",
      "Livre de paie",
      "CNAS",
      "IRG (G50)",
      "CACOBATPH",
      "Virements",
    ]);
  });
});

describe("annual DAS", () => {
  it("sums assiette and days per quarter for each employee", () => {
    const das = summarizeAnnualDas([
      slip({ period_month: 1, gross_amount: 40000, days_paid: 30 }),
      slip({ period_month: 2, gross_amount: 40000, days_paid: 28 }),
      slip({ period_month: 7, gross_amount: 45000, days_paid: 31, employee_name: "BENALI Karim (nouveau)" }),
    ]);
    expect(das.rows).toHaveLength(1);
    const row = das.rows[0];
    expect(row.quarters).toEqual([
      { days: 58, assiette: 80000 },
      { days: 0, assiette: 0 },
      { days: 31, assiette: 45000 },
      { days: 0, assiette: 0 },
    ]);
    expect(row.assiette_total).toBe(125000);
    expect([row.first_month, row.last_month]).toEqual([1, 7]);
    expect(row.employee_name).toBe("BENALI Karim (nouveau)");
  });

  it("builds the DAS workbook", async () => {
    const buffer = await buildAnnualDasWorkbook({ year: 2026, status: "FINAL", employer, slips: [slip({})] });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    expect(wb.worksheets[0].name).toBe("DAS 2026");
  });
});

describe("declaration helpers", () => {
  it("is final only when every run is validated or closed", () => {
    expect(declarationStatus([])).toBe("PROVISIONAL");
    expect(declarationStatus(["VALIDATED", "DRAFT"])).toBe("PROVISIONAL");
    expect(declarationStatus(["VALIDATED", "LOCKED"])).toBe("FINAL");
  });

  it("normalizes payment modes", () => {
    expect(normalizePaymentMode("ccp")).toBe("CCP");
    expect(normalizePaymentMode(null)).toBe("NONE");
    expect(normalizePaymentMode("CHEQUE")).toBe("NONE");
  });
});
