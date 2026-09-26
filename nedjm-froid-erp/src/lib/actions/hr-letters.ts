"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getHrEmployeeFiche } from "@/lib/actions/hr-employees";
import { getHrFicheSettings } from "@/lib/actions/hr-fiche";
import { upsertHrCorrespondence } from "@/lib/actions/hr-documents";
import { listLeaveBalances } from "@/lib/actions/hr-leave";
import {
  emptyLetterValues,
  normalizeLetterValues,
  type LetterKind,
  type LetterLang,
  type LetterValues,
} from "@/lib/hr/hr-letters";
import { leaveKindLabel, normalizeSettlementLines, returnDate } from "@/lib/hr/leave";
import { pickMissionContract, todayIsoAlgiers, type MissionContractHint } from "@/lib/hr/mission-order";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type LetterContext = {
  values: LetterValues;
  /** Configured letterhead (relative or absolute); the client resolves it against its origin. */
  letterhead_url: string | null;
  /** Saved correspondence when reprinting. */
  correspondence_id: string | null;
};

const KINDS = ["ATTEST", "CERTIF", "STC", "MED1", "MED2", "LEAVE"] as const;

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function baseValues(
  supabase: Supabase,
  employeeId: string,
  kind: LetterKind,
  lang: LetterLang,
): Promise<ActionResult<LetterValues>> {
  const fiche = await getHrEmployeeFiche(employeeId);
  if (!fiche.ok) return fiche;
  const e = fiche.data;
  const { data: contracts, error } = await supabase
    .from("hr_contracts")
    .select("employee_id, site_id, poste_fr, poste_ar, affectation_principale, status, start_date, end_date")
    .eq("employee_id", employeeId);
  if (error) return { ok: false, error: error.message };
  const rows = (contracts ?? []) as (MissionContractHint & { end_date: string | null })[];
  const current = pickMissionContract(rows, employeeId);
  const firstStart = rows
    .map((c) => String(c.start_date).slice(0, 10))
    .sort()[0];
  const attr = (key: string) => {
    const v = e.attrs?.[key];
    return typeof v === "string" ? v.trim() : "";
  };
  const v = emptyLetterValues(kind, lang);
  return {
    ok: true,
    data: {
      ...v,
      sex: e.sex_code === "F" ? "F" : "M",
      nom_fr: `${e.last_name ?? ""} ${e.first_name ?? ""}`.trim().toUpperCase(),
      nom_ar: `${e.last_name_ar ?? ""} ${e.first_name_ar ?? ""}`.trim(),
      matricule: e.matricule ?? "",
      birth_date: e.birth_date ? String(e.birth_date).slice(0, 10) : "",
      birth_place_fr: e.birth_place_fr ?? "",
      birth_place_ar: e.birth_place_ar ?? "",
      address_fr: e.address_fr ?? "",
      address_ar: e.address_ar ?? "",
      poste_fr: current?.poste_fr || attr("poste"),
      poste_ar: current?.poste_ar || "",
      start_date: firstStart ?? "",
      end_date: current && "end_date" in current && current.end_date ? String(current.end_date).slice(0, 10) : "",
      date_doc: todayIsoAlgiers(),
    },
  };
}

