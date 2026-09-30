import type { createClient } from "@/lib/supabase/server";
import {
  cnasRegimesFromCatalog,
  irgZonesFromCatalog,
  resolveSiteZone,
  wilayaZoneMap,
  type CnasRegime,
  type CnasRegimeRates,
  type ComplianceDomain,
  type ComplianceOverride,
  type IrgZone,
  type SiteZone,
  type ZoneScopeAt,
} from "@/lib/hr/compliance";
import { siteWilayaAt } from "@/lib/hr/assignments";
import type { RuleRowTrace } from "@/lib/hr/irg-engine-load";
import { suggestWilayaCode } from "@/lib/referentiels/wilaya-match";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type ComplianceContext = {
  zones: IrgZone[];
  regimes: CnasRegime[];
  siteZone: Map<string, SiteZone>;
  socialProfile: Map<string, string | null>;
  overridesByContract: Map<string, ComplianceOverride[]>;
  /** Dated CNAS rate row in force, by regime code (payslip trace). */
  regimeRateRows: Map<string, RuleRowTrace>;
  /** D16 scopes in force, by id (payslip trace). */
  zoneScopes: Map<string, ZoneScopeAt & RuleRowTrace>;
};

export function mapOverrideRow(row: Record<string, unknown>): ComplianceOverride {
  return {
    id: String(row.id),
    contract_id: String(row.contract_id),
    domain: row.domain as ComplianceDomain,
    option_code: String(row.option_code),
    params: (row.params ?? {}) as Record<string, unknown>,
    reason: String(row.reason ?? ""),
    effective_from: String(row.effective_from).slice(0, 10),
    effective_to: row.effective_to ? String(row.effective_to).slice(0, 10) : null,
  };
}

const numOrNull = (v: unknown) => (v == null ? null : Number(v));

