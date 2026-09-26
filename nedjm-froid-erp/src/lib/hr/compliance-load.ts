import type { createClient } from "@/lib/supabase/server";
import {
  cnasRegimesFromCatalog,
  irgZonesFromCatalog,
  resolveSiteZone,
  wilayaZoneMap,
  type CnasRegime,
  type ComplianceDomain,
  type ComplianceOverride,
  type IrgZone,
  type SiteZone,
} from "@/lib/hr/compliance";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type ComplianceContext = {
  zones: IrgZone[];
  regimes: CnasRegime[];
  siteZone: Map<string, SiteZone>;
  socialProfile: Map<string, string | null>;
  overridesByContract: Map<string, ComplianceOverride[]>;
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

export async function loadComplianceContext(
  supabase: Supabase,
  input: { contractIds: string[]; siteIds: string[]; employeeIds: string[] },
): Promise<{ ok: true; data: ComplianceContext } | { ok: false; error: string }> {
  const [catalogs, sites, social, overrides] = await Promise.all([
    supabase
      .from("hr_catalogs")
      .select("kind, code, label_fr, label_ar, extra, is_active")
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
  ]);
  const failed = [catalogs, sites, social, overrides].find((r) => r.error);
  if (failed?.error) return { ok: false, error: failed.error.message };

  const items = (catalogs.data ?? []).map((i) => ({
    ...i,
    extra: (i.extra ?? {}) as Record<string, unknown>,
  }));
  const wilayas = wilayaZoneMap(items);
  const siteZone = new Map<string, SiteZone>();
  for (const s of (sites.data ?? []) as { id: string; wilaya: string | null; irg_zone_code: string | null }[]) {
    siteZone.set(s.id, resolveSiteZone(s, wilayas));
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
      regimes: cnasRegimesFromCatalog(items),
      siteZone,
      socialProfile,
      overridesByContract,
    },
  };
}
