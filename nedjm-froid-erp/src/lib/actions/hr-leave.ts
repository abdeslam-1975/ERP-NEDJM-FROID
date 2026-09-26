"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireHrSalaryValues } from "@/lib/auth/require-roles";
import { createClient } from "@/lib/supabase/server";
import { refreshDraftPayroll } from "@/lib/actions/hr-ops";
import { legalVarsAsOf } from "@/lib/hr/legal-vars-as-of";
import {
  calendarDays,
  computeLeaveBalance,
  type LeaveBalance,
  type LeaveKind,
  type LeaveStatus,
} from "@/lib/hr/leave";
import { todayIsoAlgiers } from "@/lib/hr/mission-order";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type LeaveEmployee = {
  id: string;
  matricule: string;
  label: string;
  employment_status: string;
};

export type LeaveRequestRow = {
  id: string;
  employee_id: string;
  employee_label: string;
  kind: LeaveKind;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  cnas_ref: string | null;
  status: LeaveStatus;
  decided_at: string | null;
  decision_note: string | null;
  decided_by_name: string | null;
  requested_by_name: string | null;
  correspondence_id: string | null;
  correspondence_number: string | null;
  created_at: string;
};

export type LeaveAdjustmentRow = {
  id: string;
  employee_id: string;
  employee_label: string;
  days: number;
  as_of: string;
  reason: string;
  author_name: string | null;
};

export type LeaveBalanceRow = LeaveBalance & { employee_label: string; rate: number };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const requestSchema = z
  .object({
    employee_id: z.string().uuid("Employé requis · اختر العامل"),
    kind: z.enum(["ANNUAL", "RECOVERY", "SICK", "UNPAID", "EXCEPTIONAL"]),
    start_date: z.string().regex(DATE, "Date de début invalide"),
    end_date: z.string().regex(DATE, "Date de fin invalide"),
    days: z.coerce.number().min(0).max(366).optional(),
    reason: z.string().trim().max(500).optional().nullable(),
    cnas_ref: z.string().trim().max(80).optional().nullable(),
  })
  .refine((v) => v.end_date >= v.start_date, {
    message: "La fin précède le début. · تاريخ النهاية قبل البداية",
    path: ["end_date"],
  });

const adjustmentSchema = z.object({
  employee_id: z.string().uuid("Employé requis · اختر العامل"),
  days: z.coerce
    .number()
    .refine((v) => v !== 0, "Nombre de jours non nul · عدد الأيام مطلوب")
    .refine((v) => Math.abs(v) <= 400, "Valeur hors limites"),
  as_of: z.string().regex(DATE, "Date invalide"),
  reason: z.string().trim().min(3, "Motif requis (3 caractères min.) · السبب مطلوب"),
});

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function empLabel(e: { matricule?: string | null; last_name?: string | null; first_name?: string | null } | null) {
  return `${e?.matricule ?? ""} · ${e?.last_name ?? ""} ${e?.first_name ?? ""}`.trim();
}

function revalidateLeave() {
  revalidatePath("/rh/conges");
  revalidatePath("/rh/presence");
  revalidatePath("/rh/documents");
  revalidatePath("/rh/paie");
}

export async function listLeaveEmployees(): Promise<ActionResult<LeaveEmployee[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_employees")
    .select("id, matricule, last_name, first_name, employment_status")
    .order("matricule");
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((e) => ({
      id: e.id,
      matricule: e.matricule ?? "",
      label: empLabel(e),
      employment_status: e.employment_status ?? "ACTIVE",
    })),
  };
}

export async function listLeaveRequests(): Promise<ActionResult<LeaveRequestRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_leave_requests")
    .select(
      `id, employee_id, kind, start_date, end_date, days, reason, cnas_ref, status, decided_at, decision_note,
       correspondence_id, created_at,
       employee:hr_employees ( matricule, last_name, first_name ),
       decider:sys_users!decided_by ( full_name ),
       requester:sys_users!requested_by ( full_name ),
       corr:hr_correspondences ( number )`,
    )
    .order("start_date", { ascending: false })
    .limit(1000);
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: r.id,
      employee_id: r.employee_id,
      employee_label: empLabel(one(r.employee)),
      kind: r.kind as LeaveKind,
      start_date: String(r.start_date).slice(0, 10),
      end_date: String(r.end_date).slice(0, 10),
      days: Number(r.days),
      reason: r.reason,
      cnas_ref: r.cnas_ref,
      status: r.status as LeaveStatus,
      decided_at: r.decided_at,
      decision_note: r.decision_note,
      decided_by_name: one(r.decider)?.full_name ?? null,
      requested_by_name: one(r.requester)?.full_name ?? null,
      correspondence_id: r.correspondence_id,
      correspondence_number: one(r.corr)?.number ?? null,
      created_at: r.created_at,
    })),
  };
}

