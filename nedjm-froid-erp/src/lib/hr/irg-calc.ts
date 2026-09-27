import { roundMoney } from "@/lib/hr/payroll-calc";

export type IrgBracket = {
  min_annual: number;
  max_annual: number | null;
  rate: number;
};

export type IrgRule = {
  kind: string;
  params: Record<string, unknown>;
  formula: string | null;
};

function numParam(params: Record<string, unknown>, key: string, fallback = 0) {
  const v = params[key];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function evalNumericFormula(expr: string, vars: Record<string, number>) {
  let s = expr;
  for (const [key, value] of Object.entries(vars)) {
    s = s.replaceAll(`[${key}]`, `(${value})`);
  }
  if (!/^[0-9+\-*/().\s]+$/.test(s)) {
    throw new Error("Formule IRG refusée.");
  }
  const value = Function(`"use strict"; return (${s});`)();
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return value;
}

export function progressiveAnnualTax(annual: number, brackets: IrgBracket[]) {
  if (annual <= 0 || brackets.length === 0) return 0;
  const ordered = [...brackets].sort((a, b) => a.min_annual - b.min_annual);
  let tax = 0;
  let prevMax = 0;
  for (const b of ordered) {
    const upper = b.max_annual == null ? annual : b.max_annual;
    const sliceEnd = Math.min(annual, upper);
    const sliceStart = Math.max(prevMax, b.min_annual > 0 ? b.min_annual - 1 : 0);
    tax += Math.max(0, sliceEnd - sliceStart) * b.rate;
    prevMax = upper;
    if (prevMax >= annual) break;
  }
  return tax;
}

export type IrgExplanation = {
  exempt: boolean;
  rawMonthly: number;
  abatement: number;
  afterAbatement: number;
  lissageApplied: boolean;
  final: number;
};

export function explainMonthlyIrg(input: {
  irgBaseMonthly: number;
  brackets: IrgBracket[];
  rules: IrgRule[];
}): IrgExplanation {
  const base = Math.max(0, input.irgBaseMonthly);
  const exemption = input.rules.find((r) => r.kind === "EXEMPTION_THRESHOLD");
  if (exemption && base <= numParam(exemption.params, "monthly_max", 0)) {
    return {
      exempt: true,
      rawMonthly: 0,
      abatement: 0,
      afterAbatement: 0,
      lissageApplied: false,
      final: 0,
    };
  }
  const annual = base * 12;
  const rawMonthly = progressiveAnnualTax(annual, input.brackets) / 12;
  let abatement = 0;
  const abatementRule = input.rules.find((r) => r.kind === "ABATEMENT_ON_TAX");
  if (abatementRule && rawMonthly > 0) {
    const rate = numParam(abatementRule.params, "rate", 0);
    const minM = numParam(abatementRule.params, "min_monthly", 0);
    const maxM = numParam(abatementRule.params, "max_monthly", minM);
    abatement = Math.min(maxM, Math.max(minM, rawMonthly * rate));
  }
  let after = Math.max(0, rawMonthly - abatement);
  let lissageApplied = false;
  const lissage = input.rules.find((r) => r.kind === "LISSAGE");
  if (lissage) {
    const minB = numParam(lissage.params, "monthly_min", 0);
    const maxB = numParam(lissage.params, "monthly_max", 0);
    if (base >= minB && base <= maxB && lissage.formula) {
      try {
        after = evalNumericFormula(lissage.formula, { IRG_AFTER_ABATEMENT: after });
        lissageApplied = true;
      } catch {
        // keep post-abatement amount when formula is unusable
      }
    }
  }
  return {
    exempt: false,
    rawMonthly: roundMoney(rawMonthly),
    abatement: roundMoney(abatement),
    afterAbatement: roundMoney(Math.max(0, rawMonthly - abatement)),
    lissageApplied,
    final: roundMoney(Math.max(0, after)),
  };
}

export function computeMonthlyIrg(input: {
  irgBaseMonthly: number;
  brackets: IrgBracket[];
  rules: IrgRule[];
}) {
  return explainMonthlyIrg(input).final;
}
