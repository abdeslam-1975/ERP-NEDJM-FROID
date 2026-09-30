"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import {
  applicationMonthError,
  frMonth,
  isIsoDay,
  parseProposalOverview,
  ruleSourceSchema,
  verifySourceSchema,
  type RuleFamily,
  type RuleProposalView,
} from "@/lib/rules/proposals";
import { PROPOSAL_SENT, saveRuleProposal } from "@/lib/rules/proposal-rpc";
import { earliestOpen, parseChainState, type PayrollChainState } from "@/lib/hr/payroll-chains";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type RuleAccess = {
  userId: string;
  isSuperAdmin: boolean;
  canRead: boolean;
  canPropose: boolean;
  canApprove: boolean;
  canDecideApplication: boolean;
  /** Earliest month a rule may still apply from (per chain when D6 separated the reprise months). */
  firstOpenMonth: string | null;
  chain: PayrollChainState;
};

export type ZoneScopeRow = {
  id: string;
  zone_code: string;
  effective_from: string;
  effective_to: string | null;
  wilaya_codes: string[];
  scope_mode: "WILAYAS" | "GROUP";
  group_from: string | null;
  proposal_id: string;
  decision_id: string | null;
};

export type ZoneScopeCatalog = {
  zones: { code: string; label_fr: string; catalog_wilayas: string[] }[];
  wilayas: { code: string; name_fr: string }[];
  scopes: ZoneScopeRow[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = z.string().regex(UUID_RE, "Identifiant invalide.");
const monthStart = z
  .string()
  .refine((v) => isIsoDay(v) && v.endsWith("-01"), "Choisissez un mois (la règle s'applique au 1er du mois).");

function revalidateRules() {
  revalidatePath("/rh/legal");
  revalidatePath("/rh/legal/propositions");
  revalidatePath("/referentiels/irg");
  revalidatePath("/rh/paie/irg");
  revalidatePath("/decisions");
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function perm(supabase: Supabase, screen: string, action: "read" | "update") {
  const { data } = await supabase.rpc("erp_has_perm", { p_screen: screen, p_action: action });
  return data === true;
}

export async function getRuleAccess(): Promise<ActionResult<RuleAccess>> {
  const ws = await getWorkspaceProfile();
  if (!ws) return { ok: false, error: "Session requise. · يلزم تسجيل الدخول." };
  const supabase = await createClient();
  const [readP, readA, propose, approve, decide, open] = await Promise.all([
    perm(supabase, "rule_proposals", "read"),
    perm(supabase, "rule_approval", "read"),
    perm(supabase, "rule_proposals", "update"),
    perm(supabase, "rule_approval", "update"),
    supabase.rpc("sys_decision_can_decide", { p_type: "D2" }),
    supabase.rpc("hr_payroll_chain_state"),
  ]);
  const chain = parseChainState(open.data);
  return {
    ok: true,
    data: {
      userId: ws.id,
      isSuperAdmin: ws.isSuperAdmin,
      canRead: ws.isSuperAdmin || readP || readA,
      canPropose: ws.isSuperAdmin || propose,
      canApprove: ws.isSuperAdmin || approve,
      canDecideApplication: decide.data === true,
      firstOpenMonth: earliestOpen(chain),
      chain,
    },
  };
}

export async function listRuleProposals(input?: { onlyOpen?: boolean }): Promise<ActionResult<RuleProposalView[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ref_rule_proposals_overview", {
    p_only_open: input?.onlyOpen ?? true,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: parseProposalOverview(data) };
}

export async function submitRuleProposal(id: unknown): Promise<ActionResult> {
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Proposition invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("ref_rule_proposal_submit", { p_id: parsed.data });
  if (error) return { ok: false, error: error.message };
  revalidateRules();
  return { ok: true, data: undefined };
}

const reasonSchema = z.object({
  id: uuid,
  text: z.string().trim(),
});

export async function withdrawRuleProposal(input: unknown): Promise<ActionResult> {
  const parsed = reasonSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Données invalides." };
  if (parsed.data.text.length < 5) return { ok: false, error: "Motif du retrait requis (5 caractères min.)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("ref_rule_proposal_withdraw", {
    p_id: parsed.data.id,
    p_reason: parsed.data.text,
  });
  if (error) return { ok: false, error: error.message };
  revalidateRules();
  return { ok: true, data: undefined };
}

export async function rejectRuleProposal(input: unknown): Promise<ActionResult> {
  const parsed = reasonSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Données invalides." };
  if (parsed.data.text.length < 10) return { ok: false, error: "Motif du rejet requis (10 caractères min.)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("ref_rule_proposal_reject", {
    p_id: parsed.data.id,
    p_note: parsed.data.text,
  });
  if (error) return { ok: false, error: error.message };
  revalidateRules();
  return { ok: true, data: undefined };
}

