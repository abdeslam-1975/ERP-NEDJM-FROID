export const EXTERNAL_KINDS = ["PAYMENT", "DECLARATION"] as const;
export type ExternalKind = (typeof EXTERNAL_KINDS)[number];

export const EXTERNAL_SUBTYPES: Record<ExternalKind, readonly string[]> = {
  PAYMENT: ["SALARY", "OTHER"],
  DECLARATION: ["G50", "CNAS", "DAS", "OTHER"],
};

export const EXTERNAL_SOURCES = ["DECLARATIVE", "DOCUMENT"] as const;
export type ExternalSource = (typeof EXTERNAL_SOURCES)[number];

export const EXTERNAL_DOC_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const EXTERNAL_DOC_MAX_BYTES = 15 * 1024 * 1024;
export const EXTERNAL_DOC_BUCKET = "hr-external-docs";

/** Payroll months up to August 2026 were paid and declared outside the application. */
export const OPERATIONAL_START = { year: 2026, month: 9 } as const;

export const NO_TRACE_NOTICE =
  "Aucune trace enregistrée dans l'application - cela ne prouve pas qu'aucun paiement ou aucune déclaration n'a eu lieu.";

export const INDICATORS_NOTICE =
  "Ces indicateurs informent seulement : aucun ne lève le blocage ni n'atténue l'avertissement.";

const KIND_LABELS: Record<string, string> = { PAYMENT: "Paiement", DECLARATION: "Déclaration" };
const SUBTYPE_LABELS: Record<string, string> = {
  SALARY: "Salaires",
  G50: "G50 (IRG)",
  CNAS: "CNAS",
  DAS: "DAS annuelle",
  OTHER: "Autre",
};
const SOURCE_LABELS: Record<string, string> = {
  DECLARATIVE: "Déclaratif (sans pièce)",
  DOCUMENT: "Sur pièce",
};
const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  SUPERSEDED: "Remplacée par une correction",
  WITHDRAWN: "Retirée",
};
const TRANSFER_REASONS: Record<string, string> = {
  EXTERNAL_PERIOD: "Paie de reprise, payée hors de l'application",
  ALREADY_PAID: "Salaire du mois déjà viré par un lot exécuté",
  EXTERNAL_PAYMENT: "Paiement externe enregistré",
};
const DECLARATION_REASONS: Record<string, string> = {
  EXTERNAL_PERIOD: "Mois de reprise, déclaré hors de l'application",
  EXTERNAL_DECLARATION: "Déclaration externe enregistrée",
};
export const DECLARATION_KINDS = ["monthly", "das", "cnas_file", "das_file", "g50"] as const;
export type DeclarationKind = (typeof DECLARATION_KINDS)[number];
const DECLARATION_KIND_LABELS: Record<string, string> = {
  monthly: "Déclarations mensuelles (G50 + CNAS)",
  das: "DAS annuelle (classeur)",
  cnas_file: "Fichier CNAS des cotisations",
  das_file: "Fichier DAS",
  g50: "État G50",
};

export const externalKindLabel = (v: string) => KIND_LABELS[v] ?? v;
export const externalSubtypeLabel = (v: string) => SUBTYPE_LABELS[v] ?? v;
export const externalSourceLabel = (v: string) => SOURCE_LABELS[v] ?? v;
export const externalStatusLabel = (v: string) => STATUS_LABELS[v] ?? v;
export const transferReasonLabel = (v: string) => TRANSFER_REASONS[v] ?? v;
export const declarationReasonLabel = (v: string) => DECLARATION_REASONS[v] ?? v;
export const declarationKindLabel = (v: string) => DECLARATION_KIND_LABELS[v] ?? v;

export function isDeclarationKind(v: unknown): v is DeclarationKind {
  return typeof v === "string" && (DECLARATION_KINDS as readonly string[]).includes(v);
}

export function periodNatureOf(year: number, month: number): "EXTERNAL" | "OPERATIONAL" {
  return year < OPERATIONAL_START.year || (year === OPERATIONAL_START.year && month < OPERATIONAL_START.month)
    ? "EXTERNAL"
    : "OPERATIONAL";
}

/** Screen-only banner (never printed on a slip or certificate). */
export function repriseBanner(context: "transfer" | "declaration"): string {
  return context === "transfer"
    ? "Paie de reprise (janvier à août 2026) : ces salaires ont été payés hors de l'application. Un virement ici crée un risque de double paiement ; il reste bloqué sans décision D9."
    : "Mois de reprise (janvier à août 2026) : ces paies ont été déclarées hors de l'application. Un fichier officiel ici crée un risque de double déclaration ; il reste bloqué sans décision D10.";
}