/** Pre-filled values for a new letter (or the saved ones when `correspondenceId` is given). */
export async function getLetterContext(input: {
  employee_id: string;
  kind: LetterKind;
  lang?: LetterLang;
  leave_request_id?: string | null;
  correspondence_id?: string | null;
}): Promise<ActionResult<LetterContext>> {
  if (!z.string().uuid().safeParse(input.employee_id).success) return { ok: false, error: "Employé invalide." };
  if (!KINDS.includes(input.kind)) return { ok: false, error: "Type de document invalide." };
  const lang = input.lang === "ar" ? "ar" : "fr";
  const supabase = await createClient();
  const settings = await getHrFicheSettings();
  const letterhead_url = settings.ok ? settings.data.letterhead_url : null;

  if (input.correspondence_id && input.kind !== "LEAVE") {
    const { data, error } = await supabase
      .from("hr_correspondences")
      .select("id, number, payload")
      .eq("id", input.correspondence_id)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (data) {
      const payload = (data.payload ?? {}) as Record<string, unknown>;
      const values = normalizeLetterValues(payload.letter, input.kind);
      return {
        ok: true,
        data: { values: { ...values, numero: data.number }, letterhead_url, correspondence_id: data.id },
      };
    }
  }

  const base = await baseValues(supabase, input.employee_id, input.kind, lang);
  if (!base.ok) return base;
  const v = base.data;

  if (input.kind === "CERTIF" || input.kind === "STC") {
    const { data: exit } = await supabase
      .from("hr_employee_exits")
      .select("exit_date, settlement_lines")
      .eq("employee_id", input.employee_id)
      .in("status", ["VALIDATED", "DRAFT"])
      .order("exit_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (exit) {
      v.end_date = String(exit.exit_date).slice(0, 10);
      if (input.kind === "STC") {
        v.lines = normalizeSettlementLines(exit.settlement_lines).map((l) => ({
          label_fr: l.label_fr,
          label_ar: l.label_ar,
          amount: l.amount,
        }));
        const y = Number(v.end_date.slice(0, 4));
        const m = Number(v.end_date.slice(5, 7));
        const { data: slips } = await supabase
          .from("hr_payroll_slips")
          .select("net_payable, run:hr_payroll_runs!inner ( period_year, period_month )")
          .eq("employee_id", input.employee_id)
          .eq("run.period_year", y)
          .eq("run.period_month", m);
        const net = (slips ?? []).reduce((s, r) => s + Number(r.net_payable ?? 0), 0);
        const total = net || v.lines.reduce((s, l) => s + l.amount, 0);
        v.amount = total ? total.toFixed(2) : "";
      }
    }
  }

  if (input.kind === "MED2") {
    const { data: med1 } = await supabase
      .from("hr_correspondences")
      .select("number, created_at, start_date")
      .eq("employee_id", input.employee_id)
      .eq("type_code", "MED1")
      .neq("status_code", "CANCELLED")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (med1) {
      v.ref_numero = med1.number;
      v.ref_date = String(med1.created_at).slice(0, 10);
      v.absence_since = med1.start_date ? String(med1.start_date).slice(0, 10) : "";
    }
  }

  let correspondence_id: string | null = null;
  if (input.kind === "LEAVE") {
    if (!input.leave_request_id) return { ok: false, error: "Demande de congé requise." };
    const { data: req, error } = await supabase
      .from("hr_leave_requests")
      .select("kind, start_date, end_date, days, status, correspondence_id, corr:hr_correspondences ( number )")
      .eq("id", input.leave_request_id)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!req) return { ok: false, error: "Demande introuvable." };
    if (req.status !== "APPROVED") {
      return { ok: false, error: "Seul un congé approuvé peut être imprimé. · يجب اعتماد العطلة أولاً" };
    }
    const corr = Array.isArray(req.corr) ? req.corr[0] : req.corr;
    const kindLabel = leaveKindLabel(req.kind);
    const end = String(req.end_date).slice(0, 10);
    v.numero = corr?.number ?? "";
    v.leave_kind_fr = kindLabel.fr;
    v.leave_kind_ar = kindLabel.ar;
    v.leave_from = String(req.start_date).slice(0, 10);
    v.leave_to = end;
    v.leave_days = String(Number(req.days));
    v.leave_return = returnDate(end);
    if (req.kind === "ANNUAL") {
      const bal = await listLeaveBalances({ employeeId: input.employee_id, asOf: end });
      if (bal.ok && bal.data[0]) v.leave_balance = String(bal.data[0].balance);
    }
    correspondence_id = req.correspondence_id;
  }

  return { ok: true, data: { values: v, letterhead_url, correspondence_id } };
}

const linesSchema = z
  .array(z.object({ label_fr: z.string().max(200), label_ar: z.string().max(200), amount: z.number() }))
  .max(30);

const valuesSchema = z
  .object({
    kind: z.enum(KINDS),
    lang: z.enum(["fr", "ar"]),
    lines: linesSchema,
    body: z.string().max(8000),
  })
  .catchall(z.union([z.string().max(600), z.number(), z.array(z.unknown())]));

/** Numbers and archives the letter as an ISSUED correspondence (titre de congé keeps the leave number). */
export async function issueLetter(input: {
  employee_id: string;
  values: unknown;
  correspondence_id?: string | null;
}): Promise<ActionResult<{ id: string | null; numero: string }>> {
  if (!z.string().uuid().safeParse(input.employee_id).success) return { ok: false, error: "Employé invalide." };
  const parsed = valuesSchema.safeParse(input.values);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const values = normalizeLetterValues(parsed.data, parsed.data.kind);
  if (values.kind === "LEAVE") {
    return { ok: true, data: { id: input.correspondence_id ?? null, numero: values.numero } };
  }
  const isMed = values.kind === "MED1" || values.kind === "MED2";
  const saved = await upsertHrCorrespondence({
    id: input.correspondence_id || undefined,
    employee_id: input.employee_id,
    type_code: values.kind,
    status_code: "ISSUED",
    start_date: isMed ? values.absence_since || null : values.start_date || null,
    end_date: values.kind === "ATTEST" || isMed ? null : values.end_date || null,
    payload: { letter: { ...values, numero: "" } },
  });
  if (!saved.ok) return saved;
  revalidatePath("/rh/documents");
  revalidatePath("/rh/attestations");
  return { ok: true, data: { id: saved.data.id, numero: saved.data.number } };
}

export type LetterHistoryRow = {
  id: string;
  number: string;
  type_code: string;
  employee_id: string;
  employee_label: string;
  created_at: string;
  lang: string;
};

export async function listLetters(): Promise<ActionResult<LetterHistoryRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_correspondences")
    .select("id, number, type_code, employee_id, created_at, payload, employee:hr_employees ( matricule, last_name, first_name )")
    .in("type_code", ["ATTEST", "CERTIF", "STC", "MED1", "MED2"])
    .neq("status_code", "CANCELLED")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((r) => {
      const emp = Array.isArray(r.employee) ? r.employee[0] : r.employee;
      const letter = ((r.payload ?? {}) as Record<string, unknown>).letter as Record<string, unknown> | undefined;
      return {
        id: r.id,
        number: r.number,
        type_code: r.type_code,
        employee_id: r.employee_id,
        employee_label: `${emp?.matricule ?? ""} · ${emp?.last_name ?? ""} ${emp?.first_name ?? ""}`.trim(),
        created_at: r.created_at,
        lang: letter?.lang === "ar" ? "ar" : "fr",
      };
    }),
  };
}
