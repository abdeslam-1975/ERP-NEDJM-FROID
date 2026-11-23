import type { SalesRegisterRow } from "@/lib/ventes/db-types";

export type VentesPayStatus = "PAYE" | "PARTIEL" | "IMPAYE";

export type VentesKindFilter = "TOUS" | "P" | "F" | "FP" | "RG" | "SIT";

export function payStatusOf(row: Pick<SalesRegisterRow, "paid_ttc" | "due_ttc" | "net_payable">): VentesPayStatus {
  const paid = Number(row.paid_ttc) || 0;
  const due = Number(row.due_ttc) || 0;
  if (paid <= 0.005) return "IMPAYE";
  if (due <= 0.005) return "PAYE";
  return "PARTIEL";
}

export function payLabel(status: VentesPayStatus): string {
  if (status === "PAYE") return "Payé";
  if (status === "PARTIEL") return "Partiel";
  return "Impayé";
}

export function filterRegisterRows(
  rows: SalesRegisterRow[],
  opts: {
    kind: VentesKindFilter;
    pay: "TOUS" | VentesPayStatus;
    dateFrom: string;
    dateTo: string;
    search: string;
  },
): SalesRegisterRow[] {
  const q = opts.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (opts.kind !== "TOUS" && row.doc_kind !== opts.kind) return false;
    const pay = payStatusOf(row);
    if (opts.pay !== "TOUS" && pay !== opts.pay) return false;
    if (opts.dateFrom && row.issue_date < opts.dateFrom) return false;
    if (opts.dateTo && row.issue_date > opts.dateTo) return false;
    if (!q) return true;
    const hay = [
      row.invoice_number,
      row.client_name,
      row.contract_ref,
      row.doc_kind,
      row.expected_bank_label,
      row.source,
      row.status,
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function sumKpis(rows: SalesRegisterRow[]) {
  return rows.reduce(
    (acc, row) => {
      acc.ht += Number(row.total_ht) || 0;
      acc.tva += Number(row.total_tva) || 0;
      acc.rg += Number(row.retention_amount) || 0;
      acc.net += Number(row.net_payable) || 0;
      acc.due += Number(row.due_ttc) || 0;
      return acc;
    },
    { ht: 0, tva: 0, rg: 0, net: 0, due: 0 },
  );
}

export function kindCounts(rows: SalesRegisterRow[]): Record<VentesKindFilter, number> {
  const counts: Record<VentesKindFilter, number> = {
    TOUS: rows.length,
    P: 0,
    F: 0,
    FP: 0,
    RG: 0,
    SIT: 0,
  };
  for (const row of rows) {
    const k = row.doc_kind as Exclude<VentesKindFilter, "TOUS">;
    if (k in counts) counts[k] += 1;
  }
  return counts;
}