export async function loadComplianceContext(
  supabase: Supabase,
  input: { contractIds: string[]; siteIds: string[]; employeeIds: string[]; asOf?: string },
): Promise<{ ok: true; data: ComplianceContext } | { ok: false; error: string }> {
  const asOf = input.asOf ?? new Date().toISOString().slice(0, 10);
  const [catalogs, sites, social, overrides, regimeRates, siteWilayas, scopes] = await Promise.all([
    supabase
      .from("hr_catalogs")
      .select("id, kind, code, label_fr, label_ar, extra, is_active")
      .in("kind", ["irg_zone", "irg_zone_wilaya", "social_profile"]),
    input.siteIds.length
      ? supabase.from("ref_sites").select("id, wilaya, irg_zone_code").in("id", input.siteIds)
      : Promise.resolve({ data: [], error: null }),
    input.employeeIds.length
      ? supabase
          .from("hr_employee_social")
          .select("employee_id, social_profile_code")
          .in("employee_id", input.employeeIds)
      : Promise.resolve({ data: [], error: null }),
    input.contractIds.length
      ? supabase
          .from("hr_contract_compliance")
          .select("id, contract_id, domain, option_code, params, reason, effective_from, effective_to")
          .in("contract_id", input.contractIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("hr_social_profile_rates")
      .select("id, profile_id, employee_pct, employer_pct, fos_pct, proposal_id, decision_id")
      .lte("effective_from", asOf)
      .or(`effective_to.is.null,effective_to.gte.${asOf}`),
    input.siteIds.length
      ? supabase
          .from("ref_site_wilaya_history")
          .select("site_id, effective_from, wilaya_code, wilaya:ref_wilayas ( name_fr )")
          .in("site_id", input.siteIds)
          .lte("effective_from", asOf)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("ref_irg_zone_scopes")
      .select("id, zone_code, wilaya_codes, proposal_id, decision_id")
      .lte("effective_from", asOf)
      .or(`effective_to.is.null,effective_to.gte.${asOf}`),
  ]);
  const failed = [catalogs, sites, social, overrides, regimeRates, siteWilayas, scopes].find((r) => r.error);
  if (failed?.error) return { ok: false, error: failed.error.message };

  const items = (catalogs.data ?? []).map((i) => ({
    ...i,
    extra: (i.extra ?? {}) as Record<string, unknown>,
  }));
  const codeById = new Map(items.map((i) => [i.id, i.code]));
  const ratesByCode = new Map<string, CnasRegimeRates>();
  const regimeRateRows = new Map<string, RuleRowTrace>();
  for (const r of (regimeRates.data ?? []) as Record<string, unknown>[]) {
    const code = codeById.get(String(r.profile_id));
    if (!code) continue;
    ratesByCode.set(code, {
      employee_pct: numOrNull(r.employee_pct),
      employer_pct: numOrNull(r.employer_pct),
      fos_pct: numOrNull(r.fos_pct),
    });
    regimeRateRows.set(code, {
      id: String(r.id),
      status: r.proposal_id ? "APPLIED" : "LEGACY",
      proposal_id: r.proposal_id ? String(r.proposal_id) : null,
      decision_id: r.decision_id ? String(r.decision_id) : null,
    });
  }
  const zoneScopes = new Map<string, ZoneScopeAt & RuleRowTrace>();
  for (const s of (scopes.data ?? []) as Record<string, unknown>[]) {
    zoneScopes.set(String(s.id), {
      id: String(s.id),
      zone_code: String(s.zone_code),
      wilaya_codes: Array.isArray(s.wilaya_codes) ? s.wilaya_codes.map(String) : [],
      status: "APPLIED",
      proposal_id: s.proposal_id ? String(s.proposal_id) : null,
      decision_id: s.decision_id ? String(s.decision_id) : null,
    });
  }
  const scopeList = [...zoneScopes.values()];
  const wilayas = wilayaZoneMap(items);
  const datedRows = (siteWilayas.data ?? []) as unknown as {
    site_id: string;
    effective_from: string;
    wilaya_code: string;
    wilaya: { name_fr: string } | { name_fr: string }[] | null;
  }[];
  const nameByCode = new Map<string, string>();
  for (const r of datedRows) {
    const w = Array.isArray(r.wilaya) ? r.wilaya[0] : r.wilaya;
    if (w?.name_fr) nameByCode.set(r.wilaya_code, w.name_fr);
  }
  const history = datedRows.map((r) => ({
    site_id: r.site_id,
    effective_from: String(r.effective_from).slice(0, 10),
    wilaya_code: r.wilaya_code,
  }));
  const siteZone = new Map<string, SiteZone>();
  for (const s of (sites.data ?? []) as { id: string; wilaya: string | null; irg_zone_code: string | null }[]) {
    const code = siteWilayaAt(history, s.id, asOf);
    const dated = code ? nameByCode.get(code) : undefined;
    siteZone.set(
      s.id,
      resolveSiteZone(
        { irg_zone_code: s.irg_zone_code, wilaya: dated ?? s.wilaya, wilaya_code: code ?? suggestWilayaCode(s.wilaya) },
        wilayas,
        scopeList,
      ),
    );
  }
  const socialProfile = new Map<string, string | null>();
  for (const s of (social.data ?? []) as { employee_id: string; social_profile_code: string | null }[]) {
    socialProfile.set(s.employee_id, s.social_profile_code);
  }
  const overridesByContract = new Map<string, ComplianceOverride[]>();
  for (const raw of (overrides.data ?? []) as Record<string, unknown>[]) {
    const row = mapOverrideRow(raw);
    const list = overridesByContract.get(row.contract_id) ?? [];
    list.push(row);
    overridesByContract.set(row.contract_id, list);
  }
  return {
    ok: true,
    data: {
      zones: irgZonesFromCatalog(items),
      regimes: cnasRegimesFromCatalog(items, ratesByCode),
      siteZone,
      socialProfile,
      overridesByContract,
      regimeRateRows,
      zoneScopes,
    },
  };
}
