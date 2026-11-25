/** Totals for Ventes Bon de commande — aligned with Excel Formulaire2. */

export type OrderLineInput = {
  qty: number;
  unit_price_ht: number;
  pose_price_ht?: number;
  line_tax_rate?: number;
};

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeOrderLineHt(line: OrderLineInput, hasPose: boolean): number {
  const unit = Number(line.unit_price_ht) || 0;
  const pose = hasPose ? Number(line.pose_price_ht) || 0 : 0;
  const qty = Number(line.qty) || 0;
  return round2(qty * (unit + pose));
}

/**
 * Excel Formulaire2:
 * Total HT → Remise → HT net → TVA (on HT net) → TTC → R.G → Timbre → Net.
 */
export function computeOrderTotals(input: {
  has_pose: boolean;
  tax_rate: number;
  discount_amount: number;
  retention_rate: number;
  stamp_amount: number;
  lines: OrderLineInput[];
}) {
  const totalHt = round2(
    input.lines.reduce((sum, line) => sum + computeOrderLineHt(line, input.has_pose), 0),
  );
  const discount = round2(Math.min(Math.max(0, input.discount_amount || 0), totalHt));
  const totalHtNet = round2(totalHt - discount);
  const taxRate = Number(input.tax_rate) || 0;
  const totalTva = round2(totalHtNet * taxRate);
  const totalTtc = round2(totalHtNet + totalTva);
  const retentionAmount = round2(totalTtc * (Number(input.retention_rate) || 0));
  const stamp = round2(input.stamp_amount || 0);
  const netPayable = round2(totalTtc - retentionAmount + stamp);
  return {
    total_ht: totalHt,
    discount_amount: discount,
    total_ht_net: totalHtNet,
    total_tva: totalTva,
    total_ttc: totalTtc,
    retention_amount: retentionAmount,
    stamp_amount: stamp,
    net_payable: netPayable,
  };
}
