import {
  NO_TRACE_NOTICE,
  parseDeclarationExports,
  parseExternalOperations,
  type DeclarationExport,
  type ExternalOperation,
} from "@/lib/hr/external-operations";
import { parseCitations, parseWarnings, type CitationView } from "@/lib/rules/legal-documents";

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
  | "SITE_WILAYA"
  | "LEGAL_RULE"
  | "LEGEND_COEFFICIENT";

export const DECISION_TYPES = [
  { code: "D1", label: "D1 · Paie d'un mois aux règles non approuvées" },
  { code: "D4", label: "D4 · Génération de paie" },
  { code: "D3", label: "D3 · Recalcul des paies brouillon" },
  { code: "D2", label: "D2 · Date d'application d'une règle légale" },
  { code: "D8", label: "D8 · Correction d'une affectation" },
  { code: "D13", label: "D13 · Contrat ne commençant pas le 1er" },
  { code: "D6", label: "D6 · Clôture des mois de reprise" },
  { code: "D7", label: "D7 · Réouverture d'une paie" },
  { code: "D9", label: "D9 · Virement bloqué (reprise, déjà viré ou payé hors application)" },
  { code: "D10", label: "D10 · Déclaration bloquée (reprise ou déjà déclarée hors application)" },
  { code: "D5", label: "D5 · Conflit d'un import de présences" },
  { code: "D11", label: "D11 · Correspondance des codes d'un import" },
  { code: "D12", label: "D12 · Validation d'un import par son auteur" },
  { code: "D14", label: "D14 · Coefficient d'un code de présence" },
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

const SOURCE_LABELS: Record<
  | PayrollInputSource
  | "MANUAL"
  | "DATA_QUALITY"
  | "RULE_APPROVAL"
  | "PAYROLL_REOPEN"
  | "PAYROLL_VALIDATION"
  | "TRANSFER_PREPARATION"
  | "DECLARATION_EXPORT"
  | "ATTENDANCE_IMPORT"
  | "IMPORT_POLICY",
  string
> = {
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
  LEGAL_RULE: "Règle légale appliquée (décision D2)",
  LEGEND_COEFFICIENT: "Coefficient d'un code de présence (décision D14)",
  MANUAL: "Demande depuis l'écran Paie",
  DATA_QUALITY: "Rapport de qualité des données",
  RULE_APPROVAL: "Approbation d'une règle légale",
  PAYROLL_REOPEN: "Demande de réouverture depuis l'écran Paie",
  PAYROLL_VALIDATION: "Validation d'une paie depuis l'écran Paie",
  TRANSFER_PREPARATION: "Préparation d'un virement depuis l'écran Virements",
  DECLARATION_EXPORT: "Export d'une déclaration depuis l'écran Paie",
  ATTENDANCE_IMPORT: "Analyse d'un import d'archives de présence",
  IMPORT_POLICY: "Écran des imports de présences",
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
  /** D2: the user contributed to the rule (creation, edit, submission, AI extraction). */
  isRuleContributor?: boolean;
}): string | null {
  if (input.status !== "PENDING") return "Cette décision n'est plus en attente.";
  if (!input.isSuperAdmin && !input.hasDecisionRight) {
    return "Vous n'avez pas le droit de prendre cette décision. Le SUPER_ADMIN peut vous le déléguer depuis la matrice des droits.";
  }
  if (!input.isSuperAdmin && input.requestedBy === input.userId) {
    return "Séparation des tâches : vous êtes à l'origine de cette demande, un autre décideur doit la trancher.";
  }
  if (!input.isSuperAdmin && input.isRuleContributor) {
    return "Séparation des tâches : vous avez contribué à cette règle, un autre décideur doit fixer sa date d'application.";
  }
  return null;
}

export type RuleApplicationSlips = {
  period_key: string;
  period: string;
  status: string;
  runs: number;
  slips: number;
  /** Draft payroll of the application month or later: flagged, recalculated only on decision D3. */
  affected: boolean;
};

