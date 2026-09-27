/**
 * Barème en vigueur (septembre 2026).
 * CNAS : décret exécutif 15-236 modifiant le décret 94-187 — 9 % salarié, 25 % employeur, 0,5 % FOS.
 * CACOBATPH : congés payés 12,21 % employeur ; intempéries 0,75 % partagés 0,375 % / 0,375 %.
 * IRG : article 104 du CIDTA, barème de la LF 2022 (seuils, abattement, lissage).
 * Ces valeurs sont le défaut protégé. Un écart exige une décision explicite, journalisée.
 */

export const STATUTORY_RATES: Record<string, { fraction: number; label: string }> = {
  CNAS_EMPLOYEE: { fraction: 0.09, label: "CNAS part salariale" },
  CNAS_EMPLOYER_BASE: { fraction: 0.25, label: "CNAS part patronale hors FOS" },
  CNAS_FOS: { fraction: 0.005, label: "Fonds des œuvres sociales" },
  CACOBATPH_CONGES: { fraction: 0.1221, label: "CACOBATPH congés payés" },
  CACOBATPH_INTEMPERIES: { fraction: 0.0075, label: "CACOBATPH intempéries total" },
  CACOBATPH_INTEMPERIES_EMP: { fraction: 0.00375, label: "CACOBATPH intempéries employeur" },
  CACOBATPH_INTEMPERIES_SAL: { fraction: 0.00375, label: "CACOBATPH intempéries salarié" },
};

export const STATUTORY_CNAS = { employee_pct: 9, employer_pct: 25, fos_pct: 0.5 };

export const STATUTORY_IRG_BRACKETS: { min_annual: number; max_annual: number | null; rate: number }[] = [
  { min_annual: 0, max_annual: 240000, rate: 0 },
  { min_annual: 240001, max_annual: 480000, rate: 0.23 },
  { min_annual: 480001, max_annual: 960000, rate: 0.27 },
  { min_annual: 960001, max_annual: 1920000, rate: 0.3 },
  { min_annual: 1920001, max_annual: 3840000, rate: 0.33 },
  { min_annual: 3840001, max_annual: null, rate: 0.35 },
];

export type StatutoryIrgRule = {
  params: Record<string, number | string[]>;
  formula: string | null;
};

export function statutoryIrgRule(category: string, kind: string): StatutoryIrgRule | null {
  if (kind === "EXEMPTION_THRESHOLD") return { params: { monthly_max: 30000 }, formula: null };
  if (kind === "ABATEMENT_ON_TAX") {
    return { params: { rate: 0.4, min_monthly: 1000, max_monthly: 1500 }, formula: null };
  }
  if (kind === "BASE_PREPROCESS") return { params: { deduct_tokens: ["CNAS_EMPLOYEE"] }, formula: null };
  if (kind === "NON_MONTHLY_WITHHOLDING") return { params: { rate: 0.1 }, formula: null };
  if (kind === "LISSAGE" && category === "DISABLED_OR_RETIREE") {
    return {
      params: { monthly_min: 30001, monthly_max: 42500 },
      formula: "[IRG_AFTER_ABATEMENT] * (93/61) - (81213/41)",
    };
  }
  if (kind === "LISSAGE") {
    return {
      params: { monthly_min: 30001, monthly_max: 35000 },
      formula: "[IRG_AFTER_ABATEMENT] * (137/51) - (27925/8)",
    };
  }
  return null;
}

const OVERRIDE_MARK = "LEGAL_OVERRIDE\n";

export function ratesEqual(a: number, b: number) {
  return Math.abs(a - b) < 0.0000005;
}

export function statutoryPercent(key: string): number | null {
  const row = STATUTORY_RATES[key];
  if (!row) return null;
  return Math.round(row.fraction * 1_000_000) / 10_000;
}

function pctText(fraction: number) {
  const pct = Math.round(fraction * 1_000_000) / 10_000;
  return `${String(pct).replace(".", ",")} %`;
}

export function statutoryFractionDeviation(key: string, fraction: number): string | null {
  const row = STATUTORY_RATES[key];
  if (!row || ratesEqual(fraction, row.fraction)) return null;
  return `${row.label} : la réglementation prévoit ${pctText(row.fraction)}. Valeur proposée : ${pctText(fraction)}.`;
}

