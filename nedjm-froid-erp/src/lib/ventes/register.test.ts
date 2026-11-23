import { describe, expect, it } from "vitest";
import type { SalesRegisterRow } from "./db-types";
import { filterRegisterRows, kindCounts, payStatusOf, sumKpis } from "./register";

function row(partial: Partial<SalesRegisterRow>): SalesRegisterRow {
  return {
    source: "SAL",
    id: "1",
    invoice_number: "1",
    issue_date: "2025-01-15",
    doc_kind: "P",
    status: "EMISE",
    client_id: null,
    client_name: "Client A",
    contract_id: null,
    contract_ref: "C-1",
    period_label: null,
    expected_bank_label: "BEA",
    total_ht: 1000,
    total_tva: 0,
    retention_amount: 100,
    stamp_amount: 0,
    net_payable: 900,
    paid_ttc: 0,
    due_ttc: 900,
    last_payment_date: null,
    exo_attestation_no: null,
    fiscal_year: 2025,
    created_at: "2025-01-15T00:00:00Z",
    ...partial,
  };
}

describe("ventes register helpers", () => {
  it("derives payment status", () => {
    expect(payStatusOf(row({ paid_ttc: 0, due_ttc: 900 }))).toBe("IMPAYE");
    expect(payStatusOf(row({ paid_ttc: 400, due_ttc: 500 }))).toBe("PARTIEL");
    expect(payStatusOf(row({ paid_ttc: 900, due_ttc: 0 }))).toBe("PAYE");
  });

  it("filters and aggregates", () => {
    const rows = [
      row({ id: "a", doc_kind: "P", paid_ttc: 0, due_ttc: 900 }),
      row({ id: "b", doc_kind: "F", invoice_number: "2", paid_ttc: 500, due_ttc: 0, net_payable: 500, total_ht: 500, retention_amount: 0 }),
    ];
    expect(filterRegisterRows(rows, { kind: "F", pay: "TOUS", dateFrom: "", dateTo: "", search: "" })).toHaveLength(1);
    expect(kindCounts(rows).P).toBe(1);
    expect(sumKpis(rows).ht).toBe(1500);
  });
});