/** D2 context (ref_rule_application_context). */
export type RuleApplicationContext = {
  proposal_id: string;
  family: string;
  action: string;
  title: string;
  target_label: string;
  source_ref: string;
  text_effective_date: string | null;
  requested_month: string | null;
  approved_at: string | null;
  approved_by: string | null;
  self_approved: boolean;
  contributors: string[];
  application_month: string;
  application_date: string | null;
  first_open_month: string | null;
  /** D6 closing policy at the time of the context. */
  chain_mode: string;
  /** Separated chains: a rule applied to a reprise month stops on this day (31/08/2026). */
  bounded_to: string | null;
  current: Record<string, unknown> | null;
  proposed: Record<string, unknown> | null;
  slips: RuleApplicationSlips[];
  citations: CitationView[];
  citation_warnings: string[];
};

const obj = (v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const str = (v: unknown) => (typeof v === "string" ? v : null);
const isoDay = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 10) : null);

export function parseRuleApplicationContext(raw: unknown): RuleApplicationContext {
  const c = obj(raw) ?? {};
  const open = isoDay(c.first_open_month);
  return {
    proposal_id: str(c.proposal_id) ?? "",
    family: str(c.family) ?? "",
    action: str(c.action) ?? "SET",
    title: str(c.title) ?? "",
    target_label: str(c.target_label) ?? "",
    source_ref: str(c.source_ref) ?? "",
    text_effective_date: isoDay(c.text_effective_date),
    requested_month: isoDay(c.requested_month),
    approved_at: str(c.approved_at),
    approved_by: str(c.approved_by),
    self_approved: c.self_approved === true,
    contributors: Array.isArray(c.contributors) ? c.contributors.map(String) : [],
    application_month: isoDay(c.application_month) ?? "",
    application_date: isoDay(c.application_date),
    first_open_month: open && open > "1900-01-01" ? open : null,
    chain_mode: str(c.chain_mode) ?? "UNDECIDED",
    bounded_to: isoDay(c.bounded_to),
    current: obj(c.current),
    proposed: obj(c.proposed),
    citations: parseCitations(c.citations),
    citation_warnings: parseWarnings(c.citation_warnings),
    slips: Array.isArray(c.slips)
      ? c.slips.flatMap((s) => {
          const x = obj(s);
          if (!x) return [];
          const runs = Number(x.runs ?? 0);
          const slips = Number(x.slips ?? 0);
          return [
            {
              period_key: str(x.period_key) ?? "",
              period: str(x.period) ?? str(x.period_key) ?? "",
              status: str(x.status) ?? "",
              runs: Number.isFinite(runs) ? runs : 0,
              slips: Number.isFinite(slips) ? slips : 0,
              affected: x.affected === true,
            },
          ];
        })
      : [],
  };
}

const RUN_STATUS: Record<string, string> = {
  DRAFT: "Brouillon",
  VALIDATED: "Validée",
  CLOSED: "Clôturée",
  LOCKED: "Verrouillée",
};

export function payrollRunStatusLabel(status: string): string {
  return RUN_STATUS[status] ?? status;
}

/** One-line summary of the payslips a D2 application would flag (none is recalculated or modified). */
export function ruleApplicationSlipNotice(slips: RuleApplicationSlips[]): string {
  const flagged = slips.filter((s) => s.affected).reduce((n, s) => n + s.slips, 0);
  const frozen = slips.filter((s) => s.status !== "DRAFT").reduce((n, s) => n + s.slips, 0);
  const parts = [
    flagged
      ? `${flagged} bulletin(s) brouillon seront signalés « données modifiées » ; recalcul seulement sur décision D3.`
      : "Aucun bulletin brouillon concerné.",
  ];
  if (frozen) parts.push(`${frozen} bulletin(s) validé(s) ou clôturé(s) : pour information, jamais modifiés.`);
  return parts.join(" ");
}

const numOr0 = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const list = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v)
    ? v.flatMap((x) => {
        const o = obj(x);
        return o ? [o] : [];
      })
    : [];

export type ReopenTransfer = {
  batch_no: string;
  status: string;
  mode: string;
  lines: number;
  amount: number;
  executed_at: string | null;
  deposit_date: string | null;
};

