"use server";

import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { createClient } from "@/lib/supabase/server";
import type { SalDocKindRow, SalesRegisterRow } from "@/lib/ventes/db-types";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export type VentesDashboard = {
  rows: SalesRegisterRow[];
  kinds: SalDocKindRow[];
  today: string;
  canCreate: boolean;
  canUpdate: boolean;
};

function fail(error: { message: string; code?: string } | string): ActionResult<never> {
  const message = typeof error === "string" ? error : error.message;
  const code = typeof error === "string" ? undefined : error.code;
  return {
    ok: false,
    error:
      code === "42501" || message.toLowerCase().includes("permission")
        ? "Accès refusé (droits Ventes / Finance)."
        : message,
  };
}

function algiersToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Algiers",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function can(action: "create" | "read" | "update" | "delete"): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sal_can", { p_action: action });
  if (!error) return !!data;
  // Fallback if RPC not yet available in a stale environment.
  const fin = await supabase.rpc("fin_can_access", { p_action: action, p_site_id: null });
  return !fin.error && !!fin.data;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapRegisterRow(raw: Record<string, unknown>): SalesRegisterRow {
  return {
    source: raw.source === "CONTRACT" ? "CONTRACT" : "SAL",
    id: String(raw.id),
    invoice_number: String(raw.invoice_number ?? ""),
    issue_date: String(raw.issue_date ?? "").slice(0, 10),
    doc_kind: String(raw.doc_kind ?? ""),
    status: String(raw.status ?? ""),
    client_id: raw.client_id ? String(raw.client_id) : null,
    client_name: String(raw.client_name ?? "—"),
    contract_id: raw.contract_id ? String(raw.contract_id) : null,
    contract_ref: raw.contract_ref ? String(raw.contract_ref) : null,
    period_label: raw.period_label ? String(raw.period_label) : null,
    expected_bank_label: raw.expected_bank_label ? String(raw.expected_bank_label) : null,
    total_ht: num(raw.total_ht),
    total_tva: num(raw.total_tva),
    retention_amount: num(raw.retention_amount),
    stamp_amount: num(raw.stamp_amount),
    net_payable: num(raw.net_payable),
    paid_ttc: num(raw.paid_ttc),
    due_ttc: num(raw.due_ttc),
    last_payment_date: raw.last_payment_date ? String(raw.last_payment_date).slice(0, 10) : null,
    exo_attestation_no: raw.exo_attestation_no ? String(raw.exo_attestation_no) : null,
    fiscal_year: Math.trunc(num(raw.fiscal_year)) || new Date().getFullYear(),
    created_at: String(raw.created_at ?? ""),
  };
}

export async function getVentesDashboard(): Promise<ActionResult<VentesDashboard>> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return fail("Session requise.");

  const supabase = await createClient();
  const [canRead, canCreate, canUpdate, registerRes, kindsRes] = await Promise.all([
    can("read"),
    can("create"),
    can("update"),
    supabase
      .from("v_sales_register")
      .select(
        "source, id, invoice_number, issue_date, doc_kind, status, client_id, client_name, contract_id, contract_ref, period_label, expected_bank_label, total_ht, total_tva, retention_amount, stamp_amount, net_payable, paid_ttc, due_ttc, last_payment_date, exo_attestation_no, fiscal_year, created_at",
      )
      .order("issue_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("sal_doc_kinds")
      .select("code, label_fr, label_ar, has_pose, is_rg_release, is_free_amount, active, sort_order")
      .eq("active", true)
      .order("sort_order"),
  ]);

  if (!canRead) return fail("Accès refusé (droits Ventes / Finance).");
  if (registerRes.error) return fail(registerRes.error);
  if (kindsRes.error) return fail(kindsRes.error);

  return {
    ok: true,
    data: {
      rows: (registerRes.data ?? []).map((r) => mapRegisterRow(r as Record<string, unknown>)),
      kinds: (kindsRes.data ?? []) as SalDocKindRow[],
      today: algiersToday(),
      canCreate,
      canUpdate,
    },
  };
}
