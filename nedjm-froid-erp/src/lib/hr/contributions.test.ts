import { describe, expect, it } from "vitest";
import {
  applyContributions,
  contributionDefFromRow,
  contributionRatesFor,
  parseAppliedContributions,
  type ContributionDef,
} from "./contributions";
import { complianceGroupOf, contributionKey, isComplianceKey } from "./compliance-keys";
import { buildPayrollLines, summarizeLines } from "./payroll-calc";
import { summarizeMonthlyDeclarations, type DeclarationSlip } from "./payroll-declarations";
import { buildPayrollJournal, DEFAULT_ACCOUNTS, slipCost } from "./cost-allocation";

const def = (over: Partial<ContributionDef>): ContributionDef => ({
  key: "CNAS_RETRAITE_ANTICIPEE",
  code: "992",
  label_fr: "Retraite anticipée",
  label_ar: "",
  part: "EMPLOYEE",
  base: "COTISABLE",
  reduces_irg: false,
  scope: "ALL",
  sort_order: 0,
  ...over,
});

describe("compliance keys", () => {
  it("accepts prefixed keys and the fixed list only", () => {
    expect(isComplianceKey("CNAS_RETRAITE_ANTICIPEE")).toBe(true);
    expect(isComplianceKey("CACOBATPH_CHOMAGE")).toBe(true);
    expect(isComplianceKey("SNMG")).toBe(true);
    expect(isComplianceKey("VF_RATE_BTPH")).toBe(false);
    expect(isComplianceKey("cnas_lower")).toBe(false);
    expect(complianceGroupOf("IRG_TAXE_FORMATION")).toBe("irg");
  });

  it("builds a unique key from the label", () => {
    expect(contributionKey("cnas", "Retraite anticipée", [])).toBe("CNAS_RETRAITE_ANTICIPEE");
    expect(contributionKey("cnas", "Retraite anticipée", ["CNAS_RETRAITE_ANTICIPEE"])).toBe(
      "CNAS_RETRAITE_ANTICIPEE_2",
    );
    expect(contributionKey("irg", "  ", [])).toBe("IRG_TAUX");
  });
});

describe("contributions", () => {
  it("reads a definition row and ignores plain parameters", () => {
    expect(contributionDefFromRow({ key: "SNMG", contrib_part: null })).toBeNull();
    const d = contributionDefFromRow({
      key: "CACOBATPH_CHOMAGE",
      label_fr: "Chômage intempéries",
      contrib_part: "EMPLOYER",
      contrib_base: "TAXABLE",
      contrib_reduces_irg: true,
      contrib_scope: "CACOBATPH_INTEMPERIES",
      contrib_code: "",
    });
    expect(d).toMatchObject({ code: "CACOBATPH_CHOMAGE", base: "TAXABLE", reduces_irg: false, scope: "CACOBATPH_INTEMPERIES" });
  });

  it("keeps contributions in scope with a positive rate", () => {
    const defs = [
      def({}),
      def({ key: "CACOBATPH_CHOMAGE", scope: "CACOBATPH_INTEMPERIES" }),
      def({ key: "IRG_ZERO" }),
    ];
    const vars = { CNAS_RETRAITE_ANTICIPEE: 0.005, CACOBATPH_CHOMAGE: 0.01, IRG_ZERO: 0 };
    expect(contributionRatesFor({ defs, vars, cacobatph: { conges: true, intemperies: false } }).map((r) => r.key)).toEqual([
      "CNAS_RETRAITE_ANTICIPEE",
    ]);
    expect(contributionRatesFor({ defs, vars, cacobatph: { conges: false, intemperies: true } })).toHaveLength(2);
  });

  it("computes amounts on the chosen base and round-trips the frozen list", () => {
    const applied = applyContributions(
      [
        { ...def({}), rate: 0.005 },
        { ...def({ key: "IRG_TAXE", part: "EMPLOYER", base: "TAXABLE" }), rate: 0.01 },
      ],
      { cotisable: 40000, taxable: 49000 },
    );
    expect(applied.map((a) => [a.key, a.group, a.base_amount, a.amount])).toEqual([
      ["CNAS_RETRAITE_ANTICIPEE", "cnas", 40000, 200],
      ["IRG_TAXE", "irg", 49000, 490],
    ]);
    expect(parseAppliedContributions(JSON.parse(JSON.stringify(applied)))).toEqual(applied);
    expect(parseAppliedContributions([{ part: "X" }, null, "a"])).toEqual([]);
  });
});

