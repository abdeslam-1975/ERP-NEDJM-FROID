import { z } from "zod";

export const LEGAL_DOC_BUCKET = "legal-documents";
export const LEGAL_DOC_MAX_BYTES = 25 * 1024 * 1024;
export const LEGAL_DOC_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type LegalDocMime = (typeof LEGAL_DOC_MIME)[number];

export const LEGAL_DOC_TYPES = [
  "LOI_FINANCES",
  "LOI_FINANCES_COMPL",
  "LOI",
  "ORDONNANCE",
  "DECRET_PRESIDENTIEL",
  "DECRET_EXECUTIF",
  "ARRETE",
  "DECISION",
  "CIRCULAIRE",
  "INSTRUCTION",
  "NOTE",
  "CONVENTION",
  "OTHER",
] as const;
export type LegalDocType = (typeof LEGAL_DOC_TYPES)[number];

const TYPE_LABELS: Record<LegalDocType, string> = {
  LOI_FINANCES: "Loi de finances",
  LOI_FINANCES_COMPL: "Loi de finances complémentaire",
  LOI: "Loi",
  ORDONNANCE: "Ordonnance",
  DECRET_PRESIDENTIEL: "Décret présidentiel",
  DECRET_EXECUTIF: "Décret exécutif",
  ARRETE: "Arrêté",
  DECISION: "Décision",
  CIRCULAIRE: "Circulaire",
  INSTRUCTION: "Instruction",
  NOTE: "Note",
  CONVENTION: "Convention collective",
  OTHER: "Autre texte",
};

export const legalDocTypeLabel = (v: string) => TYPE_LABELS[v as LegalDocType] ?? v;

export const LEGAL_DOC_LANGUAGES = ["FR", "AR", "FR_AR", "OTHER"] as const;
export type LegalDocLanguage = (typeof LEGAL_DOC_LANGUAGES)[number];

const LANGUAGE_LABELS: Record<LegalDocLanguage, string> = {
  FR: "Français",
  AR: "Arabe",
  FR_AR: "Français et arabe",
  OTHER: "Autre",
};

export const legalDocLanguageLabel = (v: string) => LANGUAGE_LABELS[v as LegalDocLanguage] ?? v;

export type LegalDocStatus = "ACTIVE" | "SUPERSEDED" | "WITHDRAWN";

const STATUS_LABELS: Record<LegalDocStatus, string> = {
  ACTIVE: "En vigueur au registre",
  SUPERSEDED: "Version corrigée depuis",
  WITHDRAWN: "Retiré",
};

export const legalDocStatusLabel = (v: string) => STATUS_LABELS[v as LegalDocStatus] ?? v;

/** Mirrors ref_legal_doc_entry_path: how the values of a text may be entered, by application period. */
export type EntryPath = "MANUAL" | "AI_ALLOWED" | "D15";

export function entryPathOf(appliesFrom: string, appliesTo: string | null): EntryPath {
  if (appliesTo && appliesTo < "2026-01-01") return "MANUAL";
  if (appliesFrom >= "2026-01-01") return "AI_ALLOWED";
  return "D15";
}

const ENTRY_PATH_LABELS: Record<EntryPath, string> = {
  MANUAL: "Saisie manuelle (application entièrement antérieure à 2026)",
  AI_ALLOWED: "Saisie manuelle ou extraction IA (textes officiels, application à partir de 2026)",
  D15: "À cheval sur 2025 et 2026 : voie de saisie à décider (décision D15)",
};

export const entryPathLabel = (v: string) => ENTRY_PATH_LABELS[v as EntryPath] ?? v;

export const IMPORT_NOTICE =
  "Importer un document n'a aucun effet sur les règles ni sur la paie : les valeurs sont saisies dans une proposition qui cite le document, puis approuvées.";

export type LegalCitationRef = { proposal_id: string; title: string; family: string; status: string; article: string; page: number };

export type LegalDocument = {
  id: string;
  root_id: string;
  version_no: number;
  supersedes_id: string | null;
  doc_type: string;
  title: string;
  reference: string;
  jo_number: string | null;
  jo_date: string | null;
  publication_date: string | null;
  applies_from: string;
  applies_to: string | null;
  entry_path: EntryPath;
  language: string;
  origin: string;
  source_url: string | null;
  notes: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  correction_reason: string | null;
  status: LegalDocStatus;
  withdrawn_reason: string | null;
  withdrawn_at: string | null;
  withdrawn_by: string | null;
  created_by: string | null;
  created_at: string;
  citations: LegalCitationRef[];
};

