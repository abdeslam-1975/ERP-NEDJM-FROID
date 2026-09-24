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

export function computeMonthlyIrg(input: {
  irgBaseMonthly: number;
  brackets: IrgBracket[];
  rules: IrgRule[];
}) {
  const base = Math.max(0, input.irgBaseMonthly);
  const exemption = input.rules.find((r) => r.kind === "EXEMPTION_THRESHOLD");
  if (exemption && base <= numParam(exemption.params, "monthly_max", 0)) {
    return 0;
  }
  const annual = base * 12;
  const annualTax = progressiveAnnualTax(annual, input.brackets);
  let monthly = annualTax / 12;

  const abatement = input.rules.find((r) => r.kind === "ABATEMENT_ON_TAX");
  if (abatement && monthly > 0) {
    const rate = numParam(abatement.params, "rate", 0);
    const minM = numParam(abatement.params, "min_monthly", 0);
    const maxM = numParam(abatement.params, "max_monthly", minM);
    const raw = monthly * rate;
    const deducted = Math.min(maxM, Math.max(minM, raw));
    monthly = Math.max(0, monthly - deducted);
  }

  const lissage = input.rules.find((r) => r.kind === "LISSAGE");
  if (lissage) {
    const minB = numParam(lissage.params, "monthly_min", 0);
    const maxB = numParam(lissage.params, "monthly_max", 0);
    if (base >= minB && base <= maxB && lissage.formula) {
      try {
        monthly = evalNumericFormula(lissage.formula, {
          IRG_AFTER_ABATEMENT: monthly,
        });
      } catch {
        // keep post-abatement amount when formula is unusable
      }
    }
  }

  return roundMoney(Math.max(0, monthly));
}
