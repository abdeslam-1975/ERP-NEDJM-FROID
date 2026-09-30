import { z } from "zod";

export const RULE_FAMILIES = ["LEGAL_VAR", "CNAS_RATES", "IRG_BAREME", "IRG_RULES", "IRG_ZONE_SCOPE"] as const;
export type RuleFamily = (typeof RULE_FAMILIES)[number];

export const RULE_ACTIONS = ["SET", "STOP", "VERIFY"] as const;
export type RuleAction = (typeof RULE_ACTIONS)[number];

export const RULE_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "WITHDRAWN", "APPLIED", "SUPERSEDED"] as const;
export type RuleStatus = (typeof RULE_STATUSES)[number];

/** Status of an IRG scale or rule set row (lot 2). */
export type IrgRowStatus = "LEGACY" | "DRAFT" | "PROPOSED" | "APPLIED" | "REPLACED";

export const FAMILY_LABEL: Record<RuleFamily, string> = {
  LEGAL_VAR: "Taux ou variable légale",
  CNAS_RATES: "Taux d'un régime CNAS",
  IRG_BAREME: "Barème IRG",
  IRG_RULES: "Règles IRG (art. 104)",
  IRG_ZONE_SCOPE: "Portée d'une zone IRG (D16)",
};

export const ACTION_LABEL: Record<RuleAction, string> = {
  SET: "Nouvelle valeur",
  STOP: "Arrêt",
  VERIFY: "Vérification d'une valeur existante",
};

const STATUS_LABEL: Record<RuleStatus, string> = {
  DRAFT: "Brouillon",
  SUBMITTED: "Soumise, à approuver",
  APPROVED: "Approuvée, sans effet (date à décider)",
  REJECTED: "Rejetée",
  WITHDRAWN: "Retirée",
  APPLIED: "En vigueur",
  SUPERSEDED: "Caduque",
};

export function ruleStatusLabel(status: string): string {
  return STATUS_LABEL[status as RuleStatus] ?? status;
}

export function ruleStatusTone(status: string): "warning" | "brand" | "success" | "neutral" | "danger" {
  if (status === "SUBMITTED") return "warning";
  if (status === "APPROVED") return "brand";
  if (status === "APPLIED") return "success";
  if (status === "REJECTED") return "danger";
  return "neutral";
}

const IRG_ROW_LABEL: Record<IrgRowStatus, string> = {
  LEGACY: "Reprise, non vérifiée",
  DRAFT: "Brouillon",
  PROPOSED: "Soumis à approbation",
  APPLIED: "Approuvé",
  REPLACED: "Remplacé",
};

export function irgRowStatusLabel(status: string): string {
  return IRG_ROW_LABEL[status as IrgRowStatus] ?? status;
}

export function parseIrgRowStatus(v: unknown): IrgRowStatus {
  return v === "DRAFT" || v === "PROPOSED" || v === "APPLIED" || v === "REPLACED" ? v : "LEGACY";
}

export const OPEN_RULE_STATUSES: readonly RuleStatus[] = ["DRAFT", "SUBMITTED", "APPROVED"];

