"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { workspaceHasRole } from "@/lib/auth/require-roles";
import { createClient } from "@/lib/supabase/server";
import { listPayrollSlips } from "@/lib/actions/hr-ops";
import {
  ACCOUNT_KEYS,
  allocatePayrollCosts,
  buildPayrollJournal,
  resolveAccounts,
  type AccountKey,
  type ContractCost,
  type CostContract,
  type CostSite,
  type JournalLine,
  type SiteCost,
} from "@/lib/hr/cost-allocation";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export type CostReport = {
  year: number;
  month: number;
  provisional: boolean;
  slips: number;
  sites: SiteCost[];
  contracts: ContractCost[];
  total: number;
  contractsVisible: boolean;
  journal: { lines: JournalLine[]; debit: number; credit: number; balanced: boolean };
  journalCode: string;
  accounts: Record<AccountKey, { account: string; label: string }>;
};

export async function loadCostReport(input: { year: number; month: number; siteId?: string | null }): Promise<ActionResult<CostReport>> {
  const slips = await listPayrollSlips({ year: input.year, month: input.month });
  if (!slips.ok) return slips;
  const scoped = slips.data.filter((s) => !input.siteId || s.site_id === input.siteId);
  const supabase = await createClient();
  const [sites, contracts, settings, runs] = await Promise.all([
    supabase.from("ref_sites").select("id, code, name_fr"),
    supabase.from("com_client_contracts").select("id, site_id, reference, client_name, start_date, end_date, status"),
    supabase.from("hr_accounting_settings").select("journal_code, accounts").eq("id", 1).maybeSingle(),
    supabase.from("hr_payroll_runs").select("status_code").eq("period_year", input.year).eq("period_month", input.month),
  ]);
  const siteRows = (sites.data ?? []) as CostSite[];
  const contractRows: CostContract[] = (contracts.data ?? [])
    .filter((c) => String(c.status ?? "").toUpperCase() !== "DRAFT")
    .map((c) => ({
      id: c.id,
      site_id: c.site_id,
      reference: c.reference,
      client_name: c.client_name,
      start_date: c.start_date,
      end_date: c.end_date,
    }));
  const costSlips = scoped.map((s) => ({
    id: s.id,
    employee_id: s.employee_id,
    site_id: s.site_id,
    employee_ss: s.employee_ss,
    employer_ss: s.employer_ss,
    cacobatph: s.cacobatph,
    intemperies_employee: s.intemperies_employee,
    intemperies_employer: s.intemperies_employer,
    irg_amount: s.irg_amount,
    net_payable: s.net_payable,
    lines: (s.lines ?? []).map((l) => ({ nature: l.nature, source_code: l.source_code, amount: l.amount })),
  }));
  const alloc = allocatePayrollCosts({ year: input.year, month: input.month, slips: costSlips, sites: siteRows, contracts: contractRows });
  const accounts = resolveAccounts(settings.data?.accounts);
  const journal = buildPayrollJournal({ slips: costSlips, sites: siteRows, accounts });
  const statuses = (runs.data ?? []).map((r) => r.status_code);
  return {
    ok: true,
    data: {
      year: input.year,
      month: input.month,
      provisional: !statuses.length || statuses.some((s) => s === "DRAFT"),
      slips: costSlips.length,
      ...alloc,
      contractsVisible: !contracts.error,
      journal,
      journalCode: settings.data?.journal_code ?? "PAIE",
      accounts,
    },
  };
}

export async function saveAccountingSettings(input: {
  journal_code: string;
  accounts: Record<string, { account: string; label: string }>;
}): Promise<ActionResult> {
  const ws = await getWorkspaceProfile();
  if (!ws) return { ok: false, error: "Session expirée." };
  if (!ws.isSuperAdmin && !workspaceHasRole(ws, ["ADMIN_FINANCE", "GERANT"])) {
    return { ok: false, error: "Réservé à la finance / gérance." };
  }
  const code = input.journal_code.trim().toUpperCase();
  if (!/^[A-Z0-9_]{2,10}$/.test(code)) return { ok: false, error: "Code journal : 2 à 10 caractères A-Z, 0-9." };
  const accounts: Record<string, { account: string; label: string }> = {};
  for (const k of ACCOUNT_KEYS) {
    const v = input.accounts[k];
    if (!v) continue;
    if (!/^\d{2,10}$/.test(v.account.trim())) return { ok: false, error: `Compte invalide pour « ${k} » (chiffres uniquement).` };
    accounts[k] = { account: v.account.trim(), label: v.label.trim() };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_accounting_settings")
    .update({ journal_code: code, accounts, updated_by: ws.id })
    .eq("id", 1)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Mise à jour refusée." };
  revalidatePath("/rh/couts");
  return { ok: true, data: undefined };
}
