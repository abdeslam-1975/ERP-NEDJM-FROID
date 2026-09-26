/** Legal variables edited from the unit 05 screen. Keep in sync with public.erp_is_compliance_key(). */
export const LEGAL_KEYS = [
  "CNAS_EMPLOYEE",
  "CNAS_EMPLOYER_BASE",
  "CNAS_FOS",
  "CACOBATPH_CONGES",
  "CACOBATPH_INTEMPERIES",
  "CACOBATPH_INTEMPERIES_EMP",
  "CACOBATPH_INTEMPERIES_SAL",
  "NJM_DIVISEUR_FIXED",
  "SNMG",
  "IRG_ZONE_SUD",
  "IRG_ZONE_GRAND_SUD",
  "HEURES_MENSUELLES",
  "HS_TAUX_50",
  "HS_TAUX_75",
  "HS_TAUX_100",
  "CONGE_JOURS_MOIS",
] as const;

export type ComplianceGroup = "cnas" | "cacobatph" | "irg" | "other";

/** Groups where users can add their own contributions, with the key prefix of each. */
export const CONTRIBUTION_PREFIX = {
  cnas: "CNAS_",
  cacobatph: "CACOBATPH_",
  irg: "IRG_",
} as const;
export type ContributionGroup = keyof typeof CONTRIBUTION_PREFIX;

const PREFIXED_KEY = /^(CNAS|CACOBATPH|IRG)_[A-Z0-9_]+$/;

export function isComplianceKey(key: string) {
  return PREFIXED_KEY.test(key) || (LEGAL_KEYS as readonly string[]).includes(key);
}

export function complianceGroupOf(key: string): ComplianceGroup {
  if (key.startsWith("CNAS_")) return "cnas";
  if (key.startsWith("CACOBATPH_")) return "cacobatph";
  if (key.startsWith("IRG_")) return "irg";
  return "other";
}

/** CNAS_ + "Retraite anticipée" → CNAS_RETRAITE_ANTICIPEE (unique against `taken`). */
export function contributionKey(group: ContributionGroup, label: string, taken: readonly string[]) {
  const slug =
    label
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 30) || "TAUX";
  const base = `${CONTRIBUTION_PREFIX[group]}${slug}`;
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}_${i}`;
    if (!used.has(candidate)) return candidate;
  }
}