export type ExternalDocument = {
  id: string;
  file_name: string;
  sha256: string;
  is_current: boolean;
  uploaded_by: string | null;
  uploaded_at: string | null;
  examined_by: string | null;
  examined_at: string | null;
  examination_note: string | null;
};

export type ExternalOperation = {
  id: string;
  root_id: string;
  version_no: number;
  kind: string;
  subtype: string;
  period_from: string;
  period_to: string;
  sites: string[] | null;
  employee_count: number | null;
  /** Present on the register screen only (to prefill a correction). */
  site_ids: string[] | null;
  employee_ids: string[] | null;
  operation_date: string | null;
  reference: string | null;
  organism: string | null;
  total_amount: number | null;
  source: string;
  description: string;
  status: string;
  withdrawn_reason: string | null;
  withdrawn_at: string | null;
  declared_by: string | null;
  declared_at: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  documents: ExternalDocument[];
};

export type DeclarationExport = {
  id: string;
  kind: string;
  nature: string;
  period_year: number;
  period_month: number | null;
  site_name: string;
  months: number[];
  excluded_months: number[];
  file_name: string;
  sha256: string;
  payroll_status: string;
  double_declaration_risk: boolean;
  decision_id: string | null;
  created_by: string | null;
  created_at: string | null;
};

const obj = (v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
const day = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 10) : null);
const num = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const rows = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v)
    ? v.flatMap((x) => {
        const o = obj(x);
        return o ? [o] : [];
      })
    : [];
const ints = (v: unknown) =>
  Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n)) : [];

export function parseExternalOperations(raw: unknown): ExternalOperation[] {
  return rows(raw).map((o) => ({
    id: str(o.id) ?? "",
    root_id: str(o.root_id) ?? "",
    version_no: num(o.version_no) ?? 1,
    kind: str(o.kind) ?? "",
    subtype: str(o.subtype) ?? "",
    period_from: day(o.period_from) ?? "",
    period_to: day(o.period_to) ?? "",
    sites: Array.isArray(o.sites) ? o.sites.map(String) : null,
    employee_count: num(o.employee_count),
    site_ids: Array.isArray(o.site_ids) ? o.site_ids.map(String) : null,
    employee_ids: Array.isArray(o.employee_ids) ? o.employee_ids.map(String) : null,
    operation_date: day(o.operation_date),
    reference: str(o.reference),
    organism: str(o.organism),
    total_amount: num(o.total_amount),
    source: str(o.source) ?? "DECLARATIVE",
    description: str(o.description) ?? "",
    status: str(o.status) ?? "ACTIVE",
    withdrawn_reason: str(o.withdrawn_reason),
    withdrawn_at: str(o.withdrawn_at),
    declared_by: str(o.declared_by),
    declared_at: str(o.declared_at),
    confirmed_by: str(o.confirmed_by),
    confirmed_at: str(o.confirmed_at),
    documents: rows(o.documents).map((d) => ({
      id: str(d.id) ?? "",
      file_name: str(d.file_name) ?? "",
      sha256: str(d.sha256) ?? "",
      is_current: d.is_current !== false,
      uploaded_by: str(d.uploaded_by),
      uploaded_at: str(d.uploaded_at),
      examined_by: str(d.examined_by),
      examined_at: str(d.examined_at),
      examination_note: str(d.examination_note),
    })),
  }));
}

export function parseDeclarationExports(raw: unknown): DeclarationExport[] {
  return rows(raw).map((e) => ({
    id: str(e.id) ?? "",
    kind: str(e.kind) ?? "",
    nature: str(e.nature) ?? "OFFICIAL",
    period_year: num(e.period_year) ?? 0,
    period_month: num(e.period_month),
    site_name: str(e.site_name) ?? "Tous les chantiers",
    months: ints(e.months),
    excluded_months: ints(e.excluded_months),
    file_name: str(e.file_name) ?? "",
    sha256: str(e.sha256) ?? "",
    payroll_status: str(e.payroll_status) ?? "",
    double_declaration_risk: e.double_declaration_risk === true,
    decision_id: str(e.decision_id),
    created_by: str(e.created_by),
    created_at: str(e.created_at),
  }));
}

/** hr_declaration_export_plan: what an export may contain now, and under which D10 (nothing is consumed). */
export type DeclarationPlan = {
  kind: string;
  year: number;
  month: number | null;
  covered_months: number[];
  required_months: number[];
  month_reasons: Record<string, string[]>;
  blocked: boolean;
  message: string | null;
  option: string | null;
  nature: "OFFICIAL" | "CONTROL";
  months: number[];
  excluded_months: number[];
  open_decision: { id: string; status: string; option: string | null } | null;
  prior_exports: DeclarationExport[];
  external_operations: ExternalOperation[];
};

