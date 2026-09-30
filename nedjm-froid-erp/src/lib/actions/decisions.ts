"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { executePayrollDecision } from "@/lib/actions/hr-ops";
import {
  decideBlocker,
  parseDecisionOptions,
  validateJustification,
  type DecisionOption,
} from "@/lib/decisions/catalog";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = z.string().regex(UUID_RE, "Identifiant invalide.");

type NameJoin = { full_name: string | null } | { full_name: string | null }[] | null;

function nameOf(v: NameJoin): string | null {
  const row = Array.isArray(v) ? v[0] : v;
  return row?.full_name ?? null;
}

function record(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export type DecisionListRow = {
  id: string;
  type_code: string;
  type_label: string;
  status: string;
  period_year: number | null;
  period_month: number | null;
  site_name: string | null;
  request_source: string;
  requested_at: string;
  requested_by_name: string | null;
  decided_at: string | null;
  decided_by_name: string | null;
  chosen_label: string | null;
  closed_reason: string | null;
};

export type DecisionChange = {
  source: string;
  detail: string | null;
  employee: string | null;
  changed_at: string;
};

export type DecisionDetail = DecisionListRow & {
  type_description: string;
  risk_class: "ORDINARY" | "RISKY";
  options: DecisionOption[];
  fingerprint: string;
  period_nature: string | null;
  slip_count: number | null;
  /** D4: validated attendance entries of the month at request time. */
  attendance_days: number | null;
  whole_run: boolean;
  changes: DecisionChange[];
  chosen_option: string | null;
  justification: string | null;
  risk_acknowledged: boolean;
  executed_at: string | null;
  executed_by_name: string | null;
  execution_result: Record<string, unknown> | null;
  closed_at: string | null;
  /** Null when the current user may decide; otherwise the reason shown instead of the form. */
  decide_blocker: string | null;
  can_execute: boolean;
};

const LIST_SELECT = `id, type_code, status, period_year, period_month, context, request_source, requested_at,
  requested_by, decided_at, chosen_option, options, closed_reason,
  type:sys_decision_types ( label_fr, description_fr, risk_class ),
  requester:sys_users!requested_by ( full_name ),
  decider:sys_users!decided_by ( full_name )`;

type DecisionTypeJoin = { label_fr: string; description_fr: string; risk_class: string };

type RawDecision = {
  id: string;
  type_code: string;
  status: string;
  period_year: number | null;
  period_month: number | null;
  context: unknown;
  request_source: string;
  requested_at: string;
  requested_by: string | null;
  decided_at: string | null;
  chosen_option: string | null;
  options: unknown;
  closed_reason: string | null;
  type: DecisionTypeJoin | DecisionTypeJoin[] | null;
  requester: NameJoin;
  decider: NameJoin;
};

function toListRow(r: RawDecision): DecisionListRow {
  const type = Array.isArray(r.type) ? r.type[0] : r.type;
  const ctx = record(r.context);
  const chosen = parseDecisionOptions(r.options).find((o) => o.code === r.chosen_option);
  return {
    id: r.id,
    type_code: r.type_code,
    type_label: type?.label_fr ?? r.type_code,
    status: r.status,
    period_year: r.period_year,
    period_month: r.period_month,
    site_name: typeof ctx.site_name === "string" ? ctx.site_name : null,
    request_source: r.request_source,
    requested_at: r.requested_at,
    requested_by_name: nameOf(r.requester),
    decided_at: r.decided_at,
    decided_by_name: nameOf(r.decider),
    chosen_label: chosen?.label_fr ?? r.chosen_option,
    closed_reason: r.closed_reason,
  };
}

const listSchema = z.object({
  tab: z.enum(["open", "closed"]).default("open"),
  type: z.enum(["D3", "D4"]).optional(),
});

export async function listDecisions(input: unknown): Promise<ActionResult<DecisionListRow[]>> {
  const parsed = listSchema.safeParse(input ?? {});
  if (!parsed.success) return { ok: false, error: "Filtre invalide." };
  const supabase = await createClient();
  let q = supabase
    .from("sys_decisions")
    .select(LIST_SELECT)
    .in("status", parsed.data.tab === "open" ? ["PENDING", "DECIDED"] : ["EXECUTED", "INVALIDATED", "SUPERSEDED"])
    .order("requested_at", { ascending: false })
    .limit(200);
  if (parsed.data.type) q = q.eq("type_code", parsed.data.type);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: ((data ?? []) as unknown as RawDecision[]).map(toListRow) };
}