/** A register entry: its current (or last) version and the previous ones, newest first. */
export type LegalDocumentGroup = { current: LegalDocument; history: LegalDocument[] };

export type CitationView = {
  id: string;
  document_id: string;
  root_id: string;
  version_no: number;
  latest_version_no: number;
  doc_type: string;
  title: string;
  reference: string;
  applies_from: string;
  applies_to: string | null;
  status: LegalDocStatus;
  withdrawn_reason: string | null;
  article: string;
  page: number;
  excerpt: string;
};

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
const str = (v: unknown) => (typeof v === "string" ? v : null);
const day = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 10) : null);
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const status = (v: unknown): LegalDocStatus => (v === "SUPERSEDED" || v === "WITHDRAWN" ? v : "ACTIVE");
const rows = (v: unknown) => (Array.isArray(v) ? v.map(obj).filter((x): x is Record<string, unknown> => x !== null) : []);

export function parseLegalDocuments(raw: unknown): LegalDocument[] {
  return rows(raw).flatMap((r) => {
    const id = str(r.id);
    const from = day(r.applies_from);
    if (!id || !from) return [];
    const to = day(r.applies_to);
    const path = str(r.entry_path);
    return [
      {
        id,
        root_id: str(r.root_id) ?? id,
        version_no: num(r.version_no) || 1,
        supersedes_id: str(r.supersedes_id),
        doc_type: str(r.doc_type) ?? "OTHER",
        title: str(r.title) ?? "",
        reference: str(r.reference) ?? "",
        jo_number: str(r.jo_number),
        jo_date: day(r.jo_date),
        publication_date: day(r.publication_date),
        applies_from: from,
        applies_to: to,
        entry_path: path === "MANUAL" || path === "AI_ALLOWED" || path === "D15" ? path : entryPathOf(from, to),
        language: str(r.language) ?? "FR",
        origin: str(r.origin) ?? "",
        source_url: str(r.source_url),
        notes: str(r.notes),
        file_name: str(r.file_name) ?? "",
        mime_type: str(r.mime_type) ?? "",
        size_bytes: num(r.size_bytes),
        sha256: str(r.sha256) ?? "",
        correction_reason: str(r.correction_reason),
        status: status(r.status),
        withdrawn_reason: str(r.withdrawn_reason),
        withdrawn_at: str(r.withdrawn_at),
        withdrawn_by: str(r.withdrawn_by),
        created_by: str(r.created_by),
        created_at: str(r.created_at) ?? "",
        citations: rows(r.citations).map((c) => ({
          proposal_id: str(c.proposal_id) ?? "",
          title: str(c.title) ?? "",
          family: str(c.family) ?? "",
          status: str(c.status) ?? "",
          article: str(c.article) ?? "",
          page: num(c.page),
        })),
      },
    ];
  });
}

export function groupLegalDocuments(docs: LegalDocument[]): LegalDocumentGroup[] {
  const byRoot = new Map<string, LegalDocument[]>();
  for (const d of docs) byRoot.set(d.root_id, [...(byRoot.get(d.root_id) ?? []), d]);
  return [...byRoot.values()]
    .map((versions) => {
      const sorted = [...versions].sort((a, b) => b.version_no - a.version_no);
      return { current: sorted[0], history: sorted.slice(1) };
    })
    .sort((a, b) => b.current.applies_from.localeCompare(a.current.applies_from) || a.current.title.localeCompare(b.current.title));
}

export function parseCitations(raw: unknown): CitationView[] {
  return rows(raw).flatMap((r) => {
    const id = str(r.id);
    const doc = str(r.document_id);
    if (!id || !doc) return [];
    const version = num(r.version_no) || 1;
    return [
      {
        id,
        document_id: doc,
        root_id: str(r.root_id) ?? doc,
        version_no: version,
        latest_version_no: num(r.latest_version_no) || version,
        doc_type: str(r.doc_type) ?? "OTHER",
        title: str(r.title) ?? "",
        reference: str(r.reference) ?? "",
        applies_from: day(r.applies_from) ?? "",
        applies_to: day(r.applies_to),
        status: status(r.status),
        withdrawn_reason: str(r.withdrawn_reason),
        article: str(r.article) ?? "",
        page: num(r.page),
        excerpt: str(r.excerpt) ?? "",
      },
    ];
  });
}

export function parseWarnings(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((w): w is string => typeof w === "string" && w.length > 0) : [];
}

const frDay = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

