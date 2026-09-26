import { computeMonthlyIrg, type IrgBracket, type IrgRule } from "@/lib/hr/irg-calc";
import { roundMoney } from "@/lib/hr/payroll-calc";

export const COMPLIANCE_DOMAINS = ["IRG", "CNAS", "CACOBATPH"] as const;
export type ComplianceDomain = (typeof COMPLIANCE_DOMAINS)[number];

export const IRG_MANUAL_OPTIONS = ["BAREME", "ZONE", "HANDICAP", "EXEMPT", "FIXED_RATE"] as const;
export type IrgManualOption = (typeof IRG_MANUAL_OPTIONS)[number];

export const FIXED_IRG_RATES = [0.1, 0.15] as const;

export const DEFAULT_IRG_ZONE = "NORMAL";
export const DEFAULT_CNAS_REGIME = "STANDARD";
export const DISABLED_IRG_CATEGORY = "DISABLED_OR_RETIREE";

export type ComplianceOverride = {
  id: string;
  contract_id: string;
  domain: ComplianceDomain;
  option_code: string;
  params: Record<string, unknown>;
  reason: string;
  effective_from: string;
  effective_to: string | null;
};

export type IrgZone = {
  code: string;
  label_fr: string;
  label_ar: string;
  rate_var_key: string | null;
  applies_to: "TAX" | "BASE";
};

export type CnasRegime = {
  code: string;
  label_fr: string;
  label_ar: string;
  /** Percentages (9 = 9 %). Null = legal variable of the period. */
  employee_pct: number | null;
  employer_pct: number | null;
  fos_pct: number | null;
};

type CatalogLike = {
  kind: string;
  code: string;
  label_fr: string;
  label_ar: string;
  extra: Record<string, unknown>;
  is_active: boolean;
};

function optPct(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

export function irgZonesFromCatalog(items: readonly CatalogLike[]): IrgZone[] {
  return items
    .filter((i) => i.kind === "irg_zone" && i.is_active)
    .map((i) => ({
      code: i.code,
      label_fr: i.label_fr,
      label_ar: i.label_ar,
      rate_var_key:
        typeof i.extra.rate_var_key === "string" && i.extra.rate_var_key.trim()
          ? i.extra.rate_var_key.trim()
          : null,
      applies_to: i.extra.applies_to === "BASE" ? "BASE" : "TAX",
    }));
}

export function cnasRegimesFromCatalog(items: readonly CatalogLike[]): CnasRegime[] {
  return items
    .filter((i) => i.kind === "social_profile" && i.is_active)
    .map((i) => ({
      code: i.code,
      label_fr: i.label_fr,
      label_ar: i.label_ar,
      employee_pct: optPct(i.extra.employee_pct),
      employer_pct: optPct(i.extra.employer_pct),
      fos_pct: optPct(i.extra.fos_pct),
    }));
}

export function normalizeWilaya(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\u0600-\u06FF]+/g, " ")
    .trim();
}

/** Normalized wilaya (code or label of the catalog row) → zone code. */
export function wilayaZoneMap(items: readonly CatalogLike[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const i of items) {
    if (i.kind !== "irg_zone_wilaya" || !i.is_active) continue;
    const zone = typeof i.extra.zone === "string" ? i.extra.zone.trim() : "";
    if (!zone) continue;
    for (const key of [i.code, i.label_fr, i.label_ar]) {
      const k = normalizeWilaya(key);
      if (k && !map.has(k)) map.set(k, zone);
    }
  }
  return map;
}

export function contractTypeAllowsFixedIrg(
  items: readonly CatalogLike[],
  contractTypeCode: string | null | undefined,
) {
  if (!contractTypeCode) return false;
  const row = items.find((i) => i.kind === "contract_type" && i.code === contractTypeCode);
  const flag = row?.extra.allows_fixed_irg;
  return flag === true || flag === "true";
}

export type SiteZone = { code: string; source: "site" | "wilaya" | "default" };

export function resolveSiteZone(
  site: { irg_zone_code?: string | null; wilaya?: string | null } | null | undefined,
  wilayaMap: ReadonlyMap<string, string>,
): SiteZone {
  const explicit = site?.irg_zone_code?.trim();
  if (explicit) return { code: explicit, source: "site" };
  const mapped = wilayaMap.get(normalizeWilaya(site?.wilaya));
  if (mapped) return { code: mapped, source: "wilaya" };
  return { code: DEFAULT_IRG_ZONE, source: "default" };
}