export type ApproveOutcome = {
  status: "APPROVED" | "APPLIED";
  self_approved: boolean;
  decision_id: string | null;
  month_closed: boolean;
};

export async function approveRuleProposal(input: unknown): Promise<ActionResult<ApproveOutcome>> {
  const parsed = z.object({ id: uuid, note: z.string().trim().max(1000).optional().default("") }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Données invalides." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ref_rule_proposal_approve", {
    p_id: parsed.data.id,
    p_note: parsed.data.note || null,
  });
  revalidateRules();
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) {
    return {
      ok: false,
      error:
        "La valeur a changé depuis la demande de vérification : la proposition est caduque. Créez-en une nouvelle si nécessaire.",
    };
  }
  return {
    ok: true,
    data: {
      status: r.status === "APPLIED" ? "APPLIED" : "APPROVED",
      self_approved: r.self_approved === true,
      decision_id: typeof r.decision_id === "string" ? r.decision_id : null,
      month_closed: r.month_closed === true,
    },
  };
}

const applicationSchema = z.object({
  id: uuid,
  month: monthStart,
  date: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v == null || isIsoDay(v), "Date invalide."),
  first_open: z.string().nullable().optional(),
});

export async function requestRuleApplication(input: unknown): Promise<ActionResult<{ decision_id: string }>> {
  const parsed = applicationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  const p = parsed.data;
  const bad = applicationMonthError({ month: p.month, firstOpen: p.first_open ?? null, date: p.date });
  if (bad) return { ok: false, error: bad };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ref_rule_proposal_request_application", {
    p_id: p.id,
    p_month: p.month,
    p_date: p.date,
  });
  if (error) return { ok: false, error: error.message };
  revalidateRules();
  return { ok: true, data: { decision_id: String(data) } };
}

const verifySchema = verifySourceSchema.extend({
  family: z.enum(["LEGAL_VAR", "CNAS_RATES", "IRG_BAREME", "IRG_RULES"]),
  row_id: uuid,
  label: z.string().trim().min(1).max(160),
});

/** Existing value approved as reference, unchanged (existing values must be verified before being trusted). */
export async function requestRuleVerification(input: unknown): Promise<ActionResult<{ id: string; message: string }>> {
  const parsed = verifySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  const p = parsed.data;
  const supabase = await createClient();
  const saved = await saveRuleProposal(supabase, {
    family: p.family,
    action: "VERIFY",
    target_id: p.row_id,
    payload: {},
    title: `Vérification : ${p.label}`.slice(0, 200),
    source_ref: p.source_ref,
    text_effective_date: null,
    requested_month: null,
    submit: true,
    citations: p.citations,
  });
  if (!saved.ok) return saved;
  revalidateRules();
  return {
    ok: true,
    data: {
      id: saved.data.id,
      message: "Vérification demandée : la valeur reste inchangée ; un approbateur la confirmera comme référence.",
    },
  };
}

const irgSubmitSchema = ruleSourceSchema.extend({
  family: z.enum(["IRG_BAREME", "IRG_RULES"]),
  draft_id: uuid,
  label: z.string().trim().min(1).max(160),
  requested_month: monthStart,
});

/** IRG draft (scale or rule set) frozen and submitted; it has no effect before approval and D2. */
export async function submitIrgDraft(input: unknown): Promise<ActionResult<{ id: string; message: string }>> {
  const parsed = irgSubmitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  const p = parsed.data;
  const supabase = await createClient();
  const saved = await saveRuleProposal(supabase, {
    family: p.family,
    action: "SET",
    target_id: p.draft_id,
    payload: {},
    title: `${p.family === "IRG_BAREME" ? "Barème IRG" : "Règles IRG"} ${p.label} à partir de ${frMonth(p.requested_month)}`.slice(
      0,
      200,
    ),
    source_ref: p.source_ref,
    text_effective_date: p.text_effective_date,
    requested_month: p.requested_month,
    submit: true,
    citations: p.citations,
  });
  if (!saved.ok) return saved;
  revalidateRules();
  return { ok: true, data: { id: saved.data.id, message: PROPOSAL_SENT } };
}