export function parseDeclarationPlan(raw: unknown): DeclarationPlan {
  const p = obj(raw) ?? {};
  const reasons = obj(p.month_reasons) ?? {};
  const open = obj(p.open_decision);
  return {
    kind: str(p.kind) ?? "",
    year: num(p.year) ?? 0,
    month: num(p.month),
    covered_months: ints(p.covered_months),
    required_months: ints(p.required_months),
    month_reasons: Object.fromEntries(
      Object.entries(reasons).map(([k, v]) => [k, Array.isArray(v) ? v.map(String) : []]),
    ),
    blocked: p.blocked === true,
    message: str(p.message),
    option: str(p.option),
    nature: p.nature === "CONTROL" ? "CONTROL" : "OFFICIAL",
    months: ints(p.months),
    excluded_months: ints(p.excluded_months),
    open_decision: open && str(open.id) ? { id: str(open.id) ?? "", status: str(open.status) ?? "", option: str(open.option) } : null,
    prior_exports: parseDeclarationExports(p.prior_exports),
    external_operations: parseExternalOperations(p.external_operations),
  };
}

const frDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "");

function monthLabel(iso: string): string {
  if (!iso) return "—";
  const [y, m] = iso.split("-");
  return `${m}/${y}`;
}

export function externalPeriodLabel(op: Pick<ExternalOperation, "period_from" | "period_to">): string {
  const a = monthLabel(op.period_from);
  const b = monthLabel(op.period_to);
  return a === b ? a : `${a} → ${b}`;
}

export type IndicatorTone = "neutral" | "info" | "success" | "warning";
export type Indicator = { key: "declared" | "confirmed" | "examined"; label: string; text: string; tone: IndicatorTone };

/** The three independent indicators of an entry: none of them lifts a block or reduces a warning. */
export function externalIndicators(op: ExternalOperation): Indicator[] {
  const declared: Indicator = {
    key: "declared",
    label: "Information déclarée",
    text: `Saisie par ${op.declared_by ?? "—"}${op.declared_at ? ` le ${frDate(op.declared_at)}` : ""} (${externalSourceLabel(op.source).toLowerCase()}).`,
    tone: "info",
  };
  const confirmed: Indicator = op.confirmed_by
    ? {
        key: "confirmed",
        label: "Enregistrement confirmé",
        text: `Confirmation de l'enregistrement par ${op.confirmed_by} - l'application n'a pas vérifié la réalité du paiement ou de la déclaration.`,
        tone: "success",
      }
    : { key: "confirmed", label: "Enregistrement non confirmé", text: "Aucune confirmation de l'enregistrement.", tone: "neutral" };
  const current = op.documents.filter((d) => d.is_current);
  const examined = current.filter((d) => d.examined_by);
  const doc: Indicator =
    current.length === 0
      ? { key: "examined", label: "Aucune pièce", text: "Aucune pièce justificative jointe.", tone: "neutral" }
      : examined.length === current.length
        ? {
            key: "examined",
            label: "Pièce examinée",
            text: examined.map((d) => documentIndicatorText(d)).join(" "),
            tone: "success",
          }
        : {
            key: "examined",
            label: "Pièce jointe, non examinée",
            text: `${current.length - examined.length} pièce(s) jointe(s), non examinée(s).`,
            tone: "warning",
          };
  return [declared, confirmed, doc];
}

export function documentIndicatorText(d: ExternalDocument): string {
  return d.examined_by
    ? `Pièce examinée par ${d.examined_by} - l'application ne garantit pas l'authenticité du document.`
    : "pièce jointe, non examinée";
}

/** Plain-text summary of an entry, for decision screens and reconciliation statements. */
export function externalOperationSummary(op: ExternalOperation): string {
  const parts = [
    `${externalKindLabel(op.kind)} ${externalSubtypeLabel(op.subtype)}`,
    externalPeriodLabel(op),
    op.sites ? op.sites.join(", ") : "tous les chantiers",
    op.employee_count ? `${op.employee_count} salarié(s)` : "tous les salariés",
  ];
  if (op.reference) parts.push(`réf. ${op.reference}`);
  if (op.total_amount !== null) parts.push(`${op.total_amount.toLocaleString("fr-FR")} DA`);
  if (op.status !== "ACTIVE") parts.push(externalStatusLabel(op.status).toLowerCase());
  return parts.join(" · ");
}

export function monthsLabel(year: number, months: number[]): string {
  if (!months.length) return "—";
  return months.map((m) => `${String(m).padStart(2, "0")}/${year}`).join(", ");
}

export function declarationExportPeriod(e: Pick<DeclarationExport, "period_year" | "period_month">): string {
  return e.period_month ? `${String(e.period_month).padStart(2, "0")}/${e.period_year}` : `Année ${e.period_year}`;
}