export function applicationPeriodLabel(from: string, to: string | null): string {
  return to ? `du ${frDay(from)} au ${frDay(to)}` : `à partir du ${frDay(from)} (fin non fixée)`;
}

export function appliesOn(doc: { applies_from: string; applies_to: string | null }, iso: string): boolean {
  return doc.applies_from <= iso && (doc.applies_to == null || doc.applies_to >= iso);
}

/**
 * Documents in force at the register for each month of a year (active versions whose application period overlaps
 * the month). A month without any document is shown as such; it proves nothing about the law.
 */
export function monthlyCoverage(docs: LegalDocument[], year: number): number[] {
  const active = docs.filter((d) => d.status === "ACTIVE");
  return Array.from({ length: 12 }, (_, i) => {
    const start = `${year}-${String(i + 1).padStart(2, "0")}-01`;
    const end = new Date(Date.UTC(year, i + 1, 0)).toISOString().slice(0, 10);
    return active.filter((d) => d.applies_from <= end && (d.applies_to == null || d.applies_to >= start)).length;
  });
}

export function fileSizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
  return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

export const citationSchema = z.object({
  document_id: z.string().uuid("Choisissez un document du registre."),
  article: z.string().trim().min(1, "Article requis.").max(120, "Article : 120 caractères maximum."),
  page: z.coerce.number().int("Page : nombre entier.").min(1, "Page requise (1 ou plus).").max(5000),
  excerpt: z
    .string()
    .trim()
    .min(10, "Extrait du texte requis (10 caractères minimum).")
    .max(2000, "Extrait : 2000 caractères maximum."),
});
export type CitationInput = z.infer<typeof citationSchema>;

export const citationsSchema = z
  .array(citationSchema)
  .min(1, "Citez au moins un document du registre des documents juridiques (article, page, extrait).")
  .max(20, "20 justificatifs au plus.");

export const emptyCitation = (): CitationInput => ({ document_id: "", article: "", page: 1, excerpt: "" });

/** Metadata of an entry, as the import and correction forms send it. */
export const legalDocMetaSchema = z
  .object({
    doc_type: z.enum(LEGAL_DOC_TYPES),
    title: z.string().trim().min(3, "Intitulé requis (3 caractères minimum).").max(300),
    reference: z.string().trim().min(3, "Référence requise : numéro et date du texte.").max(200),
    jo_number: z.string().trim().max(40).default(""),
    jo_date: z.string().default(""),
    publication_date: z.string().default(""),
    applies_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Début de la période d'application requis."),
    applies_to: z.string().default(""),
    language: z.enum(LEGAL_DOC_LANGUAGES),
    origin: z.string().trim().min(3, "Provenance requise : organisme, site officiel ou transmission.").max(200),
    source_url: z
      .string()
      .trim()
      .max(500)
      .default("")
      .refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "Lien de la source : adresse https:// valide."),
    notes: z.string().trim().max(1000).default(""),
  })
  .refine((v) => !v.applies_to || v.applies_to >= v.applies_from, {
    message: "Fin de la période d'application antérieure à son début.",
  });
export type LegalDocMeta = z.infer<typeof legalDocMetaSchema>;

export const emptyLegalDocMeta = (): LegalDocMeta => ({
  doc_type: "LOI_FINANCES",
  title: "",
  reference: "",
  jo_number: "",
  jo_date: "",
  publication_date: "",
  applies_from: "",
  applies_to: "",
  language: "FR",
  origin: "",
  source_url: "",
  notes: "",
});

export function metaOf(d: LegalDocument): LegalDocMeta {
  return {
    doc_type: (LEGAL_DOC_TYPES as readonly string[]).includes(d.doc_type) ? (d.doc_type as LegalDocType) : "OTHER",
    title: d.title,
    reference: d.reference,
    jo_number: d.jo_number ?? "",
    jo_date: d.jo_date ?? "",
    publication_date: d.publication_date ?? "",
    applies_from: d.applies_from,
    applies_to: d.applies_to ?? "",
    language: (LEGAL_DOC_LANGUAGES as readonly string[]).includes(d.language) ? (d.language as LegalDocLanguage) : "OTHER",
    origin: d.origin,
    source_url: d.source_url ?? "",
    notes: d.notes ?? "",
  };
}

/** Short label used in pickers and citation lists. */
export function legalDocShortLabel(d: { doc_type: string; reference: string; title: string; version_no?: number }): string {
  const v = d.version_no && d.version_no > 1 ? ` (v${d.version_no})` : "";
  return `${legalDocTypeLabel(d.doc_type)} · ${d.reference}${v} — ${d.title}`;
}
