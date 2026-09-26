import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACCOUNTS,
  allocatePayrollCosts,
  buildPayrollJournal,
  journalCsv,
  resolveAccounts,
  slipCost,
  type CostSlip,
} from "./cost-allocation";

const slip = (over: Partial<CostSlip>): CostSlip => ({
  id: "s1",
  employee_id: "e1",
  site_id: "A",
  employee_ss: 4500,
  employer_ss: 13000,
  cacobatph: 6000,
  intemperies_employee: 375,
  intemperies_employer: 375,
  irg_amount: 3000,
  net_payable: 39125,
  lines: [
    { nature: "base", source_code: "base", amount: 45000 },
    { nature: "prime", source_code: "contract", amount: 5000 },
    { nature: "retenue", source_code: "advance", amount: 2000 },
    { nature: "retenue", source_code: "exception", amount: 1000 },
  ],
  ...over,
});

const sites = [
  { id: "A", code: "ORN", name_fr: "Oran" },
  { id: "B", code: "ALG", name_fr: "Alger" },
];

describe("slipCost", () => {
  it("splits brut, employer charges and deductions", () => {
    expect(slipCost(slip({}))).toEqual({ brut: 50000, charges: 19375, cost: 69375, advances: 2000, otherDeductions: 1000 });
  });
});

describe("allocatePayrollCosts", () => {
  it("imputes per site then pro rata of contract days", () => {
    const res = allocatePayrollCosts({
      year: 2026,
      month: 9,
      slips: [slip({}), slip({ id: "s2", employee_id: "e2" }), slip({ id: "s3", employee_id: "e3", site_id: "B" })],
      sites,
      contracts: [
        { id: "c1", site_id: "A", reference: "C-1", client_name: "X", start_date: "2026-01-01", end_date: null },
        { id: "c2", site_id: "A", reference: "C-2", client_name: "Y", start_date: "2026-09-21", end_date: "2026-12-31" },
        { id: "c3", site_id: "A", reference: "C-3", client_name: "Z", start_date: "2025-01-01", end_date: "2026-08-31" },
      ],
    });
    expect(res.sites.map((s) => [s.site_code, s.headcount, s.cost])).toEqual([
      ["ORN", 2, 138750],
      ["ALG", 1, 69375],
    ]);
    const c1 = res.contracts.find((c) => c.contract_id === "c1");
    const c2 = res.contracts.find((c) => c.contract_id === "c2");
    expect(c1?.share).toBe(0.75);
    expect((c1?.cost ?? 0) + (c2?.cost ?? 0)).toBe(138750);
    expect(res.contracts.find((c) => c.contract_id === "c3")).toBeUndefined();
    expect(res.contracts.find((c) => c.contract_id === null)?.site_name).toBe("Alger");
    expect(res.total).toBe(208125);
  });
});

describe("buildPayrollJournal", () => {
  it("is balanced with expenses per site and aggregated liabilities", () => {
    const j = buildPayrollJournal({
      slips: [slip({}), slip({ id: "s3", employee_id: "e3", site_id: "B" })],
      sites,
      accounts: DEFAULT_ACCOUNTS,
    });
    expect(j.balanced).toBe(true);
    expect(j.debit).toBe(138750);
    const byAcc = (acc: string, analytic = "") => j.lines.find((l) => l.account === acc && l.analytic === analytic);
    expect(byAcc("631", "ORN")?.debit).toBe(50000);
    expect(byAcc("635", "ALG")?.debit).toBe(19375);
    expect(byAcc("431")?.credit).toBe(35000);
    expect(byAcc("4318")?.credit).toBe(13500);
    expect(byAcc("442")?.credit).toBe(6000);
    expect(byAcc("425")?.credit).toBe(4000);
    expect(byAcc("427")?.credit).toBe(2000);
    expect(byAcc("421")?.credit).toBe(78250);
  });

  it("uses configured accounts and exports CSV", () => {
    const accounts = resolveAccounts({ salaires: { account: "6311", label: "" }, net: { account: "abc" } });
    expect(accounts.salaires).toEqual({ account: "6311", label: DEFAULT_ACCOUNTS.salaires.label });
    expect(accounts.net.account).toBe("421");
    const j = buildPayrollJournal({ slips: [slip({})], sites, accounts });
    const csv = journalCsv({ journalCode: "PAIE", date: "30/09/2026", piece: "PAIE-202609", label: "Paie 09/2026", lines: j.lines });
    const rows = csv.trim().split("\r\n");
    expect(rows[0]).toBe("Journal;Date;Piece;Compte;Libelle;Analytique;Debit;Credit");
    expect(rows[1]).toBe("PAIE;30/09/2026;PAIE-202609;6311;Paie 09/2026 - Rémunérations du personnel;ORN;50000.00;");
  });
});
