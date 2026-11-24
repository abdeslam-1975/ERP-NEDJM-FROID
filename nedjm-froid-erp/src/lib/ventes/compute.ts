import type { SalDocKindCode } from "@/lib/ventes/db-types";

export type ComputeLineInput = {
  designation: string;
  qty: number;
  unit_price_ht: number;
  pose_price_ht: number;
  source_amount?: number;
};

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeLineHt(
  kind: SalDocKindCode | string,
  line: ComputeLineInput,
): number {
  if (kind === "SIT") return round2(line.unit_price_ht);
  if (kind === "FP") return round2(line.qty * (line.unit_price_ht + line.pose_price_ht));
  if (kind === "RG") return round2(line.source_amount ?? 0);
  return round2(line.qty * line.unit_price_ht);
}

export function computeInvoiceTotals(input: {
  doc_kind: SalDocKindCode | string;
  tax_rate: number;
  retention_rate: number;
  stamp_amount: number;
  lines: ComputeLineInput[];
}) {
  const totalHt = round2(
    input.lines.reduce((sum, line) => sum + computeLineHt(input.doc_kind, line), 0),
  );
  const totalTva = round2(totalHt * (input.tax_rate || 0));
  const base = round2(totalHt + totalTva);
  const retentionAmount =
    input.doc_kind === "RG" ? 0 : round2(base * (input.retention_rate || 0));
  const stamp = round2(input.stamp_amount || 0);
  const netPayable =
    input.doc_kind === "RG"
      ? round2(totalHt + stamp)
      : round2(base - retentionAmount + stamp);
  const taxMode = (input.tax_rate || 0) > 0 ? "TAXABLE" : "EXEMPT";
  return {
    total_ht: totalHt,
    total_tva: totalTva,
    retention_amount: retentionAmount,
    stamp_amount: stamp,
    net_payable: netPayable,
    tax_mode: taxMode as "TAXABLE" | "EXEMPT",
  };
}