/** Override in force at any day of the period (latest start wins). */
export function pickOverride(
  rows: readonly ComplianceOverride[],
  domain: ComplianceDomain,
  periodStart: string,
  periodEnd: string,
): ComplianceOverride | null {
  let best: ComplianceOverride | null = null;
  for (const r of rows) {
    if (r.domain !== domain) continue;
    if (r.effective_from > periodEnd) continue;
    if (r.effective_to && r.effective_to < periodStart) continue;
    if (!best || r.effective_from > best.effective_from) best = r;
  }
  return best;
}

export type ResolvedIrg = {
  mode: "AUTO" | "MANUAL";
  option: "AUTO" | IrgManualOption;
  category: string;
  zone_code: string | null;
  /** Fraction (0.5 = 50 %). */
  zone_rate: number;
  zone_applies_to: "TAX" | "BASE";
  fixed_rate: number | null;
};

export type ResolvedCnas = {
  mode: "AUTO" | "MANUAL";
  regime_code: string;
  employee: number;
  employer: number;
  fos: number;
};

export type ResolvedCacobatph = {
  mode: "AUTO" | "MANUAL";
  conges: boolean;
  intemperies: boolean;
};

export type ResolvedCompliance = {
  irg: ResolvedIrg;
  cnas: ResolvedCnas;
  cacobatph: ResolvedCacobatph;
  override_ids: string[];
};