/** D7 context (hr_payroll_reopen_context): everything already produced from the payroll to reopen. */
export type PayrollReopenContext = {
  run_id: string;
  site_name: string;
  period: string;
  period_nature: string;
  status: string;
  reason: string;
  slip_count: number;
  gross_total: number;
  irg_total: number;
  net_total: number;
  validated_at: string | null;
  validated_by: string | null;
  locked_at: string | null;
  locked_by: string | null;
  transfers: ReopenTransfer[];
  transfer_executed: boolean;
  transfer_pending: boolean;
  certificates: { number: string; type: string; issued_at: string; employee: string }[];
  later_runs: { period: string; status: string; site_name: string }[];
  prior_decisions: { id: string; type: string; status: string; option: string | null; at: string | null }[];
  versions: number;
  chain_mode: string;
  /** false for decisions requested before the exports register existed (lot 3b). */
  declarations_registry: boolean;
  declaration_exports: DeclarationExport[];
  external_operations: ExternalOperation[];
};

export function parsePayrollReopenContext(raw: unknown): PayrollReopenContext {
  const c = obj(raw) ?? {};
  return {
    run_id: str(c.run_id) ?? "",
    site_name: str(c.site_name) ?? "",
    period: str(c.period) ?? "",
    period_nature: str(c.period_nature) ?? "",
    status: str(c.status) ?? "",
    reason: str(c.reason) ?? "",
    slip_count: numOr0(c.slip_count),
    gross_total: numOr0(c.gross_total),
    irg_total: numOr0(c.irg_total),
    net_total: numOr0(c.net_total),
    validated_at: str(c.validated_at),
    validated_by: str(c.validated_by),
    locked_at: str(c.locked_at),
    locked_by: str(c.locked_by),
    transfers: list(c.transfers).map((t) => ({
      batch_no: str(t.batch_no) ?? "",
      status: str(t.status) ?? "",
      mode: str(t.mode) ?? "",
      lines: numOr0(t.lines),
      amount: numOr0(t.amount),
      executed_at: str(t.executed_at),
      deposit_date: isoDay(t.deposit_date),
    })),
    transfer_executed: c.transfer_executed === true,
    transfer_pending: c.transfer_pending === true,
    certificates: list(c.certificates).map((x) => ({
      number: str(x.number) ?? "",
      type: str(x.type) ?? "",
      issued_at: str(x.issued_at) ?? "",
      employee: str(x.employee) ?? "",
    })),
    later_runs: list(c.later_runs).map((x) => ({
      period: str(x.period) ?? "",
      status: str(x.status) ?? "",
      site_name: str(x.site_name) ?? "",
    })),
    prior_decisions: list(c.prior_decisions).map((x) => ({
      id: str(x.id) ?? "",
      type: str(x.type) ?? "",
      status: str(x.status) ?? "",
      option: str(x.option),
      at: str(x.at),
    })),
    versions: numOr0(c.versions),
    chain_mode: str(c.chain_mode) ?? "UNDECIDED",
    declarations_registry: c.declarations_registry === true,
    declaration_exports: parseDeclarationExports(c.declaration_exports),
    external_operations: parseExternalOperations(c.external_operations),
  };
}

/** Warnings shown before a D7 decision. No trace in the registers is never a proof. */
export function reopenRiskNotices(c: PayrollReopenContext): string[] {
  const out: string[] = [];
  if (c.transfer_executed) {
    out.push(
      "Un virement de cette paie a déjà été exécuté : risque de double paiement. Les lots exécutés restent en l'état et un nouveau virement pour ces bulletins reste bloqué ; tout écart devra être régularisé hors de cette réouverture.",
    );
  }
  if (c.transfer_pending) {
    out.push("Un lot de virement est généré ou déposé : annulez-le ou enregistrez son exécution, la réouverture sera refusée sinon.");
  }
  if (c.certificates.length) {
    out.push(`${c.certificates.length} attestation(s), certificat(s) ou solde(s) de tout compte émis depuis la validation : ils ne seront pas modifiés.`);
  }
  if (c.later_runs.length) {
    out.push(`${c.later_runs.length} paie(s) de mois suivants déjà validée(s) ou clôturée(s) : elles ne seront pas recalculées.`);
  }
  if (!c.declarations_registry) {
    out.push(
      "Déclarations (CNAS, G50, DAS…) : demande antérieure au registre des exports de déclaration. L'absence de trace ici ne prouve pas qu'aucune déclaration n'a été déposée : vérifiez hors de l'application.",
    );
  } else {
    const official = c.declaration_exports.filter((e) => e.nature === "OFFICIAL");
    if (official.length) {
      out.push(
        `${official.length} fichier(s) officiel(s) de déclaration déjà produit(s) pour ce mois (registre des exports) : la paie rouverte pourra différer de ce qui a été déclaré ; toute régularisation se fera par une nouvelle déclaration, soumise à D10 si le mois l'exige.`,
      );
    }
    const extDecl = c.external_operations.filter((o) => o.kind === "DECLARATION");
    const extPay = c.external_operations.filter((o) => o.kind === "PAYMENT");
    if (extDecl.length) out.push(`${extDecl.length} déclaration(s) externe(s) enregistrée(s) pour ce mois (registre des opérations externes).`);
    if (extPay.length) out.push(`${extPay.length} paiement(s) externe(s) enregistré(s) pour ce mois : un nouveau virement restera soumis à D9.`);
    if (!official.length && !c.external_operations.length) out.push(`Registres des exports et des opérations externes : ${NO_TRACE_NOTICE}`);
  }
  if (c.period_nature === "EXTERNAL") {
    out.push("Mois de reprise : la paie a été versée et déclarée hors de l'application ; la réouverture ne change rien à ces opérations externes.");
  }
  return out;
}

