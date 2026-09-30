"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { suggestWilayaCode } from "@/lib/referentiels/wilaya-match";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type UnconfirmedSite = {
  id: string;
  code: string;
  name_fr: string;
  wilaya_text: string | null;
  suggested_code: string | null;
  is_active: boolean;
};

export type OffMonthContract = {
  contract_id: string;
  employee: string;
  site_name: string | null;
  start_date: string;
  end_date: string | null;
  status: string;
  /** False when the start month is already processed: only the documented exception remains. */
  fix_allowed: boolean;
  decision_id: string | null;
  decision_status: string | null;
};

export type StartRuleStatus = {
  active: boolean;
  pending: number;
  exceptions: number;
  activated_at: string | null;
  activated_by: string | null;
};

export type DataQualityReport = {
  sites: UnconfirmedSite[];
  contracts: OffMonthContract[];
  rule: StartRuleStatus;
  is_super_admin: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidate() {
  revalidatePath("/rh/qualite-donnees");
  revalidatePath("/decisions");
}

export async function getDataQualityReport(): Promise<ActionResult<DataQualityReport>> {
  const ws = await getWorkspaceProfile();
  if (!ws) return { ok: false, error: "Session requise. · يلزم تسجيل الدخول." };
  const supabase = await createClient();
  const [sites, contracts, rule] = await Promise.all([
    supabase
      .from("ref_sites")
      .select("id, code, name_fr, wilaya, is_active")
      .is("wilaya_code", null)
      .order("code"),
    supabase.rpc("hr_data_quality_contracts"),
    supabase.rpc("hr_contract_start_rule_status"),
  ]);
  if (sites.error) return { ok: false, error: sites.error.message };
  if (contracts.error) return { ok: false, error: contracts.error.message };
  if (rule.error) return { ok: false, error: rule.error.message };
  const r = (rule.data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    data: {
      sites: (sites.data ?? []).map((s) => ({
        id: String(s.id),
        code: String(s.code),
        name_fr: String(s.name_fr),
        wilaya_text: s.wilaya ?? null,
        suggested_code: suggestWilayaCode(s.wilaya),
        is_active: Boolean(s.is_active),
      })),
      contracts: ((contracts.data ?? []) as Record<string, unknown>[]).map((c) => ({
        contract_id: String(c.contract_id),
        employee: String(c.employee ?? ""),
        site_name: (c.site_name as string | null) ?? null,
        start_date: String(c.start_date).slice(0, 10),
        end_date: c.end_date ? String(c.end_date).slice(0, 10) : null,
        status: String(c.status ?? ""),
        fix_allowed: c.fix_allowed === true,
        decision_id: (c.decision_id as string | null) ?? null,
        decision_status: (c.decision_status as string | null) ?? null,
      })),
      rule: {
        active: r.active === true,
        pending: Number(r.pending ?? 0),
        exceptions: Number(r.exceptions ?? 0),
        activated_at: typeof r.activated_at === "string" ? r.activated_at : null,
        activated_by: typeof r.activated_by === "string" ? r.activated_by : null,
      },
      is_super_admin: ws.isSuperAdmin,
    },
  };
}

/** D13 request for one contract; nothing changes until the decision is taken. */
export async function requestContractStartDecision(contractId: unknown): Promise<ActionResult<{ decision_id: string }>> {
  const parsed = z.string().regex(UUID_RE).safeParse(contractId);
  if (!parsed.success) return { ok: false, error: "Contrat invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_contract_start_request", { p_contract: parsed.data });
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true, data: { decision_id: String(data) } };
}

export async function requestAllContractStartDecisions(): Promise<ActionResult<{ count: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_contract_start_request_all");
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true, data: { count: Number(data ?? 0) } };
}

/** SUPER_ADMIN: turns "start on the 1st" into a database constraint once every D13 is decided. */
export async function activateContractStartRule(): Promise<ActionResult<{ already: boolean }>> {
  const ws = await getWorkspaceProfile();
  if (!ws?.isSuperAdmin) return { ok: false, error: "Réservé au SUPER_ADMIN." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_contract_start_rule_activate");
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true, data: { already: (data as Record<string, unknown> | null)?.already === true } };
}