function paramString(params: Record<string, unknown>, key: string) {
  const v = params[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function paramBool(params: Record<string, unknown>, key: string) {
  const v = params[key];
  return v === true || v === "true";
}

export function resolveCompliance(input: {
  overrides: readonly ComplianceOverride[];
  periodStart: string;
  periodEnd: string;
  employeeIrgCategory: string | null | undefined;
  socialProfileCode: string | null | undefined;
  siteZoneCode: string;
  activity: { cacobatph: boolean; intemperies: boolean };
  vars: Readonly<Record<string, number>>;
  zones: readonly IrgZone[];
  regimes: readonly CnasRegime[];
}): ResolvedCompliance {
  const ids: string[] = [];
  const pick = (domain: ComplianceDomain) => {
    const row = pickOverride(input.overrides, domain, input.periodStart, input.periodEnd);
    if (row) ids.push(row.id);
    return row;
  };
  const zoneRate = (code: string | null) => {
    const zone = code ? input.zones.find((z) => z.code === code) : undefined;
    const raw = zone?.rate_var_key ? Number(input.vars[zone.rate_var_key] ?? 0) : 0;
    return {
      rate: Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0,
      applies_to: zone?.applies_to ?? ("TAX" as const),
    };
  };
  const category = input.employeeIrgCategory || "STANDARD";

  const irgRow = pick("IRG");
  let irg: ResolvedIrg;
  if (!irgRow) {
    const z = zoneRate(input.siteZoneCode);
    irg = {
      mode: "AUTO",
      option: "AUTO",
      category,
      zone_code: input.siteZoneCode,
      zone_rate: z.rate,
      zone_applies_to: z.applies_to,
      fixed_rate: null,
    };
  } else {
    const option = irgRow.option_code as IrgManualOption;
    const base: ResolvedIrg = {
      mode: "MANUAL",
      option,
      category: "STANDARD",
      zone_code: null,
      zone_rate: 0,
      zone_applies_to: "TAX",
      fixed_rate: null,
    };
    if (option === "ZONE") {
      const code = paramString(irgRow.params, "zone_code") ?? input.siteZoneCode;
      const z = zoneRate(code);
      irg = { ...base, category, zone_code: code, zone_rate: z.rate, zone_applies_to: z.applies_to };
    } else if (option === "HANDICAP") {
      irg = { ...base, category: DISABLED_IRG_CATEGORY };
    } else if (option === "FIXED_RATE") {
      const rate = Number(irgRow.params.rate);
      irg = { ...base, fixed_rate: Number.isFinite(rate) && rate > 0 && rate < 1 ? rate : 0.1 };
    } else {
      irg = base;
    }
  }

  const cnasRow = pick("CNAS");
  const regimeCode =
    (cnasRow ? paramString(cnasRow.params, "regime_code") : null) ??
    (input.socialProfileCode?.trim() || DEFAULT_CNAS_REGIME);
  const regime = input.regimes.find((r) => r.code === regimeCode);
  const legal = (key: string) => Number(input.vars[key] ?? 0) || 0;
  const cnas: ResolvedCnas = {
    mode: cnasRow ? "MANUAL" : "AUTO",
    regime_code: regimeCode,
    employee: regime?.employee_pct != null ? regime.employee_pct / 100 : legal("CNAS_EMPLOYEE"),
    employer: regime?.employer_pct != null ? regime.employer_pct / 100 : legal("CNAS_EMPLOYER_BASE"),
    fos: regime?.fos_pct != null ? regime.fos_pct / 100 : legal("CNAS_FOS"),
  };

  const cacoRow = pick("CACOBATPH");
  const cacobatph: ResolvedCacobatph = cacoRow
    ? {
        mode: "MANUAL",
        conges: paramBool(cacoRow.params, "conges"),
        intemperies: paramBool(cacoRow.params, "intemperies"),
      }
    : { mode: "AUTO", conges: input.activity.cacobatph, intemperies: input.activity.intemperies };

  return { irg, cnas, cacobatph, override_ids: ids };
}

export function computeResolvedIrg(input: {
  irgBase: number;
  irg: ResolvedIrg;
  brackets: IrgBracket[];
  rulesByCategory: Record<string, IrgRule[]>;
}): number {
  const base = Math.max(0, input.irgBase);
  const { irg } = input;
  if (irg.option === "EXEMPT") return 0;
  if (irg.fixed_rate != null) return roundMoney(base * irg.fixed_rate);
  const rules = input.rulesByCategory[irg.category] ?? input.rulesByCategory.STANDARD ?? [];
  const taxedBase = irg.zone_applies_to === "BASE" ? base * (1 - irg.zone_rate) : base;
  const tax = computeMonthlyIrg({ irgBaseMonthly: taxedBase, brackets: input.brackets, rules });
  if (irg.zone_applies_to === "TAX" && irg.zone_rate > 0) {
    return roundMoney(tax * (1 - irg.zone_rate));
  }
  return tax;
}

export type ComplianceLabels = { irg: string; cnas: string; cacobatph: string };

function pctLabel(fraction: number) {
  return `${Math.round(fraction * 10000) / 100} %`;
}

/** Short French labels (payslip footer, G50 regime column). */
export function complianceLabels(
  r: ResolvedCompliance,
  zones: readonly IrgZone[],
  regimes: readonly CnasRegime[],
): ComplianceLabels {
  const zoneName = (code: string | null) =>
    zones.find((z) => z.code === code)?.label_fr ?? code ?? DEFAULT_IRG_ZONE;
  const zonePart = (code: string | null, rate: number) =>
    rate > 0 ? `${zoneName(code)} (−${pctLabel(rate)})` : zoneName(code);
  let irg: string;
  switch (r.irg.option) {
    case "BAREME":
      irg = "Barème général";
      break;
    case "ZONE":
      irg = zonePart(r.irg.zone_code, r.irg.zone_rate);
      break;
    case "HANDICAP":
      irg = "Handicapé / retraité (lissage étendu)";
      break;
    case "EXEMPT":
      irg = "Exonéré";
      break;
    case "FIXED_RATE":
      irg = `Taux libératoire ${pctLabel(r.irg.fixed_rate ?? 0)}`;
      break;
    default:
      irg = [
        zonePart(r.irg.zone_code, r.irg.zone_rate),
        r.irg.category === DISABLED_IRG_CATEGORY ? "handicapé / retraité" : null,
      ]
        .filter(Boolean)
        .join(" · ");
  }
  const regime = regimes.find((x) => x.code === r.cnas.regime_code);
  const cnas = `${regime?.label_fr ?? r.cnas.regime_code} (${pctLabel(r.cnas.employee)} / ${pctLabel(
    r.cnas.employer + r.cnas.fos,
  )})`;
  const cacobatph =
    r.cacobatph.conges || r.cacobatph.intemperies
      ? [r.cacobatph.conges ? "congés" : null, r.cacobatph.intemperies ? "intempéries" : null]
          .filter(Boolean)
          .join(" + ")
      : "Non assujetti";
  const manual = (mode: "AUTO" | "MANUAL", text: string) => (mode === "MANUAL" ? `${text} · manuel` : text);
  return {
    irg: manual(r.irg.mode, irg),
    cnas: manual(r.cnas.mode, cnas),
    cacobatph: manual(r.cacobatph.mode, cacobatph),
  };
}

/** Frozen on each slip: what was resolved and how it reads on the payslip. */
export type SnapshotCompliance = ResolvedCompliance & { labels: ComplianceLabels };

export function parseSnapshotCompliance(raw: unknown): SnapshotCompliance | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<SnapshotCompliance>;
  if (!r.irg || !r.cnas || !r.cacobatph || !r.labels) return null;
  const labels = r.labels as Partial<ComplianceLabels>;
  if (typeof labels.irg !== "string" || typeof labels.cnas !== "string" || typeof labels.cacobatph !== "string") {
    return null;
  }
  return {
    irg: r.irg,
    cnas: r.cnas,
    cacobatph: r.cacobatph,
    override_ids: Array.isArray(r.override_ids) ? r.override_ids.map(String) : [],
    labels: { irg: labels.irg, cnas: labels.cnas, cacobatph: labels.cacobatph },
  };
}
