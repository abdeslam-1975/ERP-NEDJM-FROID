"use server";

import { revalidatePath } from "next/cache";
import { requireHrSalaryValues } from "@/lib/auth/require-roles";
import { createClient } from "@/lib/supabase/server";
import { getHrBulletinSettings } from "@/lib/actions/hr-bulletin";
import {
  buildInterimStatement,
  buildInterimStatementHtml,
  type InterimContract,
  type InterimLine,
  type InterimStatement,
} from "@/lib/hr/interim-billing";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export type AgencyRow = {
  id: string;
  code: string;
  name: string;
  nif: string | null;
  nis: string | null;
  rc: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  contact_name: string | null;
  default_daily_rate: number;
  markup_pct: number;
  vat_pct: number;
  is_active: boolean;
  notes: string | null;
  workers: number;
};

export type InterimStatementRow = {
  id: string;
  statement_no: string;
  agency_id: string;
  agency_name: string;
  period_year: number;
  period_month: number;
  site_id: string | null;
  site_name: string | null;
  lines: InterimLine[];
  days_total: number;
  amount_ht: number;
  markup_pct: number;
  vat_pct: number;
  amount_vat: number;
  amount_ttc: number;
  status_code: "ISSUED" | "RECONCILED" | "CANCELLED";
  agency_invoice_ref: string | null;
  agency_invoice_amount: number | null;
  reconciled_at: string | null;
  cancelled_reason: string | null;
  created_at: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

function revalidateInterim() {
  revalidatePath("/rh/interim");
}

export async function listAgencies(): Promise<ActionResult<AgencyRow[]>> {
  const supabase = await createClient();
  const [agencies, contracts] = await Promise.all([
    supabase.from("hr_interim_agencies").select("*").order("name"),
    supabase.from("hr_contracts").select("agency_id").eq("contract_type_code", "INTERIM").in("status", ["DRAFT", "ACTIVE"]),
  ]);
  if (agencies.error) return { ok: false, error: agencies.error.message };
  const counts = new Map<string, number>();
  for (const c of contracts.data ?? []) if (c.agency_id) counts.set(c.agency_id, (counts.get(c.agency_id) ?? 0) + 1);
  return {
    ok: true,
    data: (agencies.data ?? []).map((a) => ({
      ...a,
      default_daily_rate: Number(a.default_daily_rate),
      markup_pct: Number(a.markup_pct),
      vat_pct: Number(a.vat_pct),
      workers: counts.get(a.id) ?? 0,
    })),
  };
}

export async function saveAgency(input: Omit<AgencyRow, "id" | "workers"> & { id?: string }): Promise<ActionResult<{ id: string }>> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,20}$/.test(code)) return { ok: false, error: "Code : 2 à 20 caractères A-Z, 0-9, _ ou -." };
  if (!input.name.trim()) return { ok: false, error: "Raison sociale obligatoire." };
  const num = (v: number, max: number) => (Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v * 100) / 100 : null);
  const rate = num(Number(input.default_daily_rate), 10_000_000);
  const markup = num(Number(input.markup_pct), 100);
  const vat = num(Number(input.vat_pct), 100);
  if (rate == null || markup == null || vat == null) return { ok: false, error: "Taux, coefficient ou TVA invalide." };
  const txt = (v: string | null) => v?.trim() || null;
  const payload = {
    code,
    name: input.name.trim(),
    nif: txt(input.nif),
    nis: txt(input.nis),
    rc: txt(input.rc),
    address: txt(input.address),
    phone: txt(input.phone),
    email: txt(input.email),
    contact_name: txt(input.contact_name),
    default_daily_rate: rate,
    markup_pct: markup,
    vat_pct: vat,
    is_active: input.is_active,
    notes: txt(input.notes),
  };
  const supabase = await createClient();
  const q = input.id
    ? supabase.from("hr_interim_agencies").update(payload).eq("id", input.id)
    : supabase.from("hr_interim_agencies").insert(payload);
  const { data, error } = await q.select("id").maybeSingle();
  if (error) return { ok: false, error: error.code === "23505" ? "Ce code d'agence existe déjà." : error.message };
  if (!data) return { ok: false, error: "Enregistrement refusé." };
  revalidateInterim();
  revalidatePath("/rh/contrats");
  return { ok: true, data: { id: data.id } };
}