export type ChainRepriseMonth = {
  month: string;
  period: string;
  open: boolean;
  runs: number;
  validated: number;
  slips: number;
};

/** D6 context (hr_payroll_chain_context). */
export type PayrollChainContext = {
  run_id: string;
  run_period: string;
  site_name: string;
  global_open: string | null;
  operational_start: string;
  reprise_months: ChainRepriseMonth[];
  pending_rules: number;
};

export function parsePayrollChainContext(raw: unknown): PayrollChainContext {
  const c = obj(raw) ?? {};
  const open = isoDay(c.global_open);
  return {
    run_id: str(c.run_id) ?? "",
    run_period: str(c.run_period) ?? "",
    site_name: str(c.site_name) ?? "",
    global_open: open && open > "1900-01-01" ? open : null,
    operational_start: isoDay(c.operational_start) ?? "2026-09-01",
    reprise_months: list(c.reprise_months).map((m) => ({
      month: isoDay(m.month) ?? "",
      period: str(m.period) ?? "",
      open: m.open === true,
      runs: numOr0(m.runs),
      validated: numOr0(m.validated),
      slips: numOr0(m.slips),
    })),
    pending_rules: numOr0(c.pending_rules),
  };
}

export type TransferDecisionSlip = {
  slip_id: string;
  matricule: string;
  employee: string;
  net_payable: number;
  status: string;
  reasons: string[];
};

export type TransferDecisionBatch = {
  batch_no: string;
  status: string;
  mode: string;
  lines: number;
  amount: number;
  executed_at: string | null;
  double_payment_risk: boolean;
  decision_id: string | null;
};

/** D9 context (hr_transfer_d9_context): the three information sources shown before deciding. */
export type TransferDecisionContext = {
  period: string;
  period_nature: string;
  site_name: string;
  mode: string;
  slip_count: number;
  net_total: number;
  reason: string;
  slips: TransferDecisionSlip[];
  internal_transfers: TransferDecisionBatch[];
  external_operations: ExternalOperation[];
};

const strList = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);

export function parseTransferDecisionContext(raw: unknown): TransferDecisionContext {
  const c = obj(raw) ?? {};
  return {
    period: str(c.period) ?? "",
    period_nature: str(c.period_nature) ?? "",
    site_name: str(c.site_name) ?? "",
    mode: str(c.mode) ?? "",
    slip_count: numOr0(c.slip_count),
    net_total: numOr0(c.net_total),
    reason: str(c.reason) ?? "",
    slips: list(c.slips).map((s) => ({
      slip_id: str(s.slip_id) ?? "",
      matricule: str(s.matricule) ?? "",
      employee: str(s.employee) ?? "",
      net_payable: numOr0(s.net_payable),
      status: str(s.status) ?? "",
      reasons: strList(s.reasons),
    })),
    internal_transfers: list(c.internal_transfers).map((b) => ({
      batch_no: str(b.batch_no) ?? "",
      status: str(b.status) ?? "",
      mode: str(b.mode) ?? "",
      lines: numOr0(b.lines),
      amount: numOr0(b.amount),
      executed_at: str(b.executed_at),
      double_payment_risk: b.double_payment_risk === true,
      decision_id: str(b.decision_id),
    })),
    external_operations: parseExternalOperations(c.external_operations),
  };
}

