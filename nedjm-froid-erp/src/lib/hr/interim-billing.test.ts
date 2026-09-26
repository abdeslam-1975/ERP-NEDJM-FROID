import { describe, expect, it } from "vitest";
import { buildInterimStatement, buildInterimStatementHtml, type InterimContract } from "./interim-billing";

const legends = [
  { code: "P", label_fr: "Présent", coefficient: 1, counts_as_presence: true },
  { code: "P/2", label_fr: "Demi-journée", coefficient: 0.5, counts_as_presence: true },
  { code: "AN", label_fr: "Absence non justifiée", coefficient: 0, counts_as_presence: false },
  { code: "W", label_fr: "Week-end", coefficient: 1, counts_as_presence: false },
];

const contract = (over: Partial<InterimContract> = {}): InterimContract => ({
  contract_id: "c1",
  employee_id: "e1",
  matricule: "I002",
  employee_name: "BENALI Omar",
  site_id: "s1",
  site_name: "Chantier A",
  start_date: "2026-09-01",
  end_date: null,
  daily_rate: 3000,
  poste: "Manoeuvre",
  ...over,
});

const cell = (employee_id: string, work_date: string, legend_code: string, site_id = "s1") => ({
  employee_id,
  site_id,
  work_date,
  legend_code,
});

describe("buildInterimStatement", () => {
  it("bills presence quantity × rate, then markup and VAT", () => {
    const s = buildInterimStatement({
      contracts: [contract()],
      cells: [
        cell("e1", "2026-09-01", "P"),
        cell("e1", "2026-09-02", "P/2"),
        cell("e1", "2026-09-03", "AN"),
        cell("e1", "2026-09-04", "W"),
      ],
      legends,
      terms: { default_daily_rate: 2500, markup_pct: 10, vat_pct: 19 },
    });
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0]).toMatchObject({ days_worked: 2, days_billed: 1.5, daily_rate: 3000, amount: 4500 });
    expect(s.subtotal).toBe(4500);
    expect(s.markup).toBe(450);
    expect(s.amount_ht).toBe(4950);
    expect(s.amount_vat).toBe(940.5);
    expect(s.amount_ttc).toBe(5890.5);
    expect(s.missingRate).toEqual([]);
  });

  it("falls back to the agency rate and flags workers without any rate", () => {
    const s = buildInterimStatement({
      contracts: [contract({ daily_rate: null }), contract({ contract_id: "c2", employee_id: "e2", matricule: "I001", daily_rate: null })],
      cells: [cell("e1", "2026-09-01", "P"), cell("e2", "2026-09-01", "P")],
      legends,
      terms: { default_daily_rate: 0, markup_pct: 0, vat_pct: 19 },
    });
    expect(s.missingRate).toHaveLength(2);
    const withDefault = buildInterimStatement({
      contracts: [contract({ daily_rate: null })],
      cells: [cell("e1", "2026-09-01", "P")],
      legends,
      terms: { default_daily_rate: 2500, markup_pct: 0, vat_pct: 0 },
    });
    expect(withDefault.lines[0].daily_rate).toBe(2500);
    expect(withDefault.amount_ttc).toBe(2500);
  });

  it("only counts days on the contract site and inside the contract dates, sorted by matricule", () => {
    const s = buildInterimStatement({
      contracts: [
        contract({ start_date: "2026-09-02", end_date: "2026-09-03" }),
        contract({ contract_id: "c2", employee_id: "e2", matricule: "I001", employee_name: "AMRANI Ali" }),
      ],
      cells: [
        cell("e1", "2026-09-01", "P"),
        cell("e1", "2026-09-02", "P"),
        cell("e1", "2026-09-03", "P", "s2"),
        cell("e1", "2026-09-04", "P"),
        cell("e2", "2026-09-01", "P"),
      ],
      legends,
      terms: { default_daily_rate: 0, markup_pct: 0, vat_pct: 0 },
    });
    expect(s.lines.map((l) => [l.matricule, l.days_billed])).toEqual([
      ["I001", 1],
      ["I002", 1],
    ]);
    expect(s.days_total).toBe(2);
  });

  it("skips workers with no billable presence", () => {
    const s = buildInterimStatement({
      contracts: [contract()],
      cells: [cell("e1", "2026-09-01", "AN")],
      legends,
      terms: { default_daily_rate: 0, markup_pct: 0, vat_pct: 19 },
    });
    expect(s.lines).toEqual([]);
    expect(s.amount_ttc).toBe(0);
  });
});

describe("buildInterimStatementHtml", () => {
  it("escapes names and prints totals", () => {
    const s = buildInterimStatement({
      contracts: [contract({ employee_name: "<b>X</b>" })],
      cells: [cell("e1", "2026-09-01", "P")],
      legends,
      terms: { default_daily_rate: 0, markup_pct: 0, vat_pct: 19 },
    });
    const html = buildInterimStatementHtml({
      statementNo: "000001/26",
      period: "09/2026",
      employerName: "NEDJM FROID",
      agency: { name: "Agence & Co" },
      terms: { default_daily_rate: 0, markup_pct: 0, vat_pct: 19 },
      statement: s,
    });
    expect(html).toContain("&lt;b&gt;X&lt;/b&gt;");
    expect(html).toContain("Agence &amp; Co");
    expect(html).toContain("000001/26");
    expect(html).toContain("3 570,00");
  });
});
