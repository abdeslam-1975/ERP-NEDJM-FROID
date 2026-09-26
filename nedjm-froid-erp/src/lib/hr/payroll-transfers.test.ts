import { describe, expect, it } from "vitest";
import { asciiName, buildTransferFile, selectTransferLines, transferAccount, type TransferSlip } from "./payroll-transfers";
import { buildCnasMonthlyFile, buildDasFile, buildG50Html } from "./declaration-files";
import type { DeclarationSlip } from "./payroll-declarations";

const slip = (over: Partial<TransferSlip>): TransferSlip => ({
  id: "s1",
  employee_id: "e1",
  site_id: null,
  matricule: "001",
  employee_name: "Benali Karim",
  status_code: "VALIDATED",
  net_payable: 45000.5,
  payment_mode_code: "CCP",
  account_no: "1234567",
  account_key: "89",
  ...over,
});

describe("transferAccount", () => {
  it("pads CCP accounts and requires the key", () => {
    expect(transferAccount("CCP", "1234567", "89")).toEqual({ ok: true, account: "000123456789" });
    expect(transferAccount("CCP", "1234567", "")).toMatchObject({ ok: false });
    expect(transferAccount("CCP", "12345678901", "12")).toMatchObject({ ok: false });
  });

  it("accepts a 20-digit RIB whole or split", () => {
    expect(transferAccount("BANK", "00100123 0000123456 78", null)).toEqual({ ok: true, account: "00100123000012345678" });
    expect(transferAccount("BANK", "001001230000123456", "78")).toEqual({ ok: true, account: "00100123000012345678" });
    expect(transferAccount("BANK", "0010012300", "78")).toMatchObject({ ok: false });
  });
});

describe("selectTransferLines", () => {
  it("keeps validated slips of the mode, skips drafts, batched slips and bad accounts", () => {
    const res = selectTransferLines(
      [
        slip({ id: "a", matricule: "003" }),
        slip({ id: "b", matricule: "001", status_code: "DRAFT" }),
        slip({ id: "c", matricule: "002" }),
        slip({ id: "d", matricule: "004", account_key: null }),
        slip({ id: "e", matricule: "005", payment_mode_code: "BANK" }),
        slip({ id: "f", matricule: "006", net_payable: 0 }),
      ],
      "CCP",
      new Set(["c"]),
    );
    expect(res.lines.map((l) => l.slip_id)).toEqual(["a"]);
    expect(res.skippedDraft).toBe(1);
    expect(res.skippedBatched).toBe(1);
    expect(res.issues).toHaveLength(1);
    expect(res.total).toBe(45000.5);
  });
});

describe("buildTransferFile", () => {
  const lines = [
    { slip_id: "a", employee_id: "e1", matricule: "001", employee_name: "Bénali Karim", account: "000123456789", amount: 45000.5 },
    { slip_id: "b", employee_id: "e2", matricule: "002", employee_name: "Saïd O'Hara", account: "000987654321", amount: 30000 },
  ];

  it("writes fixed-width CCP records with totals in centimes", () => {
    const f = buildTransferFile({
      mode: "CCP",
      batchNo: "000001/26",
      employerName: "Nedjm Froid",
      debitAccount: "0012345678 90",
      valueDate: "2026-09-30",
      label: "Salaire 09/2026",
      lines,
    });
    const rows = f.content.split("\r\n").filter(Boolean);
    expect(rows).toHaveLength(4);
    expect(rows[0].startsWith("H001234567890" + "20260930" + "000002" + "000000007500050")).toBe(true);
    expect(rows[1]).toContain("BENALI KARIM");
    expect(rows[1].slice(1, 13)).toBe("000123456789");
    expect(rows[1].slice(48, 63)).toBe("000000004500050");
    expect(new Set(rows.slice(1, 3).map((r) => r.length)).size).toBe(1);
    expect(rows[3]).toBe("T000002000000007500050");
    expect(f.total).toBe(75000.5);
    expect(f.fileName).toBe("VIR_CCP_00000126_20260930.txt");
  });

  it("writes a bank CSV", () => {
    const f = buildTransferFile({ mode: "BANK", batchNo: "000002/26", employerName: "X", debitAccount: "", valueDate: "2026-09-30", label: "Salaire", lines });
    const rows = f.content.trim().split("\r\n");
    expect(rows[0]).toBe("RIB;Beneficiaire;Montant;Libelle;Matricule");
    expect(rows[2]).toBe("000987654321;SAID O'HARA;30000.00;SALAIRE;002");
  });

  it("asciiName strips accents and pads", () => {
    expect(asciiName("Ép. Zoubir", 12)).toBe("EP ZOUBIR   ");
  });
});

const decl = (over: Partial<DeclarationSlip>): DeclarationSlip => ({
  employee_id: "e1",
  period_year: 2026,
  period_month: 9,
  site_name: "Oran",
  matricule: "001",
  employee_name: "Benali Karim",
  last_name: "Benali",
  first_name: "Karim",
  nss: "12 3456 7890",
  birth_date: "1990-05-04",
  hired_at: "2024-01-15",
  days_worked: 22,
  days_paid: 30,
  gross_amount: 50000,
  employee_ss: 4500,
  employer_ss: 13000,
  cacobatph: 0,
  intemperies_employee: 0,
  intemperies_employer: 0,
  irg_base: 45500,
  irg_amount: 3200,
  net_payable: 42300,
  status_code: "VALIDATED",
  payment_mode_code: "CCP",
  account_no: null,
  lines: [],
  ...over,
});

describe("declaration files", () => {
  const employer = { name: "NEDJM FROID", address: "Oran", nif: "0001", nis: "0002", cnas_no: "31 000" };

  it("CNAS monthly file has an employer record and one line per insured", () => {
    const f = buildCnasMonthlyFile({ employer, year: 2026, month: 9, slips: [decl({}), decl({ employee_id: "e2", matricule: "002", nss: null, last_name: "Saïd", first_name: "Ali" })] });
    const rows = f.content.trim().split("\r\n");
    expect(rows[0]).toBe("E;31 000;0001;092026;2;100000.00;35000.00");
    expect(rows[2]).toBe("1234567890;BENALI;KARIM;04/05/1990;001;30;50000.00;4500.00;13000.00;17500.00");
    expect(rows[3].startsWith(";SAID;ALI;")).toBe(true);
    expect(f.missing_nss).toHaveLength(1);
  });

  it("DAS file splits the assiette by quarter", () => {
    const f = buildDasFile({ employer, year: 2026, slips: [decl({ period_month: 2 }), decl({ period_month: 9 })] });
    const rows = f.content.trim().split("\r\n");
    expect(rows[0]).toBe("E;31 000;0001;2026;1;100000.00");
    expect(rows[2]).toBe("1234567890;BENALI;KARIM;04/05/1990;15/01/2024;02;09;30;50000.00;0;0.00;30;50000.00;0;0.00;100000.00");
  });

  it("G50 statement shows the IRG total and flags provisional payroll", () => {
    const html = buildG50Html({ employer, year: 2026, month: 9, status: "PROVISIONAL", scopeLabel: "Tous", slips: [decl({})] });
    expect(html).toContain("Septembre 2026");
    expect(html).toContain("3 200,00");
    expect(html).toContain("Ne pas déposer");
  });
});