export type DeclarationDecisionMonth = {
  month: number;
  period: string;
  nature: string;
  runs: number;
  validated: number;
  slips: number;
  gross: number;
  irg: number;
  cnas: number;
};

/** D10 context (hr_declaration_d10_context). */
export type DeclarationDecisionContext = {
  kind: string;
  period: string;
  site_name: string;
  reason: string;
  covered_months: number[];
  required_months: number[];
  month_reasons: Record<string, string[]>;
  months: DeclarationDecisionMonth[];
  external_operations: ExternalOperation[];
  prior_exports: DeclarationExport[];
};

const intList = (v: unknown) => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n)) : []);

export function parseDeclarationDecisionContext(raw: unknown): DeclarationDecisionContext {
  const c = obj(raw) ?? {};
  const reasons = obj(c.month_reasons) ?? {};
  return {
    kind: str(c.kind) ?? "",
    period: str(c.period) ?? "",
    site_name: str(c.site_name) ?? "",
    reason: str(c.reason) ?? "",
    covered_months: intList(c.covered_months),
    required_months: intList(c.required_months),
    month_reasons: Object.fromEntries(Object.entries(reasons).map(([k, v]) => [k, strList(v)])),
    months: list(c.months).map((m) => ({
      month: numOr0(m.month),
      period: str(m.period) ?? "",
      nature: str(m.nature) ?? "",
      runs: numOr0(m.runs),
      validated: numOr0(m.validated),
      slips: numOr0(m.slips),
      gross: numOr0(m.gross),
      irg: numOr0(m.irg),
      cnas: numOr0(m.cnas),
    })),
    external_operations: parseExternalOperations(c.external_operations),
    prior_exports: parseDeclarationExports(c.prior_exports),
  };
}

/**
 * D9 / D10 are carried out on their operational screen (one use), never by the decision center; so is a D5
 * decided « ligne par ligne » (the other D5 options run with the decision).
 */
export function decisionFollowUp(
  type: string,
  id: string,
  option?: string | null,
): { href: string; label: string } | null {
  if (type === "D9") return { href: `/rh/paie/virements?decision=${id}`, label: "Exécuter depuis l'écran Virements" };
  if (type === "D10") {
    return { href: `/rh/paie/declarations?decision=${id}`, label: "Produire le fichier depuis le registre des déclarations" };
  }
  if (type === "D5" && option === "LINE_BY_LINE") {
    return { href: `/rh/presence/imports?decision=${id}`, label: "Trancher ligne par ligne depuis l'écran des imports" };
  }
  return null;
}

export type AttendanceConflictExisting = {
  site_name: string;
  legend_code: string;
  status_code: string;
  source_code: string;
};

export type AttendanceConflictLine = {
  line_id: string;
  source_ref: string;
  matricule: string;
  employee: string;
  work_date: string;
  site_name: string;
  imported_code: string;
  kinds: string[];
  resolution: string | null;
  existing: AttendanceConflictExisting[];
};

/** D5 context (hr_attendance_import_d5_context). */
export type AttendanceConflictContext = {
  batch_id: string;
  batch_no: string;
  period: string;
  reference_year: number;
  nature: string;
  provenance_kind: string;
  provenance_detail: string;
  source_produced_on: string | null;
  file_name: string;
  sha256: string;
  created_by: string;
  counts: Record<string, number>;
  conflict_total: number;
  conflicts: AttendanceConflictLine[];
};

export function parseAttendanceConflictContext(raw: unknown): AttendanceConflictContext {
  const c = obj(raw) ?? {};
  const counts = obj(c.counts) ?? {};
  return {
    batch_id: str(c.batch_id) ?? "",
    batch_no: str(c.batch_no) ?? "",
    period: str(c.period) ?? "",
    reference_year: numOr0(c.reference_year),
    nature: str(c.nature) ?? "",
    provenance_kind: str(c.provenance_kind) ?? "",
    provenance_detail: str(c.provenance_detail) ?? "",
    source_produced_on: isoDay(c.source_produced_on),
    file_name: str(c.file_name) ?? "",
    sha256: str(c.sha256) ?? "",
    created_by: str(c.created_by) ?? "",
    counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, numOr0(v)])),
    conflict_total: numOr0(c.conflict_total),
    conflicts: list(c.conflicts).map((l) => ({
      line_id: str(l.line_id) ?? "",
      source_ref: str(l.source_ref) ?? "",
      matricule: str(l.matricule) ?? "",
      employee: str(l.employee) ?? "",
      work_date: isoDay(l.work_date) ?? "",
      site_name: str(l.site_name) ?? "",
      imported_code: str(l.imported_code) ?? "",
      kinds: strList(l.kinds),
      resolution: str(l.resolution),
      existing: list(l.existing).map((e) => ({
        site_name: str(e.site_name) ?? "",
        legend_code: str(e.legend_code) ?? "",
        status_code: str(e.status_code) ?? "",
        source_code: str(e.source_code) ?? "",
      })),
    })),
  };
}