export function isOpenRuleStatus(status: string): boolean {
  return (OPEN_RULE_STATUSES as readonly string[]).includes(status);
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(v: string): boolean {
  if (!ISO_DAY.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function monthStartOf(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function nextMonthStart(iso: string): string {
  const [y, m] = iso.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

/**
 * D2 "from a date": no month is split. A date on the 1st applies from that month; any later date attaches by
 * default to the following month (no implicit retroactivity). Its own month stays available as an explicit choice.
 */
export function applicationMonthsForDate(date: string): { suggested: string; alternative: string | null } {
  const own = monthStartOf(date);
  if (date.slice(8, 10) === "01") return { suggested: own, alternative: null };
  return { suggested: nextMonthStart(date), alternative: own };
}

/** Mirrors ref_rule_request_application_internal: 1st of a month, not before the first open month. */
export function applicationMonthError(input: { month: string; firstOpen: string | null; date?: string | null }): string | null {
  if (!isIsoDay(input.month) || input.month.slice(8, 10) !== "01") return "Le mois d'application commence le 1er.";
  if (input.firstOpen && input.month < input.firstOpen) {
    return `Mois déjà traité (paie validée ou clôturée) : choisissez ${frMonth(input.firstOpen)} ou un mois suivant.`;
  }
  if (input.date) {
    const { suggested, alternative } = applicationMonthsForDate(input.date);
    if (input.month !== suggested && input.month !== alternative) {
      return "La date choisie se rattache à son mois ou au mois suivant.";
    }
  }
  return null;
}

const FR_MONTH = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

export function frMonth(iso: string | null | undefined): string {
  if (!iso) return "—";
  return FR_MONTH.format(new Date(`${iso.slice(0, 7)}-01T00:00:00Z`));
}

export function frDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 10).split("-").reverse().join("/");
}

/** Legal source of a proposal, asked in every screen that proposes a rule. */
export const ruleSourceSchema = z.object({
  source_ref: z
    .string()
    .trim()
    .min(3, "Source légale requise : texte, article, date de publication.")
    .max(500, "Source légale : 500 caractères maximum."),
  text_effective_date: z.string().refine(isIsoDay, "Date d'effet prévue par le texte requise."),
});
export type RuleSource = z.infer<typeof ruleSourceSchema>;

export const verifySourceSchema = z.object({
  source_ref: ruleSourceSchema.shape.source_ref,
});

export type RuleContributor = { name: string; role: string; at: string };

export type RuleProposalView = {
  id: string;
  family: RuleFamily;
  action: RuleAction;
  target_id: string | null;
  target_key: string | null;
  target_label: string;
  title: string;
  source_ref: string;
  text_effective_date: string | null;
  requested_month: string | null;
  origin: "MANUAL" | "AI";
  status: RuleStatus;
  created_at: string;
  created_by_name: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  review_note: string | null;
  self_approved: boolean;
  applied_month: string | null;
  applied_at: string | null;
  closed_reason: string | null;
  application_decision_id: string | null;
  application_decision_status: string | null;
  contributors: RuleContributor[];
  is_contributor: boolean;
  current: Record<string, unknown> | null;
  proposed: Record<string, unknown> | null;
};

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

const str = (v: unknown) => (typeof v === "string" ? v : null);
const day = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : null);

function oneOf<T extends string>(list: readonly T[], v: unknown, fallback: T): T {
  return typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : fallback;
}

export function parseProposalOverview(raw: unknown): RuleProposalView[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const r = obj(item);
    const id = str(r?.id);
    if (!r || !id) return [];
    return [
      {
        id,
        family: oneOf(RULE_FAMILIES, r.family, "LEGAL_VAR"),
        action: oneOf(RULE_ACTIONS, r.action, "SET"),
        target_id: str(r.target_id),
        target_key: str(r.target_key),
        target_label: str(r.target_label) ?? "—",
        title: str(r.title) ?? "",
        source_ref: str(r.source_ref) ?? "",
        text_effective_date: day(r.text_effective_date),
        requested_month: day(r.requested_month),
        origin: r.origin === "AI" ? "AI" : "MANUAL",
        status: oneOf(RULE_STATUSES, r.status, "DRAFT"),
        created_at: str(r.created_at) ?? "",
        created_by_name: str(r.created_by_name),
        submitted_at: str(r.submitted_at),
        reviewed_at: str(r.reviewed_at),
        reviewed_by_name: str(r.reviewed_by_name),
        review_note: str(r.review_note),
        self_approved: r.self_approved === true,
        applied_month: day(r.applied_month),
        applied_at: str(r.applied_at),
        closed_reason: str(r.closed_reason),
        application_decision_id: str(r.application_decision_id),
        application_decision_status: str(r.application_decision_status),
        contributors: Array.isArray(r.contributors)
          ? r.contributors.flatMap((c) => {
              const x = obj(c);
              return x ? [{ name: str(x.name) ?? "—", role: str(x.role) ?? "", at: str(x.at) ?? "" }] : [];
            })
          : [],
        is_contributor: r.is_contributor === true,
        current: obj(r.current),
        proposed: obj(r.proposed),
      },
    ];
  });
}

export const CONTRIBUTOR_ROLE_LABEL: Record<string, string> = {
  CREATE: "création",
  EDIT: "modification",
  SUBMIT: "soumission",
  AI_EXTRACT: "extraction IA",
};

/**
 * Mirrors ref_rule_proposal_approve: approval right, submitted proposal, no contributor approves their own
 * proposal except the SUPER_ADMIN, whose self-approval is flagged.
 */
export function approvalCheck(input: {
  status: string;
  canApprove: boolean;
  isSuperAdmin: boolean;
  isContributor: boolean;
}): { allowed: boolean; selfApproval: boolean; reason: string | null } {
  if (input.status !== "SUBMITTED") return { allowed: false, selfApproval: false, reason: "Proposition non soumise." };
  if (!input.canApprove && !input.isSuperAdmin) {
    return {
      allowed: false,
      selfApproval: false,
      reason: "Approbation réservée aux approbateurs des règles légales (délégation par le SUPER_ADMIN).",
    };
  }
  if (input.isContributor && !input.isSuperAdmin) {
    return {
      allowed: false,
      selfApproval: false,
      reason: "Séparation des tâches : vous avez contribué à cette proposition, un autre approbateur doit l'approuver.",
    };
  }
  return { allowed: true, selfApproval: input.isContributor, reason: null };
}

/** Fraction stored in ref_global_var_versions → percent text (0.09 → "9 %"). */
export function fractionPct(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  if (v == null || !Number.isFinite(n)) return "—";
  return `${String(Math.round(n * 1_000_000) / 10_000).replace(".", ",")} %`;
}

export function plainPct(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  if (v == null || !Number.isFinite(n)) return "taux légal";
  return `${String(n).replace(".", ",")} %`;
}
