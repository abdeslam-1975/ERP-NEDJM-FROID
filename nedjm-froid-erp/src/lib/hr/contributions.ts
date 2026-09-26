import { complianceGroupOf, type ComplianceGroup } from "@/lib/hr/compliance-keys";

const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type ContributionPart = "EMPLOYEE" | "EMPLOYER";
export type ContributionBase = "COTISABLE" | "TAXABLE";
export type ContributionScope = "ALL" | "CACOBATPH_CONGES" | "CACOBATPH_INTEMPERIES";

/** User-defined contribution (ref_global_vars row with contrib_part set). */
export type ContributionDef = {
  key: string;
  code: string;
  label_fr: string;
  label_ar: string;
  part: ContributionPart;
  base: ContributionBase;
  reduces_irg: boolean;
  scope: ContributionScope;
  sort_order: number;
};

/** Contribution with the rate of the period (fraction: 0.01 = 1 %). */
export type ContributionRate = ContributionDef & { rate: number };

/** Frozen on the payslip. */
export type AppliedContribution = {
  key: string;
  code: string;
  label_fr: string;
  label_ar: string;
  group: ComplianceGroup;
  part: ContributionPart;
  base: ContributionBase;
  reduces_irg: boolean;
  rate: number;
  base_amount: number;
  amount: number;
};

export function contributionDefFromRow(row: Record<string, unknown>): ContributionDef | null {
  const part = row.contrib_part;
  if (part !== "EMPLOYEE" && part !== "EMPLOYER") return null;
  const key = String(row.key ?? "");
  const scope = row.contrib_scope;
  return {
    key,
    code: String(row.contrib_code ?? "").trim() || key,
    label_fr: String(row.label_fr ?? key),
    label_ar: String(row.label_ar ?? ""),
    part,
    base: row.contrib_base === "TAXABLE" ? "TAXABLE" : "COTISABLE",
    reduces_irg: part === "EMPLOYEE" && row.contrib_reduces_irg === true,
    scope: scope === "CACOBATPH_CONGES" || scope === "CACOBATPH_INTEMPERIES" ? scope : "ALL",
    sort_order: Number(row.sort_order ?? 0) || 0,
  };
}

/** Contributions due for one employee: in scope and with a positive rate in force. */
export function contributionRatesFor(input: {
  defs: readonly ContributionDef[];
  vars: Readonly<Record<string, number>>;
  cacobatph: { conges: boolean; intemperies: boolean };
}): ContributionRate[] {
  return input.defs
    .filter((d) =>
      d.scope === "ALL" ? true : d.scope === "CACOBATPH_CONGES" ? input.cacobatph.conges : input.cacobatph.intemperies,
    )
    .map((d) => ({ ...d, rate: Number(input.vars[d.key] ?? 0) }))
    .filter((d) => Number.isFinite(d.rate) && d.rate > 0)
    .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code, "fr", { numeric: true }));
}

export function applyContributions(
  rates: readonly ContributionRate[],
  bases: { cotisable: number; taxable: number },
): AppliedContribution[] {
  return rates.map((r) => {
    const baseAmount = roundMoney(Math.max(0, r.base === "TAXABLE" ? bases.taxable : bases.cotisable));
    return {
      key: r.key,
      code: r.code,
      label_fr: r.label_fr,
      label_ar: r.label_ar,
      group: complianceGroupOf(r.key),
      part: r.part,
      base: r.base,
      reduces_irg: r.reduces_irg,
      rate: r.rate,
      base_amount: baseAmount,
      amount: roundMoney(baseAmount * r.rate),
    };
  });
}

export function parseAppliedContributions(raw: unknown): AppliedContribution[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const r = item as Record<string, unknown>;
    const part = r.part === "EMPLOYER" ? "EMPLOYER" : r.part === "EMPLOYEE" ? "EMPLOYEE" : null;
    const amount = Number(r.amount);
    if (!part || !Number.isFinite(amount)) return [];
    const key = String(r.key ?? "");
    return [
      {
        key,
        code: String(r.code ?? key),
        label_fr: String(r.label_fr ?? key),
        label_ar: String(r.label_ar ?? ""),
        group: complianceGroupOf(key),
        part,
        base: r.base === "TAXABLE" ? "TAXABLE" : "COTISABLE",
        reduces_irg: r.reduces_irg === true,
        rate: Number(r.rate) || 0,
        base_amount: Number(r.base_amount) || 0,
        amount,
      } satisfies AppliedContribution,
    ];
  });
}

export function sumContributions(list: readonly AppliedContribution[], part: ContributionPart) {
  return roundMoney(list.filter((c) => c.part === part).reduce((s, c) => s + c.amount, 0));
}