export async function getDecision(id: string): Promise<ActionResult<DecisionDetail>> {
  if (!UUID_RE.test(id)) return { ok: false, error: "Décision introuvable." };
  const ws = await getWorkspaceProfile();
  if (!ws) return { ok: false, error: "Session requise. · يلزم تسجيل الدخول." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sys_decisions")
    .select(
      `${LIST_SELECT}, scope, fingerprint, justification, risk_acknowledged, decided_by, executed_at,
       execution_result, closed_at,
       executor:sys_users!executed_by ( full_name )`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Décision introuvable ou non visible avec vos droits." };
  const raw = data as unknown as RawDecision & {
    scope: unknown;
    fingerprint: string;
    justification: string | null;
    risk_acknowledged: boolean;
    decided_by: string | null;
    executed_at: string | null;
    execution_result: unknown;
    closed_at: string | null;
    executor: NameJoin;
  };
  const { data: canDecide, error: rightErr } = await supabase.rpc("sys_decision_can_decide", {
    p_type: raw.type_code,
  });
  if (rightErr) return { ok: false, error: rightErr.message };

  const fullType = Array.isArray(raw.type) ? raw.type[0] : raw.type;
  const ctx = record(raw.context);
  const scope = record(raw.scope);
  const options = parseDecisionOptions(raw.options);
  const chosen = options.find((o) => o.code === raw.chosen_option);
  const changes: DecisionChange[] = Array.isArray(ctx.changes)
    ? ctx.changes.map((c) => {
        const x = record(c);
        return {
          source: String(x.source ?? ""),
          detail: typeof x.detail === "string" ? x.detail : null,
          employee: typeof x.employee === "string" ? x.employee : null,
          changed_at: String(x.changed_at ?? ""),
        };
      })
    : [];
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

  return {
    ok: true,
    data: {
      ...toListRow(raw),
      type_description: fullType?.description_fr ?? "",
      risk_class: fullType?.risk_class === "RISKY" ? "RISKY" : "ORDINARY",
      options,
      fingerprint: raw.fingerprint,
      period_nature: typeof ctx.period_nature === "string" ? ctx.period_nature : null,
      slip_count: num(ctx.slip_count),
      attendance_days: num(ctx.attendance_days),
      whole_run: scope.whole_run === true,
      changes,
      chosen_option: raw.chosen_option,
      justification: raw.justification,
      risk_acknowledged: raw.risk_acknowledged,
      executed_at: raw.executed_at,
      executed_by_name: nameOf(raw.executor),
      execution_result: raw.execution_result ? record(raw.execution_result) : null,
      closed_at: raw.closed_at,
      decide_blocker: decideBlocker({
        status: raw.status,
        isSuperAdmin: ws.isSuperAdmin,
        hasDecisionRight: canDecide === true,
        requestedBy: raw.requested_by,
        userId: ws.id,
      }),
      can_execute:
        raw.status === "DECIDED" && chosen?.executes === true && (ws.isSuperAdmin || raw.decided_by === ws.id),
    },
  };
}

const decideSchema = z.object({
  id: uuid,
  option: z.string().min(1).max(40),
  justification: z.string(),
  fingerprint: z.string().min(1).max(100),
  risk_ack: z.boolean().default(false),
});

export type DecideOutcome = {
  status: "DECIDED" | "EXECUTED";
  executed: { count: number; warnings: string[] } | null;
  execute_error: string | null;
  invalidated: string | null;
};

export async function decideDecision(input: unknown): Promise<ActionResult<DecideOutcome>> {
  const parsed = decideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const p = parsed.data;
  const bad = validateJustification(p.justification);
  if (bad) return { ok: false, error: bad };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sys_decision_decide", {
    p_id: p.id,
    p_option: p.option,
    p_justification: p.justification,
    p_fingerprint: p.fingerprint,
    p_risk_ack: p.risk_ack,
  });
  revalidatePath("/decisions");
  revalidatePath(`/decisions/${p.id}`);
  if (error) return { ok: false, error: error.message };
  const r = record(data);
  if (r.ok !== true) {
    return {
      ok: false,
      error:
        r.reason === "CLOSED"
          ? "La situation a changé : cette demande est close (paie déjà créée ou plus en brouillon). Aucune opération n'a été faite."
          : "Les données ont changé depuis l'affichage : la demande a été mise à jour. Relisez-la avant de décider.",
    };
  }
  if (r.executes !== true) {
    revalidatePath("/rh/paie");
    return { ok: true, data: { status: "EXECUTED", executed: null, execute_error: null, invalidated: null } };
  }
  const run = await executePayrollDecision(p.id);
  revalidatePath("/rh/paie");
  if (!run.ok) {
    return {
      ok: true,
      data: { status: "DECIDED", executed: null, execute_error: run.error, invalidated: run.invalidated ?? null },
    };
  }
  return {
    ok: true,
    data: {
      status: "EXECUTED",
      executed: { count: run.data.count, warnings: run.data.warnings },
      execute_error: null,
      invalidated: null,
    },
  };
}

/** Retry of a decided operation whose execution failed (network, calculation error…). */
export async function executeDecision(
  id: string,
): Promise<ActionResult<{ count: number; warnings: string[] }> & { invalidated?: string | null }> {
  if (!UUID_RE.test(id)) return { ok: false, error: "Décision invalide." };
  const run = await executePayrollDecision(id);
  revalidatePath("/decisions");
  revalidatePath(`/decisions/${id}`);
  revalidatePath("/rh/paie");
  if (!run.ok) return run;
  return { ok: true, data: { count: run.data.count, warnings: run.data.warnings } };
}

export type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  read: boolean;
};

export async function listMyNotifications(): Promise<ActionResult<{ rows: NotificationRow[]; unread: number }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session requise." };
  const { data, error } = await supabase
    .from("sys_notifications")
    .select("id, kind, title, body, link, created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as Omit<NotificationRow, "read">[];
  const ids = rows.map((r) => r.id);
  const read = new Set<string>();
  if (ids.length) {
    const { data: reads, error: readErr } = await supabase
      .from("sys_notification_reads")
      .select("notification_id")
      .eq("user_id", user.id)
      .in("notification_id", ids);
    if (readErr) return { ok: false, error: readErr.message };
    for (const r of reads ?? []) read.add(r.notification_id as string);
  }
  const out = rows.map((r) => ({ ...r, read: read.has(r.id) }));
  return { ok: true, data: { rows: out, unread: out.filter((r) => !r.read).length } };
}

export async function markNotificationsRead(ids: unknown): Promise<ActionResult<{ count: number }>> {
  const parsed = z.array(uuid).max(100).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Notifications invalides." };
  if (!parsed.data.length) return { ok: true, data: { count: 0 } };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session requise." };
  const { error } = await supabase
    .from("sys_notification_reads")
    .upsert(
      parsed.data.map((id) => ({ notification_id: id, user_id: user.id })),
      { onConflict: "notification_id,user_id", ignoreDuplicates: true },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { count: parsed.data.length } };
}