export async function createLeaveRequest(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const p = parsed.data;
  const days = p.days && p.days > 0 ? p.days : calendarDays(p.start_date, p.end_date);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: overlap, error: oErr } = await supabase
    .from("hr_leave_requests")
    .select("id")
    .eq("employee_id", p.employee_id)
    .in("status", ["SUBMITTED", "APPROVED"])
    .lte("start_date", p.end_date)
    .gte("end_date", p.start_date)
    .limit(1);
  if (oErr) return { ok: false, error: oErr.message };
  if (overlap?.length) {
    return { ok: false, error: "Chevauchement avec une autre demande. · تداخل مع طلب آخر" };
  }
  const { data, error } = await supabase
    .from("hr_leave_requests")
    .insert({
      employee_id: p.employee_id,
      kind: p.kind,
      start_date: p.start_date,
      end_date: p.end_date,
      days,
      reason: p.reason || null,
      cnas_ref: p.cnas_ref || null,
      status: "SUBMITTED",
      requested_by: user?.id ?? null,
    })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Enregistrement refusé (droits)." };
  revalidateLeave();
  return { ok: true, data: { id: data.id } };
}

export async function decideLeaveRequest(input: {
  id: string;
  status: "APPROVED" | "REJECTED" | "CANCELLED";
  note?: string | null;
}): Promise<ActionResult<{ correspondence_id: string | null }>> {
  if (!["APPROVED", "REJECTED", "CANCELLED"].includes(input.status)) {
    return { ok: false, error: "Statut invalide" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_leave_decide", {
    p_id: input.id,
    p_status: input.status,
    p_note: input.note?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  const { data: row } = await supabase
    .from("hr_leave_requests")
    .select("employee_id, start_date")
    .eq("id", input.id)
    .maybeSingle();
  if (row && input.status !== "REJECTED") {
    const d = String(row.start_date);
    await refreshDraftPayroll({
      employeeId: row.employee_id,
      year: Number(d.slice(0, 4)),
      month: Number(d.slice(5, 7)),
    });
  }
  revalidateLeave();
  return { ok: true, data: { correspondence_id: (data as string | null) ?? null } };
}

export async function listLeaveAdjustments(): Promise<ActionResult<LeaveAdjustmentRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_leave_adjustments")
    .select(
      `id, employee_id, days, as_of, reason,
       employee:hr_employees ( matricule, last_name, first_name ),
       author:sys_users!created_by ( full_name )`,
    )
    .order("as_of", { ascending: false })
    .limit(1000);
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: r.id,
      employee_id: r.employee_id,
      employee_label: empLabel(one(r.employee)),
      days: Number(r.days),
      as_of: String(r.as_of).slice(0, 10),
      reason: r.reason,
      author_name: one(r.author)?.full_name ?? null,
    })),
  };
}

export async function createLeaveAdjustment(input: unknown): Promise<ActionResult<{ id: string }>> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  const parsed = adjustmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("hr_leave_adjustments")
    .insert({ ...parsed.data, created_by: user?.id ?? null })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Enregistrement refusé (droits)." };
  revalidateLeave();
  return { ok: true, data: { id: data.id } };
}

export async function deleteLeaveAdjustment(id: string): Promise<ActionResult> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const { data, error } = await supabase.from("hr_leave_adjustments").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Suppression refusée." };
  revalidateLeave();
  return { ok: true, data: undefined };
}

/** Annual leave balances at `asOf` (default today) for every employee, or one. */
export async function listLeaveBalances(opts?: {
  asOf?: string;
  employeeId?: string;
}): Promise<ActionResult<LeaveBalanceRow[]>> {
  const asOf = opts?.asOf && DATE.test(opts.asOf) ? opts.asOf : todayIsoAlgiers();
  const supabase = await createClient();
  let empQ = supabase.from("hr_employees").select("id, matricule, last_name, first_name").order("matricule");
  let ctrQ = supabase.from("hr_contracts").select("employee_id, start_date, end_date, affectation_principale, status");
  let reqQ = supabase.from("hr_leave_requests").select("employee_id, kind, status, days").lte("start_date", asOf);
  let adjQ = supabase.from("hr_leave_adjustments").select("employee_id, days").lte("as_of", asOf);
  if (opts?.employeeId) {
    empQ = empQ.eq("id", opts.employeeId);
    ctrQ = ctrQ.eq("employee_id", opts.employeeId);
    reqQ = reqQ.eq("employee_id", opts.employeeId);
    adjQ = adjQ.eq("employee_id", opts.employeeId);
  }
  const [emps, ctrs, reqs, adjs, vars] = await Promise.all([empQ, ctrQ, reqQ, adjQ, legalVarsAsOf(supabase, asOf)]);
  for (const r of [emps, ctrs, reqs, adjs]) {
    if (r.error) return { ok: false, error: r.error.message };
  }
  const rate = vars.CONGE_JOURS_MOIS ?? 2.5;
  const contracts = (ctrs.data ?? [])
    .filter((c) => c.status !== "DRAFT" && c.status !== "CANCELLED")
    .map((c) => ({
      employee_id: c.employee_id,
      start_date: String(c.start_date).slice(0, 10),
      end_date: c.end_date ? String(c.end_date).slice(0, 10) : null,
      affectation_principale: c.affectation_principale,
    }));
  const requests = (reqs.data ?? []).map((r) => ({ ...r, days: Number(r.days) }));
  const adjustments = (adjs.data ?? []).map((a) => ({ ...a, days: Number(a.days) }));
  return {
    ok: true,
    data: (emps.data ?? []).map((e) => ({
      ...computeLeaveBalance({ employeeId: e.id, contracts, requests, adjustments, asOf, ratePerMonth: rate }),
      employee_label: empLabel(e),
      rate,
    })),
  };
}