function periodBounds(year: number, month: number) {
  const mm = String(month).padStart(2, "0");
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, "0")}` };
}

async function computeStatement(input: { agency_id: string; year: number; month: number; site_id?: string | null }) {
  const supabase = await createClient();
  const { from, to } = periodBounds(input.year, input.month);
  const { data: agency, error: aErr } = await supabase.from("hr_interim_agencies").select("*").eq("id", input.agency_id).maybeSingle();
  if (aErr) return { ok: false as const, error: aErr.message };
  if (!agency) return { ok: false as const, error: "Agence introuvable." };
  let cq = supabase
    .from("hr_contracts")
    .select("id, employee_id, site_id, start_date, end_date, interim_daily_rate, poste_fr, employee:hr_employees ( matricule, last_name, first_name ), site:ref_sites ( name_fr )")
    .eq("contract_type_code", "INTERIM")
    .eq("agency_id", input.agency_id)
    .lte("start_date", to)
    .or(`end_date.is.null,end_date.gte.${from}`);
  if (input.site_id) cq = cq.eq("site_id", input.site_id);
  const { data: rows, error: cErr } = await cq;
  if (cErr) return { ok: false as const, error: cErr.message };
  const contracts: InterimContract[] = (rows ?? []).map((r) => {
    const emp = one(r.employee);
    return {
      contract_id: r.id,
      employee_id: r.employee_id,
      matricule: emp?.matricule ?? "",
      employee_name: `${emp?.last_name ?? ""} ${emp?.first_name ?? ""}`.trim(),
      site_id: r.site_id,
      site_name: one(r.site)?.name_fr ?? "",
      start_date: r.start_date,
      end_date: r.end_date,
      daily_rate: r.interim_daily_rate == null ? null : Number(r.interim_daily_rate),
      poste: r.poste_fr,
    };
  });
  const empIds = [...new Set(contracts.map((c) => c.employee_id))];
  const [cells, legends] = await Promise.all([
    empIds.length
      ? supabase
          .from("hr_attendance")
          .select("employee_id, site_id, work_date, legend_code")
          .eq("status_code", "VALIDATED")
          .in("employee_id", empIds)
          .gte("work_date", from)
          .lte("work_date", to)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("ref_legendes").select("code, label_fr, label_ar, coefficient, counts_as_presence"),
  ]);
  if (cells.error) return { ok: false as const, error: cells.error.message };
  const terms = {
    default_daily_rate: Number(agency.default_daily_rate),
    markup_pct: Number(agency.markup_pct),
    vat_pct: Number(agency.vat_pct),
  };
  const statement = buildInterimStatement({
    contracts,
    cells: cells.data ?? [],
    legends: (legends.data ?? []).map((l) => ({ ...l, coefficient: Number(l.coefficient), counts_as_presence: Boolean(l.counts_as_presence) })),
    terms,
  });
  return { ok: true as const, agency, terms, statement, contracts: contracts.length };
}

export async function previewInterimStatement(input: {
  agency_id: string;
  year: number;
  month: number;
  site_id?: string | null;
}): Promise<ActionResult<InterimStatement & { contracts: number }>> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  if (!UUID_RE.test(input.agency_id)) return { ok: false, error: "Agence invalide." };
  const r = await computeStatement(input);
  if (!r.ok) return r;
  return { ok: true, data: { ...r.statement, contracts: r.contracts } };
}

export async function issueInterimStatement(input: {
  agency_id: string;
  year: number;
  month: number;
  site_id?: string | null;
}): Promise<ActionResult<{ id: string; statement_no: string }>> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  if (!UUID_RE.test(input.agency_id)) return { ok: false, error: "Agence invalide." };
  const r = await computeStatement(input);
  if (!r.ok) return r;
  if (!r.statement.lines.length) return { ok: false, error: "Aucune présence validée à facturer pour cette agence." };
  if (r.statement.missingRate.length) {
    return { ok: false, error: `Taux journalier manquant : ${r.statement.missingRate.join(", ")}.` };
  }
  const supabase = await createClient();
  const { data: no, error: numErr } = await supabase.rpc("hr_next_doc_number", { p_prefix: "ITM" });
  if (numErr || typeof no !== "string") return { ok: false, error: numErr?.message ?? "Numérotation impossible." };
  const { data, error } = await supabase
    .from("hr_interim_statements")
    .insert({
      statement_no: no,
      agency_id: input.agency_id,
      period_year: input.year,
      period_month: input.month,
      site_id: input.site_id || null,
      lines: r.statement.lines,
      days_total: r.statement.days_total,
      amount_ht: r.statement.amount_ht,
      markup_pct: r.terms.markup_pct,
      vat_pct: r.terms.vat_pct,
      amount_vat: r.statement.amount_vat,
      amount_ttc: r.statement.amount_ttc,
    })
    .select("id")
    .single();
  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? "Un relevé actif existe déjà pour cette agence et cette période : annulez-le d'abord." : error.message,
    };
  }
  revalidateInterim();
  return { ok: true, data: { id: data.id, statement_no: no } };
}

export async function listInterimStatements(input: { year: number; month: number }): Promise<ActionResult<InterimStatementRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_interim_statements")
    .select("*, agency:hr_interim_agencies ( name ), site:ref_sites ( name_fr )")
    .eq("period_year", input.year)
    .eq("period_month", input.month)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: r.id,
      statement_no: r.statement_no,
      agency_id: r.agency_id,
      agency_name: one(r.agency)?.name ?? "",
      period_year: r.period_year,
      period_month: r.period_month,
      site_id: r.site_id,
      site_name: one(r.site)?.name_fr ?? null,
      lines: (r.lines ?? []) as InterimLine[],
      days_total: Number(r.days_total),
      amount_ht: Number(r.amount_ht),
      markup_pct: Number(r.markup_pct),
      vat_pct: Number(r.vat_pct),
      amount_vat: Number(r.amount_vat),
      amount_ttc: Number(r.amount_ttc),
      status_code: r.status_code,
      agency_invoice_ref: r.agency_invoice_ref,
      agency_invoice_amount: r.agency_invoice_amount == null ? null : Number(r.agency_invoice_amount),
      reconciled_at: r.reconciled_at,
      cancelled_reason: r.cancelled_reason,
      created_at: r.created_at,
    })),
  };
}

export async function setInterimStatementStatus(input: {
  id: string;
  status: "ISSUED" | "RECONCILED" | "CANCELLED";
  agency_invoice_ref?: string;
  agency_invoice_amount?: number | null;
  reason?: string;
}): Promise<ActionResult> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  if (!UUID_RE.test(input.id)) return { ok: false, error: "Relevé invalide." };
  const patch: Record<string, unknown> = { status_code: input.status };
  if (input.status === "RECONCILED") {
    patch.agency_invoice_ref = input.agency_invoice_ref?.trim() || null;
    patch.agency_invoice_amount = Number.isFinite(input.agency_invoice_amount) ? input.agency_invoice_amount : null;
  }
  if (input.status === "CANCELLED") patch.cancelled_reason = input.reason?.trim() || null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("hr_interim_statements").update(patch).eq("id", input.id).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Mise à jour refusée." };
  revalidateInterim();
  return { ok: true, data: undefined };
}

export async function interimStatementHtml(id: string): Promise<ActionResult<string>> {
  if (!UUID_RE.test(id)) return { ok: false, error: "Relevé invalide." };
  const supabase = await createClient();
  const { data: r, error } = await supabase
    .from("hr_interim_statements")
    .select("*, agency:hr_interim_agencies ( name, nif, rc, address )")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!r) return { ok: false, error: "Relevé introuvable." };
  const settings = await getHrBulletinSettings();
  const lines = (r.lines ?? []) as InterimLine[];
  const subtotal = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const agency = one(r.agency);
  return {
    ok: true,
    data: buildInterimStatementHtml({
      statementNo: r.statement_no,
      period: `${String(r.period_month).padStart(2, "0")}/${r.period_year}`,
      employerName: (settings.ok ? settings.data.employer_name : "") || "NEDJM FROID",
      agency: { name: agency?.name ?? "", nif: agency?.nif, rc: agency?.rc, address: agency?.address },
      terms: { default_daily_rate: 0, markup_pct: Number(r.markup_pct), vat_pct: Number(r.vat_pct) },
      statement: {
        lines,
        days_total: Number(r.days_total),
        subtotal,
        markup: Math.round((Number(r.amount_ht) - subtotal) * 100) / 100,
        amount_ht: Number(r.amount_ht),
        amount_vat: Number(r.amount_vat),
        amount_ttc: Number(r.amount_ttc),
      },
    }),
  };
}
