export const DECISION_STATUSES = ["PENDING", "DECIDED", "EXECUTED", "INVALIDATED", "SUPERSEDED"] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export type DecisionOption = {
  code: string;
  label_fr: string;
  consequence_fr: string;
  /** true = choosing it runs an operation (generate / recalculate); false = recorded only. */
  executes: boolean;
};

export type PayrollInputSource =
  | "ATTENDANCE"
  | "CONTRACT"
  | "SALARY"
  | "SALARY_HISTORY"
  | "EXCEPTION"
  | "EXIT"
  | "LEAVE"
  | "ADVANCE"
  | "COMPLIANCE"
  | "ASSIGNMENT"
  | "SITE_WILAYA";

export const DECISION_TYPES = [
  { code: "D4", label: "D4 · Génération de paie" },
  { code: "D3", label: "D3 · Recalcul des paies brouillon" },
  { code: "D8", label: "D8 · Correction d'une affectation" },
  { code: "D13", label: "D13 · Contrat ne commençant pas le 1er" },
] as const;
export type DecisionTypeCode = (typeof DECISION_TYPES)[number]["code"];
export const DECISION_TYPE_CODES = DECISION_TYPES.map((t) => t.code) as [DecisionTypeCode, ...DecisionTypeCode[]];

export function isDecisionTypeCode(v: unknown): v is DecisionTypeCode {
  return typeof v === "string" && (DECISION_TYPE_CODES as readonly string[]).includes(v);
}

export type PeriodNature = "EXTERNAL" | "OPERATIONAL";

export const JUSTIFICATION_MIN = 10;
export const JUSTIFICATION_MAX = 2000;

const STATUS_LABELS: Record<DecisionStatus, string> = {
  PENDING: "En attente",
  DECIDED: "Décidée, à exécuter",
  EXECUTED: "Exécutée",
  INVALIDATED: "Invalidée",
  SUPERSEDED: "Remplacée",
};

const SOURCE_LABELS: Record<PayrollInputSource | "MANUAL" | "DATA_QUALITY", string> = {
  ATTENDANCE: "Présences",
  CONTRACT: "Contrat de travail",
  SALARY: "Rubriques de salaire",
  SALARY_HISTORY: "Avenant de salaire",
  EXCEPTION: "Exception de paie",
  EXIT: "Sortie",
  LEAVE: "Congé",
  ADVANCE: "Avance ou prêt",
  COMPLIANCE: "Dérogation IRG / CNAS / CACOBATPH",
  ASSIGNMENT: "Affectation du contrat",
  SITE_WILAYA: "Wilaya du chantier",
  MANUAL: "Demande depuis l'écran Paie",
  DATA_QUALITY: "Rapport de qualité des données",
};

export function decisionStatusLabel(status: string): string {
  return STATUS_LABELS[status as DecisionStatus] ?? status;
}

export function decisionStatusTone(status: string): "warning" | "brand" | "success" | "neutral" | "danger" {
  if (status === "PENDING") return "warning";
  if (status === "DECIDED") return "brand";
  if (status === "EXECUTED") return "success";
  if (status === "INVALIDATED") return "danger";
  return "neutral";
}

export function payrollSourceLabel(source: string): string {
  return SOURCE_LABELS[source as keyof typeof SOURCE_LABELS] ?? source;
}

/** D8 preview: what the correction changes for the IRG of the months covered (no slip is recalculated). */
export function assignmentZoneNotice(input: {
  oldZone: string | null;
  newZone: string | null;
  draftSlips: number;
}): string {
  if (!input.oldZone || !input.newZone) return "Zone IRG non déterminée pour l'un des chantiers.";
  if (input.oldZone === input.newZone) {
    return `Même zone IRG (${input.oldZone}) : aucun écart d'IRG dû à la zone.`;
  }
  const slips =
    input.draftSlips > 0
      ? ` ${input.draftSlips} bulletin(s) brouillon listé(s) ci-dessous seront signalés ; leur IRG changera au recalcul (décision D3).`
      : " Aucun bulletin brouillon n'est concerné pour l'instant.";
  return `Zone IRG modifiée : ${input.oldZone} → ${input.newZone}.${slips}`;
}

export function periodNatureText(nature: string | null | undefined): string {
  return nature === "EXTERNAL"
    ? "Mois antérieur à septembre 2026 : paie versée et déclarée hors de l'application. Une paie générée ici ne vaut ni paiement ni déclaration."
    : "Paie opérationnelle : les virements et déclarations de ce mois sont préparés dans l'application.";
}

export function periodLabel(year: number | null, month: number | null): string {
  if (!year || !month) return "—";
  return `${String(month).padStart(2, "0")}/${year}`;
}

export function parseDecisionOptions(raw: unknown): DecisionOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o): o is Record<string, unknown> => Boolean(o) && typeof o === "object")
    .map((o) => ({
      code: String(o.code ?? ""),
      label_fr: String(o.label_fr ?? ""),
      consequence_fr: String(o.consequence_fr ?? ""),
      executes: o.executes === true,
    }))
    .filter((o) => o.code !== "");
}

export function validateJustification(text: string): string | null {
  const len = text.trim().length;
  if (len < JUSTIFICATION_MIN) return `Justification obligatoire (${JUSTIFICATION_MIN} caractères minimum).`;
  if (len > JUSTIFICATION_MAX) return `Justification trop longue (${JUSTIFICATION_MAX} caractères maximum).`;
  return null;
}

/** Mirrors sys_decision_decide: right on the type, separation of duties (SUPER_ADMIN exempt), still pending. */
export function decideBlocker(input: {
  status: string;
  isSuperAdmin: boolean;
  hasDecisionRight: boolean;
  requestedBy: string | null;
  userId: string;
}): string | null {
  if (input.status !== "PENDING") return "Cette décision n'est plus en attente.";
  if (!input.isSuperAdmin && !input.hasDecisionRight) {
    return "Vous n'avez pas le droit de prendre cette décision. Le SUPER_ADMIN peut vous le déléguer depuis la matrice des droits.";
  }
  if (!input.isSuperAdmin && input.requestedBy === input.userId) {
    return "Séparation des tâches : vous êtes à l'origine de cette demande, un autre décideur doit la trancher.";
  }
  return null;
}

export type PayrollSignal = { flagged_runs: number; generation_decision: string | null };

export function parsePayrollSignal(raw: unknown): PayrollSignal {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const flagged = Number(r.flagged_runs ?? 0);
  return {
    flagged_runs: Number.isFinite(flagged) ? flagged : 0,
    generation_decision: typeof r.generation_decision === "string" ? r.generation_decision : null,
  };
}

/** One-line notice shown after a change that affects payroll inputs (nothing is recalculated). */
export function payrollSignalNotice(signal: PayrollSignal): string | null {
  if (signal.flagged_runs > 0) {
    return `${signal.flagged_runs} paie(s) brouillon signalée(s) « données modifiées depuis le calcul » : aucun recalcul automatique, décision demandée au Centre de décisions.`;
  }
  if (signal.generation_decision) {
    return "Aucune paie n'a été créée : la génération est soumise à décision (Centre de décisions).";
  }
  return null;
}