const GENERAL_CNAS_CODES = new Set(["STANDARD", "REGIME_GENERALE", "REGIME_GENERAL", "GENERAL", "RG"]);

/** Reduced CNAS regimes keep their own published rates. Only the general regime, and the 25.5/26 double-count, are blocked. */
export function regimeRateDeviations(
  code: string,
  rates: { employee_pct: number | null; employer_pct: number | null; fos_pct: number | null },
): string[] {
  if (GENERAL_CNAS_CODES.has(code)) return cnasRegimeDeviations(rates);
  const employer = rates.employer_pct;
  if (employer != null && (ratesEqual(employer, 25.5) || ratesEqual(employer, 26))) {
    return [
      "CNAS employeur : 25,5 % ou 26 % additionne le FOS à la part patronale. La réglementation prévoit 25 % hors FOS, et le FOS 0,5 % à part.",
    ];
  }
  return [];
}

export function cnasRegimeDeviations(rates: {
  employee_pct: number | null;
  employer_pct: number | null;
  fos_pct: number | null;
}): string[] {
  const lines: string[] = [];
  const check = (label: string, proposed: number | null, legal: number) => {
    if (proposed == null || ratesEqual(proposed, legal)) return;
    lines.push(
      `${label} : la réglementation prévoit ${String(legal).replace(".", ",")} %. Valeur proposée : ${String(proposed).replace(".", ",")} %.`,
    );
  };
  check("CNAS salarié", rates.employee_pct, STATUTORY_CNAS.employee_pct);
  check("CNAS employeur hors FOS", rates.employer_pct, STATUTORY_CNAS.employer_pct);
  check("FOS", rates.fos_pct, STATUTORY_CNAS.fos_pct);
  return lines;
}

export function irgBracketDeviations(
  proposed: { min_annual: number; max_annual: number | null; rate: number }[],
): string[] {
  const rows = [...proposed].sort((a, b) => a.min_annual - b.min_annual);
  const legal = STATUTORY_IRG_BRACKETS;
  const same =
    rows.length === legal.length &&
    rows.every((p, i) => {
      const l = legal[i];
      return p.min_annual === l.min_annual && p.max_annual === l.max_annual && ratesEqual(p.rate, l.rate);
    });
  if (same) return [];
  return [
    "Barème IRG : les tranches proposées diffèrent de l'article 104 du CIDTA (loi de finances 2022), toujours en vigueur.",
  ];
}

function normFormula(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, "");
}

export function irgRuleDeviations(
  category: string,
  kind: string,
  params: Record<string, unknown>,
  formula: string | null,
): string[] {
  const legal = statutoryIrgRule(category, kind);
  if (!legal) return [];
  const lines: string[] = [];
  if (normFormula(formula) !== normFormula(legal.formula)) {
    lines.push(`${kind} : la formule diffère de la réglementation.`);
  }
  for (const [key, expected] of Object.entries(legal.params)) {
    const actual = params[key];
    if (Array.isArray(expected)) {
      const got = Array.isArray(actual) ? actual.map(String) : [];
      if (got.join(",") !== expected.map(String).join(",")) {
        lines.push(`${kind} : ${key} s'écarte de la réglementation.`);
      }
    } else if (!ratesEqual(Number(actual), expected)) {
      lines.push(`${kind} : ${key} légal ${expected}, proposé ${String(actual)}.`);
    }
  }
  return lines;
}

export function legalOverrideError(lines: string[]) {
  return `${OVERRIDE_MARK}${lines.join("\n")}`;
}

export function isLegalOverrideError(error: string) {
  return error.startsWith(OVERRIDE_MARK);
}

export function legalOverrideLines(error: string) {
  return error.slice(OVERRIDE_MARK.length).split("\n").filter(Boolean);
}

export function takeAuthorize(input: unknown): { body: unknown; authorize: boolean } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { body: input, authorize: false };
  }
  const rec = { ...(input as Record<string, unknown>) };
  const authorize = rec.authorize_override === true;
  delete rec.authorize_override;
  return { body: rec, authorize };
}