export type CodeMappingPair = {
  source_code: string;
  legend_code: string;
  legend_label: string;
  lines: number;
  /** Correspondence already kept as a policy for this code, if any. */
  policy: { legend_code: string; status: string } | null;
};

/** D11 context (hr_attendance_import_d11_context). */
export type CodeMappingContext = {
  batch_id: string;
  batch_no: string;
  period: string;
  provenance_detail: string;
  file_name: string;
  reason: string;
  pairs: CodeMappingPair[];
};

export function parseCodeMappingContext(raw: unknown): CodeMappingContext {
  const c = obj(raw) ?? {};
  return {
    batch_id: str(c.batch_id) ?? "",
    batch_no: str(c.batch_no) ?? "",
    period: str(c.period) ?? "",
    provenance_detail: str(c.provenance_detail) ?? "",
    file_name: str(c.file_name) ?? "",
    reason: str(c.reason) ?? "",
    pairs: list(c.pairs).map((p) => {
      const policy = obj(p.policy);
      return {
        source_code: str(p.source_code) ?? "",
        legend_code: str(p.legend_code) ?? "",
        legend_label: str(p.legend_label) ?? "",
        lines: numOr0(p.lines),
        policy: policy ? { legend_code: str(policy.legend_code) ?? "", status: str(policy.status) ?? "" } : null,
      };
    }),
  };
}

/** D12 context (hr_attendance_import_policy_context). */
export type ImportPolicyContext = {
  reason: string;
  /** null = never decided (the author may not validate). */
  current: boolean | null;
  decided_at: string | null;
  decided_by: string | null;
  batches_to_validate: number;
};

export function parseImportPolicyContext(raw: unknown): ImportPolicyContext {
  const c = obj(raw) ?? {};
  return {
    reason: str(c.reason) ?? "",
    current: typeof c.current === "boolean" ? c.current : null,
    decided_at: str(c.decided_at),
    decided_by: str(c.decided_by),
    batches_to_validate: numOr0(c.batches_to_validate),
  };
}

/** Warnings shown before a D5 decision. */
export function attendanceConflictNotices(c: AttendanceConflictContext): string[] {
  const out: string[] = [
    "Rien n'a été remplacé, écrasé ni fusionné : le lot attend votre décision. Aucune paie n'est créée ni recalculée par cette décision.",
  ];
  const validated = c.conflicts.filter((l) => l.existing.some((e) => e.status_code === "VALIDATED")).length;
  if (validated) {
    out.push(
      `${validated} présence(s) existante(s) déjà validée(s) : retenir l'import les remplacera par des présences proposées, à valider à nouveau ; une paie brouillon du mois sera signalée à recalculer (D3).`,
    );
  }
  const leave = c.conflicts.filter((l) => l.kinds.includes("LEAVE")).length;
  if (leave) out.push(`${leave} ligne(s) tombent sur un congé approuvé : le congé lui-même n'est pas modifié.`);
  if (c.nature !== "OPERATIONAL") {
    out.push("Période de reprise : une présence reprise n'atteste ni un paiement ni une déclaration.");
  }
  if (c.conflict_total > c.conflicts.length) {
    out.push(`Seules les ${c.conflicts.length} premières lignes sur ${c.conflict_total} sont affichées ; le rapport complet est disponible sur l'écran des imports.`);
  }
  return out;
}

