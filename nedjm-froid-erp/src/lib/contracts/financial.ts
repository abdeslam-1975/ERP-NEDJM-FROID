/** Pure financial helpers for contract engine — no I/O. */

export function contractDurationDays(
  startDate: string,
  endDate: string,
): number {
  const s = new Date(`${startDate}T00:00:00Z`);
  const e = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;
  return Math.floor((e.getTime() - s.getTime()) / 86_400_000) + 1;
}

export function sumItemsHt(
  items: { total_price_ht: number; quantity?: number; unit_price_ht?: number }[],
): number {
  return round2(
    items.reduce((acc, i) => {
      const line =
        i.total_price_ht ??
        round2((i.quantity ?? 0) * (i.unit_price_ht ?? 0));
      return acc + Number(line);
    }, 0),
  );
}

export function lineTotal(quantity: number, unitPrice: number): number {
  return round2(quantity * unitPrice);
}

export function cautionFromRate(totalHt: number, rate: number): number {
  return round2(totalHt * rate);
}

export function cautionRateFromAmount(
  totalHt: number,
  amount: number,
): number {
  if (totalHt <= 0) return 0;
  return Math.min(1, Math.max(0, amount / totalHt));
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function resolveTotalHt(opts: {
  mode: "AUTO" | "MANUAL";
  manualTotal: number;
  laborHt: number;
  spareHt: number;
}): number {
  if (opts.mode === "MANUAL") return round2(opts.manualTotal);
  return round2(opts.laborHt + opts.spareHt);
}

export function resolveCaution(opts: {
  sync: "FROM_RATE" | "FROM_AMOUNT" | "MANUAL";
  totalHt: number;
  rate: number;
  amount: number;
}): { rate: number; amount: number } {
  if (opts.sync === "FROM_RATE") {
    return {
      rate: opts.rate,
      amount: cautionFromRate(opts.totalHt, opts.rate),
    };
  }
  if (opts.sync === "FROM_AMOUNT") {
    return {
      amount: opts.amount,
      rate: cautionRateFromAmount(opts.totalHt, opts.amount),
    };
  }
  return { rate: opts.rate, amount: opts.amount };
}
