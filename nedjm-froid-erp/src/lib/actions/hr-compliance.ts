"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireHrSalaryValues } from "@/lib/auth/require-roles";
import { refreshDraftPayroll } from "@/lib/actions/hr-ops";
import { legalVarsAsOf } from "@/lib/hr/legal-vars-as-of";
import { loadComplianceContext, mapOverrideRow } from "@/lib/hr/compliance-load";
import {
  COMPLIANCE_DOMAINS,
  contractTypeAllowsFixedIrg,
  DEFAULT_IRG_ZONE,
  FIXED_IRG_RATES,
  IRG_MANUAL_OPTIONS,
  resolveCompliance,
  type CnasRegime,
  type ComplianceOverride,
  type IrgZone,
  type ResolvedCompliance,
  type SiteZone,
} from "@/lib/hr/compliance";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ContractCompliance = {
  contract_id: string;
  as_of: string;
  overrides: ComplianceOverride[];
  /** What the engine applies today without any override. */
  auto: ResolvedCompliance;
  /** What the engine applies today (overrides included). */
  current: ResolvedCompliance;
  site_zone: SiteZone;
  site_wilaya: string | null;
  irg_category: string;
  social_profile_code: string | null;
  zones: IrgZone[];
  regimes: CnasRegime[];
  zone_rates: Record<string, number>;
  allows_fixed_irg: boolean;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function dayBefore(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function revalidate() {
  revalidatePath("/rh/contrats");
  revalidatePath("/rh/paie");
  revalidatePath("/rh/paie/bulletins");
  revalidatePath("/rh/paie/fiscal");
  revalidatePath("/rh/paie/social");
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadContract(supabase: Supabase, contractId: string) {
  return supabase
    .from("hr_contracts")
    .select("id, employee_id, site_id, activity_code_id, contract_type_code, employee:hr_employees ( irg_category )")
    .eq("id", contractId)
    .maybeSingle();
}

export async function getContractCompliance(
  contractId: string,
): Promise<ActionResult<ContractCompliance>> {
  if (!z.string().uuid().safeParse(contractId).success) {
    return { ok: false, error: "Contrat invalide." };
  }
  const supabase = await createClient();
  const { data: ctr, error } = await loadContract(supabase, contractId);
  if (error) return { ok: false, error: error.message };
  if (!ctr) return { ok: false, error: "Contrat introuvable." };

  const asOf = new Date().toISOString().slice(0, 10);
  const [ctx, vars, activity, site, contractTypes] = await Promise.all([
    loadComplianceContext(supabase, {
      contractIds: [ctr.id],
      siteIds: [ctr.site_id],
      employeeIds: [ctr.employee_id],
    }),
    legalVarsAsOf(supabase, asOf),
    supabase
      .from("ref_activity_codes")
      .select("applies_cacobatph, applies_intemperies")
      .eq("id", ctr.activity_code_id)
      .maybeSingle(),
    supabase.from("ref_sites").select("wilaya").eq("id", ctr.site_id).maybeSingle(),
    supabase
      .from("hr_catalogs")
      .select("kind, code, label_fr, label_ar, extra, is_active")
      .eq("kind", "contract_type"),
  ]);
  if (!ctx.ok) return ctx;
  const cx = ctx.data;
  const emp = Array.isArray(ctr.employee) ? ctr.employee[0] : ctr.employee;
  const category = (emp as { irg_category?: string } | null)?.irg_category ?? "STANDARD";
  const siteZone = cx.siteZone.get(ctr.site_id) ?? { code: DEFAULT_IRG_ZONE, source: "default" as const };
  const socialProfile = cx.socialProfile.get(ctr.employee_id) ?? null;
  const overrides = (cx.overridesByContract.get(ctr.id) ?? []).sort((a, b) =>
    b.effective_from.localeCompare(a.effective_from),
  );
  const base = {
    periodStart: asOf,
    periodEnd: asOf,
    employeeIrgCategory: category,
    socialProfileCode: socialProfile,
    siteZoneCode: siteZone.code,
    activity: {
      cacobatph: Boolean(activity.data?.applies_cacobatph),
      intemperies: Boolean(activity.data?.applies_intemperies),
    },
    vars,
    zones: cx.zones,
    regimes: cx.regimes,
  };
  const zoneRates: Record<string, number> = {};
  for (const z of cx.zones) zoneRates[z.code] = z.rate_var_key ? Number(vars[z.rate_var_key] ?? 0) : 0;

  return {
    ok: true,
    data: {
      contract_id: ctr.id,
      as_of: asOf,
      overrides,
      auto: resolveCompliance({ ...base, overrides: [] }),
      current: resolveCompliance({ ...base, overrides }),
      site_zone: siteZone,
      site_wilaya: site.data?.wilaya ?? null,
      irg_category: category,
      social_profile_code: socialProfile,
      zones: cx.zones,
      regimes: cx.regimes,
      zone_rates: zoneRates,
      allows_fixed_irg: contractTypeAllowsFixedIrg(
        (contractTypes.data ?? []).map((i) => ({ ...i, extra: (i.extra ?? {}) as Record<string, unknown> })),
        ctr.contract_type_code,
      ),
    },
  };
}

const saveSchema = z.object({
  contract_id: z.string().uuid(),
  domain: z.enum(COMPLIANCE_DOMAINS),
  option_code: z.string().trim().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
  reason: z
    .string()
    .trim()
    .min(5, "Motif obligatoire (5 caractères min.) · السبب إلزامي (5 أحرف على الأقل)")
    .max(500),
  effective_from: z.string().regex(ISO_DATE, "Date d'effet invalide · تاريخ السريان غير صالح"),
});

export async function saveComplianceOverride(
  input: unknown,
): Promise<ActionResult<{ id: string; refreshed_slips: number }>> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const p = parsed.data;
  const supabase = await createClient();
  const info = await getContractCompliance(p.contract_id);
  if (!info.ok) return info;
  const cx = info.data;

  let params: Record<string, unknown> = {};
  if (p.domain === "IRG") {
    if (!(IRG_MANUAL_OPTIONS as readonly string[]).includes(p.option_code)) {
      return { ok: false, error: "Option IRG inconnue." };
    }
    if (p.option_code === "ZONE") {
      const zone = String(p.params.zone_code ?? "");
      if (!cx.zones.some((z) => z.code === zone)) return { ok: false, error: "Zone IRG inconnue." };
      params = { zone_code: zone };
    }
    if (p.option_code === "FIXED_RATE") {
      if (!cx.allows_fixed_irg) {
        return {
          ok: false,
          error:
            "Taux libératoire non autorisé pour ce type de contrat (Paramètres RH › Type de contrat › allows_fixed_irg). · النسبة المحررة غير مسموحة لهذا النوع من العقود.",
        };
      }
      const rate = Number(p.params.rate);
      if (!FIXED_IRG_RATES.some((r) => Math.abs(r - rate) < 1e-9)) {
        return { ok: false, error: "Taux libératoire : 10 % ou 15 %." };
      }
      params = { rate };
    }
  } else if (p.domain === "CNAS") {
    if (p.option_code !== "REGIME") return { ok: false, error: "Option CNAS inconnue." };
    const code = String(p.params.regime_code ?? "");
    if (!cx.regimes.some((r) => r.code === code)) return { ok: false, error: "Régime CNAS inconnu." };
    params = { regime_code: code };
  } else {
    if (p.option_code !== "CUSTOM") return { ok: false, error: "Option CACOBATPH inconnue." };
    params = { conges: p.params.conges === true, intemperies: p.params.intemperies === true };
  }

  const sameDomain = cx.overrides.filter((o) => o.domain === p.domain);
  if (sameDomain.some((o) => o.effective_from >= p.effective_from)) {
    return {
      ok: false,
      error:
        "Une dérogation commence déjà à cette date ou après. Terminez-la d'abord. · توجد استثناءات تبدأ في هذا التاريخ أو بعده، أنهها أولاً.",
    };
  }
  for (const o of sameDomain) {
    if (o.effective_to && o.effective_to < p.effective_from) continue;
    const { error: closeErr } = await supabase
      .from("hr_contract_compliance")
      .update({ effective_to: dayBefore(p.effective_from) })
      .eq("id", o.id);
    if (closeErr) return { ok: false, error: closeErr.message };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("hr_contract_compliance")
    .insert({
      contract_id: p.contract_id,
      domain: p.domain,
      option_code: p.option_code,
      params,
      reason: p.reason,
      effective_from: p.effective_from,
      created_by: user?.id ?? null,
    })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Enregistrement refusé (droits)." };

  const refreshed = await refreshContractDrafts(supabase, p.contract_id);
  revalidate();
  return { ok: true, data: { id: data.id, refreshed_slips: refreshed } };
}

const endSchema = z.object({
  id: z.string().uuid(),
  /** First day back in automatic mode. */
  auto_from: z.string().regex(ISO_DATE, "Date invalide · تاريخ غير صالح"),
});

export async function endComplianceOverride(
  input: unknown,
): Promise<ActionResult<{ deleted: boolean; refreshed_slips: number }>> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  const parsed = endSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const supabase = await createClient();
  const { data: raw, error: readErr } = await supabase
    .from("hr_contract_compliance")
    .select("id, contract_id, domain, option_code, params, reason, effective_from, effective_to")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!raw) return { ok: false, error: "Dérogation introuvable." };
  const row = mapOverrideRow(raw);

  const deleted = parsed.data.auto_from <= row.effective_from;
  const { error } = deleted
    ? await supabase.from("hr_contract_compliance").delete().eq("id", row.id)
    : await supabase
        .from("hr_contract_compliance")
        .update({ effective_to: dayBefore(parsed.data.auto_from) })
        .eq("id", row.id);
  if (error) return { ok: false, error: error.message };

  const refreshed = await refreshContractDrafts(supabase, row.contract_id);
  revalidate();
  return { ok: true, data: { deleted, refreshed_slips: refreshed } };
}

async function refreshContractDrafts(supabase: Supabase, contractId: string) {
  const { data: ctr } = await supabase
    .from("hr_contracts")
    .select("employee_id")
    .eq("id", contractId)
    .maybeSingle();
  if (!ctr) return 0;
  const refreshed = await refreshDraftPayroll({ employeeId: ctr.employee_id, contractId });
  return refreshed.ok ? refreshed.data.count : 0;
}