/** Warnings shown before a D9 decision; the registers only inform, never lift the block. */
export function transferRiskNotices(c: TransferDecisionContext): string[] {
  const out: string[] = [];
  if (c.period_nature === "EXTERNAL") {
    out.push("Paie de reprise : ces salaires ont été payés hors de l'application. Un lot réel les paiera une seconde fois.");
  }
  const executed = c.internal_transfers.filter((b) => b.status === "EXECUTED");
  if (executed.length) {
    out.push(`${executed.length} lot(s) de virement déjà exécuté(s) pour ces salariés et ce mois : risque de double paiement.`);
  }
  if (c.external_operations.length) {
    out.push(`${c.external_operations.length} paiement(s) externe(s) enregistré(s) (toutes versions, y compris retirées) : risque de double paiement.`);
  }
  if (!executed.length && !c.external_operations.length) out.push(NO_TRACE_NOTICE);
  return out;
}

/** Warnings shown before a D10 decision. */
export function declarationRiskNotices(c: DeclarationDecisionContext): string[] {
  const out: string[] = [];
  const reprise = c.required_months.filter((m) => (c.month_reasons[String(m)] ?? []).includes("EXTERNAL_PERIOD"));
  const external = c.required_months.filter((m) => (c.month_reasons[String(m)] ?? []).includes("EXTERNAL_DECLARATION"));
  if (reprise.length) out.push(`${reprise.length} mois de reprise, déclarés hors de l'application : un fichier officiel les déclarerait une seconde fois.`);
  if (external.length) out.push(`${external.length} mois avec une déclaration externe enregistrée : risque de double déclaration.`);
  const official = c.prior_exports.filter((e) => e.nature === "OFFICIAL");
  if (official.length) out.push(`${official.length} fichier(s) officiel(s) déjà produit(s) dans l'application sur cette période (registre des exports).`);
  if (!c.external_operations.length && !official.length) out.push(NO_TRACE_NOTICE);
  return out;
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

/** Rule proposal that blocks a real payroll of the month (hr_month_rule_blockers). */
export type RuleBlocker = {
  proposal_id: string;
  title: string;
  family: string;
  action: string;
  status: string;
  month: string | null;
  application_decision_id: string | null;
};

export type LegacyRule = { code: string; label: string | null; from: string | null };

/** Values in force never confirmed by an approved proposal (warning only, hr_month_legacy_rules). */
export type LegacyRules = {
  legal_vars: LegacyRule[];
  cnas_rates: LegacyRule[];
  irg_bareme: LegacyRule[];
  irg_rules: LegacyRule[];
};

export function parseRuleBlockers(raw: unknown): RuleBlocker[] {
  return list(raw).map((b) => ({
    proposal_id: str(b.proposal_id) ?? "",
    title: str(b.title) ?? "",
    family: str(b.family) ?? "",
    action: str(b.action) ?? "",
    status: str(b.status) ?? "",
    month: isoDay(b.month),
    application_decision_id: str(b.application_decision_id),
  }));
}

export function parseLegacyRules(raw: unknown): LegacyRules {
  const c = obj(raw) ?? {};
  const rules = (v: unknown) =>
    list(v).map((r) => ({ code: str(r.code) ?? "", label: str(r.label) ?? str(r.category), from: isoDay(r.from) }));
  return {
    legal_vars: rules(c.legal_vars),
    cnas_rates: rules(c.cnas_rates),
    irg_bareme: rules(c.irg_bareme),
    irg_rules: rules(c.irg_rules),
  };
}

export function legacyRuleCount(l: LegacyRules): number {
  return l.legal_vars.length + l.cnas_rates.length + l.irg_bareme.length + l.irg_rules.length;
}

/** D1 context (hr_payroll_d1_context). */
export type UnapprovedRulesContext = {
  site_name: string;
  period_nature: string;
  blockers: RuleBlocker[];
  legacy: LegacyRules;
  run_status: string | null;
  attendance_days: number;
  simulations: number;
};

export function parseUnapprovedRulesContext(raw: unknown): UnapprovedRulesContext {
  const c = obj(raw) ?? {};
  return {
    site_name: str(c.site_name) ?? "",
    period_nature: str(c.period_nature) ?? "",
    blockers: parseRuleBlockers(c.blockers),
    legacy: parseLegacyRules(c.legacy),
    run_status: str(c.run_status),
    attendance_days: numOr0(c.attendance_days),
    simulations: numOr0(c.simulations),
  };
}

const RULE_FAMILY: Record<string, string> = {
  LEGAL_VAR: "Variable légale",
  CNAS_RATES: "Taux CNAS",
  IRG_BAREME: "Barème IRG",
  IRG_RULES: "Règles IRG",
  IRG_ZONE_SCOPE: "Zones IRG",
};

export function ruleFamilyLabel(family: string): string {
  return RULE_FAMILY[family] ?? family;
}

const PROPOSAL_STATUS: Record<string, string> = {
  SUBMITTED: "Soumise, à approuver",
  APPROVED: "Approuvée, date d'application à décider (D2)",
};

export function proposalStatusLabel(status: string): string {
  return PROPOSAL_STATUS[status] ?? status;
}

/** Warnings shown before a D1 decision. */
export function unapprovedRulesNotices(c: UnapprovedRulesContext): string[] {
  const out = [
    "Une règle non approuvée n'est jamais appliquée à une paie réelle : la génération et la validation de la paie de ce mois restent bloquées tant que ces règles sont en attente.",
    "La simulation utilise les règles déjà en vigueur, sans les propositions en attente. Elle ne crée aucun bulletin et ne peut être ni validée, ni payée, ni virée, ni déclarée.",
  ];
  const legacy = legacyRuleCount(c.legacy);
  if (legacy) {
    out.push(`${legacy} valeur(s) en vigueur héritée(s) sans proposition approuvée : avertissement seulement, elles ne bloquent pas.`);
  }
  if (c.run_status === "DRAFT") {
    out.push("Une paie brouillon existe déjà pour ce mois : elle ne pourra pas être validée tant que les règles sont en attente.");
  }
  if (c.period_nature === "EXTERNAL") {
    out.push("Mois de reprise : paie versée et déclarée hors de l'application.");
  }
  return out;
}

export type LegendCoefficientVersionView = {
  effective_from: string;
  coefficient: number;
  origin: string;
  decision_id: string | null;
};

/** D14 context (hr_legend_coefficient_context). */
export type LegendCoefficientContext = {
  code: string;
  label_fr: string;
  is_active: boolean;
  month: string;
  coefficient: number;
  reason: string;
  current_at_month: number;
  current_today: number;
  first_open_month: string | null;
  versions: LegendCoefficientVersionView[];
  later_versions: number;
  draft_runs: { run_id: string; year: number; month: number; site_name: string }[];
  attendance_days: number;
};

export function parseLegendCoefficientContext(raw: unknown): LegendCoefficientContext {
  const c = obj(raw) ?? {};
  const open = isoDay(c.first_open_month);
  return {
    code: str(c.code) ?? "",
    label_fr: str(c.label_fr) ?? "",
    is_active: c.is_active !== false,
    month: isoDay(c.month) ?? "",
    coefficient: numOr0(c.coefficient),
    reason: str(c.reason) ?? "",
    current_at_month: numOr0(c.current_at_month),
    current_today: numOr0(c.current_today),
    first_open_month: open && open > "1900-01-01" ? open : null,
    versions: list(c.versions).map((v) => ({
      effective_from: isoDay(v.effective_from) ?? "",
      coefficient: numOr0(v.coefficient),
      origin: str(v.origin) ?? "",
      decision_id: str(v.decision_id),
    })),
    later_versions: numOr0(c.later_versions),
    draft_runs: list(c.draft_runs).map((r) => ({
      run_id: str(r.run_id) ?? "",
      year: numOr0(r.year),
      month: numOr0(r.month),
      site_name: str(r.site_name) ?? "",
    })),
    attendance_days: numOr0(c.attendance_days),
  };
}

/** Warnings shown before a D14 decision. */
export function legendCoefficientNotices(c: LegendCoefficientContext): string[] {
  const out = [
    "Les mois antérieurs au mois d'effet, et tout mois déjà validé ou clôturé, gardent l'ancien coefficient.",
  ];
  out.push(
    c.draft_runs.length
      ? `${c.draft_runs.length} paie(s) brouillon à partir du mois d'effet : celles qui utilisent ce code seront signalées ; recalcul seulement sur décision D3.`
      : "Aucune paie brouillon à partir du mois d'effet.",
  );
  if (c.later_versions > 0) {
    out.push(`${c.later_versions} changement(s) déjà programmé(s) après ce mois : ils restent en vigueur à leur date.`);
  }
  if (!c.is_active) out.push("Code de présence désactivé : le coefficient ne sert qu'aux présences déjà saisies.");
  return out;
}
