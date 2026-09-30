import type { ResolvedCompliance, SiteZone } from "@/lib/hr/compliance";
import type { IrgEngine, RuleRowTrace } from "@/lib/hr/irg-engine-load";
import type { PayrollSlipTrace, SlipRuleRef } from "@/lib/hr/legal-vars-as-of";

/** Rule rows, versions and decisions frozen on a slip at generation. */
export function buildSlipTrace(input: {
  legalVarRows: Readonly<Record<string, RuleRowTrace>>;
  irg: IrgEngine["trace"];
  resolved: ResolvedCompliance;
  siteZone: SiteZone | undefined;
  zoneScope: RuleRowTrace | undefined;
  regimeRates: RuleRowTrace | undefined;
  contract: { id: string; start_exception_decision: string | null };
  assignment: { id: string | null; corrected_by_decision: string | null };
  salaryVersionId: string | null;
  payrollDecisionId: string | null;
}): PayrollSlipTrace {
  const rules: SlipRuleRef[] = Object.entries(input.legalVarRows)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, row]) => ({ ...row, family: "LEGAL_VAR", key }));

  const { irg, cnas } = input.resolved;
  if (irg.option !== "EXEMPT" && irg.fixed_rate == null) {
    if (input.irg.bareme) rules.push({ ...input.irg.bareme, family: "IRG_BAREME", key: "BAREME" });
    const category = input.irg.rule_sets[irg.category] ? irg.category : "STANDARD";
    const set = input.irg.rule_sets[category];
    if (set) rules.push({ ...set, family: "IRG_RULES", key: category });
    if (
      input.zoneScope &&
      input.siteZone?.source === "scope" &&
      irg.zone_code === input.siteZone.code
    ) {
      rules.push({ ...input.zoneScope, family: "IRG_ZONE_SCOPE", key: input.siteZone.code });
    }
  }
  if (input.regimeRates) rules.push({ ...input.regimeRates, family: "CNAS_RATES", key: cnas.regime_code });

  return {
    rules,
    contract: input.contract,
    assignment: input.assignment,
    salary_version_id: input.salaryVersionId,
    payroll_decision_id: input.payrollDecisionId,
  };
}