describe("summarizeLines with user-defined contributions", () => {
  const lines = buildPayrollLines({
    employeeId: "e1",
    siteId: "s1",
    contractId: "c1",
    baseMonthly: 40000,
    daysPaid: 30,
    daysWorked: 26,
    monthFraction: 1,
    year: 2026,
    month: 9,
    rubriques: [],
    assignments: [],
    exceptions: [],
  });
  const legal = {
    cnasEmployee: 0.09,
    cnasEmployer: 0.25,
    cnasFos: 0.005,
    cacobatph: 0,
    intemperiesEmployee: 0,
    intemperiesEmployer: 0,
    appliesCacobatph: false,
    appliesIntemperies: false,
    irgAmount: 0,
  };

  it("deducts the employee share from net, and from the IRG base when deductible", () => {
    const sum = summarizeLines(lines, {
      ...legal,
      extraContributions: [
        { ...def({ reduces_irg: true }), rate: 0.005 },
        { ...def({ key: "CNAS_PATRONAL", part: "EMPLOYER" }), rate: 0.01 },
      ],
    });
    expect(sum.extra_employee).toBe(200);
    expect(sum.extra_employer).toBe(400);
    expect(sum.irg_base).toBe(40000 - 3600 - 200);
    expect(sum.net_payable).toBe(40000 - 3600 - 200);
    expect(sum.employer_ss).toBe(10200);
  });

  it("leaves the IRG base untouched for a non deductible contribution", () => {
    const sum = summarizeLines(lines, { ...legal, extraContributions: [{ ...def({}), rate: 0.005 }] });
    expect(sum.irg_base).toBe(36400);
    expect(sum.net_payable).toBe(36200);
  });

  it("is unchanged without contributions", () => {
    const sum = summarizeLines(lines, legal);
    expect(sum.extra_contributions).toEqual([]);
    expect(sum.net_payable).toBe(36400);
  });
});

describe("declarations and accounting", () => {
  const extras = applyContributions(
    [
      { ...def({}), rate: 0.005 },
      { ...def({ key: "CACOBATPH_CHOMAGE", code: "CH", label_fr: "Chômage", part: "EMPLOYER" }), rate: 0.01 },
    ],
    { cotisable: 40000, taxable: 40000 },
  );
  const slip: DeclarationSlip = {
    employee_id: "e1",
    period_year: 2026,
    period_month: 9,
    site_name: null,
    matricule: "001",
    employee_name: "A B",
    nss: "1",
    birth_date: null,
    hired_at: null,
    days_worked: 26,
    days_paid: 30,
    gross_amount: 40000,
    employee_ss: 3600,
    employer_ss: 10000,
    cacobatph: 0,
    intemperies_employee: 0,
    intemperies_employer: 0,
    extra_employee: 200,
    extra_employer: 400,
    extra_contributions: extras,
    irg_base: 36400,
    irg_amount: 0,
    net_payable: 36200,
    status_code: "DRAFT",
    payment_mode_code: "CASH",
    account_no: null,
    lines: [{ nature: "base", amount: 40000 }],
  };

  it("lists each contribution and includes it in the employer cost", () => {
    const d = summarizeMonthlyDeclarations([slip, { ...slip, employee_id: "e2", matricule: "002" }]);
    expect(d.extras.rows.map((r) => [r.key, r.employees, r.assiette, r.amount])).toEqual([
      ["CACOBATPH_CHOMAGE", 2, 80000, 800],
      ["CNAS_RETRAITE_ANTICIPEE", 2, 80000, 400],
    ]);
    expect(d.extras.total).toBe(1200);
    expect(d.journal.employer_cost).toBe(2 * (36200 + 3600 + 200 + 10000 + 400));
  });

  it("keeps the payroll journal balanced and credits the tab's account", () => {
    const cost = {
      id: "s1",
      employee_id: "e1",
      site_id: null,
      employee_ss: 3600,
      employer_ss: 10000,
      cacobatph: 0,
      intemperies_employee: 0,
      intemperies_employer: 0,
      irg_amount: 0,
      net_payable: 36200,
      lines: [{ nature: "base", source_code: "base", amount: 40000 }],
      extra_contributions: extras,
    };
    expect(slipCost(cost).charges).toBe(10400);
    const j = buildPayrollJournal({ slips: [cost], sites: [], accounts: DEFAULT_ACCOUNTS });
    expect(j.balanced).toBe(true);
    expect(j.lines.find((l) => l.account === "431")?.credit).toBe(13800);
    expect(j.lines.find((l) => l.account === "4318")?.credit).toBe(400);
  });
});