export async function listZoneScopes(): Promise<ActionResult<ZoneScopeCatalog>> {
  const supabase = await createClient();
  const [catalog, wilayas, scopes] = await Promise.all([
    supabase
      .from("hr_catalogs")
      .select("kind, code, label_fr, extra, is_active, sort_order")
      .in("kind", ["irg_zone", "irg_zone_wilaya"])
      .order("sort_order"),
    supabase.from("ref_wilayas").select("code, name_fr").order("sort_order"),
    supabase
      .from("ref_irg_zone_scopes")
      .select("id, zone_code, effective_from, effective_to, wilaya_codes, scope_mode, group_from, proposal_id, decision_id")
      .order("effective_from", { ascending: false }),
  ]);
  const failed = [catalog, wilayas, scopes].find((r) => r.error);
  if (failed?.error) return { ok: false, error: failed.error.message };
  const items = (catalog.data ?? []) as {
    kind: string;
    code: string;
    label_fr: string;
    extra: Record<string, unknown> | null;
    is_active: boolean;
  }[];
  return {
    ok: true,
    data: {
      zones: items
        .filter((i) => i.kind === "irg_zone" && i.is_active)
        .map((z) => ({
          code: z.code,
          label_fr: z.label_fr,
          catalog_wilayas: items
            .filter((w) => w.kind === "irg_zone_wilaya" && w.is_active && w.extra?.zone === z.code)
            .map((w) => w.label_fr),
        })),
      wilayas: (wilayas.data ?? []).map((w) => ({ code: String(w.code), name_fr: String(w.name_fr) })),
      scopes: ((scopes.data ?? []) as Record<string, unknown>[]).map((s) => ({
        id: String(s.id),
        zone_code: String(s.zone_code),
        effective_from: String(s.effective_from).slice(0, 10),
        effective_to: s.effective_to ? String(s.effective_to).slice(0, 10) : null,
        wilaya_codes: Array.isArray(s.wilaya_codes) ? s.wilaya_codes.map(String) : [],
        scope_mode: s.scope_mode === "GROUP" ? "GROUP" : "WILAYAS",
        group_from: typeof s.group_from === "string" ? s.group_from : null,
        proposal_id: String(s.proposal_id),
        decision_id: typeof s.decision_id === "string" ? s.decision_id : null,
      })),
    },
  };
}

const zoneSchema = ruleSourceSchema.extend({
  zone_code: z.string().trim().min(1).max(40),
  mode: z.enum(["WILAYAS", "GROUP"]),
  group_from: z.string().trim().max(40).optional().nullable(),
  wilayas: z.array(z.string().regex(/^\d{2}$/, "Wilaya invalide.")).min(1, "Sélectionnez au moins une wilaya."),
  requested_month: monthStart,
});

/** D16: dated list of wilayas of an IRG zone, legal content, so a proposal. */
export async function proposeZoneScope(input: unknown): Promise<ActionResult<{ id: string; message: string }>> {
  const parsed = zoneSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  const p = parsed.data;
  if (p.mode === "GROUP" && !p.group_from) return { ok: false, error: "Indiquez le groupement repris." };
  const supabase = await createClient();
  const saved = await saveRuleProposal(supabase, {
    family: "IRG_ZONE_SCOPE" satisfies RuleFamily,
    action: "SET",
    target_id: null,
    target_key: p.zone_code,
    payload: { mode: p.mode, group_from: p.mode === "GROUP" ? p.group_from : null, wilayas: [...new Set(p.wilayas)].sort() },
    title: `Zone IRG ${p.zone_code} : ${new Set(p.wilayas).size} wilaya(s) à partir de ${frMonth(p.requested_month)}`,
    source_ref: p.source_ref,
    text_effective_date: p.text_effective_date,
    requested_month: p.requested_month,
    submit: true,
    citations: p.citations,
  });
  if (!saved.ok) return saved;
  revalidateRules();
  return { ok: true, data: { id: saved.data.id, message: PROPOSAL_SENT } };
}
