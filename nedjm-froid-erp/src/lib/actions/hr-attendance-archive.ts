"use server";

import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { createClient } from "@/lib/supabase/server";
import {
  ARCHIVE_BUCKET,
  ARCHIVE_PIECE_MAX_BYTES,
  ARCHIVE_PIECE_MIME,
  ARCHIVE_SOURCE_MAX_BYTES,
  CSV_MIME,
  PIECE_EXT,
  XLSX_MIME,
  archiveMetaSchema,
  chunk,
  decodeCsv,
  detectDelimiter,
  matchArchiveLinesByName,
  parseArchiveAnalysis,
  parseCsv,
  parseGridArchive,
  parseRowsArchive,
  type ArchiveAnalysis,
  type ArchiveParseResult,
} from "@/lib/hr/attendance-archive";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = z.string().regex(UUID_RE, "Identifiant invalide.");
const reason = z.string().trim().min(10, "Motif obligatoire (10 caractères minimum).").max(500);

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type ArchiveAccess = {
  read: boolean;
  create: boolean;
  cancel: boolean;
  validate: boolean;
  isSuperAdmin: boolean;
  userId: string;
  /** D11 decision right: confirm or revoke code correspondence policies. */
  mappingDecider: boolean;
  /** D12: null = never decided (the author may not validate). */
  importerMayValidate: boolean | null;
  policyDecidedAt: string | null;
};

export type ArchiveBatch = {
  id: string;
  batch_no: string;
  format: string;
  period_from: string;
  period_to: string;
  reference_year: number;
  site_ids: string[];
  site_names: string[];
  nature: string;
  provenance_kind: string;
  provenance_detail: string;
  source_produced_on: string | null;
  comment: string | null;
  control_lines: number | null;
  control_employees: number | null;
  file_name: string;
  mime: string;
  size_bytes: number;
  sha256: string;
  duplicate_of: string | null;
  parse_report: Record<string, unknown>;
  code_map: Record<string, string>;
  lines_expected: number;
  sealed: boolean;
  status: string;
  analysis: ArchiveAnalysis;
  analyzed_at: string | null;
  lines_read: number;
  lines_accepted: number;
  lines_rejected: number;
  lines_imported: number;
  lines_validated: number;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  imported_at: string | null;
  imported_by_name: string | null;
  validated_at: string | null;
  validated_by_name: string | null;
  closed_at: string | null;
  closed_by_name: string | null;
  close_reason: string | null;
};

export type ArchiveDocument = {
  id: string;
  file_name: string;
  mime: string;
  size_bytes: number;
  sha256: string;
  description: string | null;
  uploaded_at: string;
  uploaded_by_name: string | null;
};

export type ArchiveLineRow = {
  id: string;
  line_no: number;
  source_ref: string;
  kind: string;
  matricule: string;
  last_name: string | null;
  first_name: string | null;
  raw_date: string | null;
  work_date: string | null;
  site_code: string | null;
  source_code: string | null;
  hours: Record<string, number>;
  employee_name: string | null;
  site_name: string | null;
  legend_code: string | null;
  code_origin: string | null;
  status: string;
  errors: string[];
  warnings: string[];
  conflict_kinds: string[];
  existing: { site_id: string; site_name: string | null; legend_code: string; status_code: string; source_code: string }[];
  resolution: string | null;
};

export type ArchiveDecisionRef = { id: string; type_code: string; status: string; chosen_option: string | null };

export type ArchiveDetail = {
  batch: ArchiveBatch;
  documents: ArchiveDocument[];
  decisions: ArchiveDecisionRef[];
};

export type CodeMapping = {
  id: string;
  source_code: string;
  legend_code: string;
  status: string;
  batch_no: string | null;
  decision_id: string;
  created_at: string;
  confirmed_at: string | null;
  confirmed_by_name: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
};

type NameJoin = { full_name: string | null } | { full_name: string | null }[] | null;
const nameOf = (v: NameJoin) => (Array.isArray(v) ? v[0] : v)?.full_name ?? null;
const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function revalidateArchives() {
  revalidatePath("/rh/presence/imports");
  revalidatePath("/rh/presence");
  revalidatePath("/rh/paie");
  revalidatePath("/decisions");
}

async function has(supabase: Supabase, screen: string, action: "read" | "create" | "update") {
  const { data } = await supabase.rpc("hr_att_import_has", { p_screen: screen, p_action: action });
  return data === true;
}

export async function getArchiveAccess(): Promise<ActionResult<ArchiveAccess>> {
  const ws = await getWorkspaceProfile();
  if (!ws) return { ok: false, error: "Session requise. · يلزم تسجيل الدخول." };
  const supabase = await createClient();
  const [read, create, cancel, validateRead, validate, d11, policy] = await Promise.all([
    has(supabase, "hr_attendance_import", "read"),
    has(supabase, "hr_attendance_import", "create"),
    has(supabase, "hr_attendance_import", "update"),
    has(supabase, "hr_attendance_import_validate", "read"),
    has(supabase, "hr_attendance_import_validate", "update"),
    supabase.rpc("sys_decision_can_decide", { p_type: "D11" }),
    supabase.from("hr_attendance_import_policy").select("importer_may_validate, decided_at").maybeSingle(),
  ]);
  return {
    ok: true,
    data: {
      read: ws.isSuperAdmin || read || create || validateRead || validate,
      create: ws.isSuperAdmin || create,
      cancel: ws.isSuperAdmin || cancel,
      validate: ws.isSuperAdmin || validate,
      isSuperAdmin: ws.isSuperAdmin,
      userId: ws.id,
      mappingDecider: d11.data === true,
      importerMayValidate: policy.data ? policy.data.importer_may_validate === true : null,
      policyDecidedAt: policy.data?.decided_at ?? null,
    },
  };
}

const BATCH_SELECT = `id, batch_no, format, period_from, period_to, reference_year, site_ids, nature, provenance_kind,
  provenance_detail, source_produced_on, comment, control_lines, control_employees, file_name, mime, size_bytes, sha256,
  duplicate_of, parse_report, code_map, lines_expected, sealed_at, status, analysis, analyzed_at, lines_read,
  lines_accepted, lines_rejected, lines_imported, lines_validated, created_by, created_at, imported_at, validated_at,
  closed_at, close_reason,
  creator:sys_users!created_by ( full_name ),
  importer:sys_users!imported_by ( full_name ),
  validator:sys_users!validated_by ( full_name ),
  closer:sys_users!closed_by ( full_name )`;

type RawBatch = Omit<
  ArchiveBatch,
  "site_names" | "sealed" | "analysis" | "created_by_name" | "imported_by_name" | "validated_by_name" | "closed_by_name"
> & {
  sealed_at: string | null;
  analysis: unknown;
  creator: NameJoin;
  importer: NameJoin;
  validator: NameJoin;
  closer: NameJoin;
};

async function siteNames(supabase: Supabase, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const { data } = await supabase.from("ref_sites").select("id, name_fr").in("id", ids);
  return new Map((data ?? []).map((s) => [s.id as string, s.name_fr as string]));
}

function toBatch(r: RawBatch, names: Map<string, string>): ArchiveBatch {
  return {
    ...r,
    site_ids: r.site_ids ?? [],
    site_names: (r.site_ids ?? []).map((id) => names.get(id) ?? "?"),
    parse_report: rec(r.parse_report),
    code_map: Object.fromEntries(Object.entries(rec(r.code_map)).map(([k, v]) => [k, String(v)])),
    sealed: Boolean(r.sealed_at),
    analysis: parseArchiveAnalysis(r.analysis),
    size_bytes: Number(r.size_bytes),
    created_by_name: nameOf(r.creator),
    imported_by_name: nameOf(r.importer),
    validated_by_name: nameOf(r.validator),
    closed_by_name: nameOf(r.closer),
  };
}

export async function listArchiveBatches(): Promise<ActionResult<ArchiveBatch[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_attendance_import_batches")
    .select(BATCH_SELECT)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as unknown as RawBatch[];
  const names = await siteNames(supabase, [...new Set(rows.flatMap((r) => r.site_ids ?? []))]);
  return { ok: true, data: rows.map((r) => toBatch(r, names)) };
}

export async function getArchiveDetail(id: string): Promise<ActionResult<ArchiveDetail>> {
  if (!UUID_RE.test(id)) return { ok: false, error: "Lot introuvable." };
  const supabase = await createClient();
  const [batch, docs, decisions] = await Promise.all([
    supabase.from("hr_attendance_import_batches").select(BATCH_SELECT).eq("id", id).maybeSingle(),
    supabase
      .from("hr_attendance_import_documents")
      .select("id, file_name, mime, size_bytes, sha256, description, uploaded_at, uploader:sys_users!uploaded_by ( full_name )")
      .eq("batch_id", id)
      .order("uploaded_at"),
    supabase
      .from("sys_decisions")
      .select("id, type_code, status, chosen_option, requested_at")
      .in("dedupe_key", [`D5:${id}`, `D11:${id}`])
      .order("requested_at", { ascending: false })
      .limit(20),
  ]);
  if (batch.error) return { ok: false, error: batch.error.message };
  if (!batch.data) return { ok: false, error: "Lot introuvable ou non visible avec vos droits." };
  const raw = batch.data as unknown as RawBatch;
  const names = await siteNames(supabase, raw.site_ids ?? []);
  return {
    ok: true,
    data: {
      batch: toBatch(raw, names),
      documents: ((docs.data ?? []) as unknown as (Omit<ArchiveDocument, "uploaded_by_name"> & { uploader: NameJoin })[]).map(
        (d) => ({ ...d, size_bytes: Number(d.size_bytes), uploaded_by_name: nameOf(d.uploader) }),
      ),
      decisions: (decisions.data ?? []).map((d) => ({
        id: d.id as string,
        type_code: d.type_code as string,
        status: d.status as string,
        chosen_option: (d.chosen_option as string | null) ?? null,
      })),
    },
  };
}

/** Batch opened from a decision (D5 « trancher ligne par ligne » follow-up). */
export async function archiveBatchOfDecision(decisionId: string): Promise<string | null> {
  if (!UUID_RE.test(decisionId)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("sys_decisions").select("scope, type_code").eq("id", decisionId).maybeSingle();
  const batch = rec(data?.scope).batch_id;
  return typeof batch === "string" && UUID_RE.test(batch) ? batch : null;
}

const LINE_PAGE = 200;
const linesSchema = z.object({
  id: uuid,
  status: z.enum(["ALL", "OK", "WARNING", "ERROR", "DUPLICATE", "SAME", "CONFLICT"]).default("ALL"),
  page: z.number().int().min(0).max(10000).default(0),
});

export async function listArchiveLines(
  input: unknown,
): Promise<ActionResult<{ rows: ArchiveLineRow[]; total: number; pageSize: number }>> {
  const parsed = linesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Filtre invalide." };
  const p = parsed.data;
  const supabase = await createClient();
  let q = supabase
    .from("hr_attendance_import_lines")
    .select(
      `id, line_no, source_ref, kind, matricule, last_name, first_name, raw_date, work_date, site_code, source_code, hours,
       legend_code, code_origin, status, errors, warnings, conflict_kinds, existing, resolution,
       employee:hr_employees ( last_name, first_name ), site:ref_sites ( name_fr )`,
      { count: "exact" },
    )
    .eq("batch_id", p.id)
    .order("line_no")
    .order("source_ref")
    .range(p.page * LINE_PAGE, p.page * LINE_PAGE + LINE_PAGE - 1);
  if (p.status !== "ALL") q = q.eq("status", p.status);
  const { data, error, count } = await q;
  if (error) return { ok: false, error: error.message };
  type Raw = Omit<ArchiveLineRow, "employee_name" | "site_name" | "existing"> & {
    existing: unknown;
    employee: { last_name: string; first_name: string } | { last_name: string; first_name: string }[] | null;
    site: { name_fr: string } | { name_fr: string }[] | null;
  };
  const rows = (data ?? []) as unknown as Raw[];
  const existingSites = [
    ...new Set(
      rows.flatMap((r) => (Array.isArray(r.existing) ? r.existing : []).map((e) => String(rec(e).site_id ?? ""))),
    ),
  ].filter((s) => UUID_RE.test(s));
  const names = await siteNames(supabase, existingSites);
  return {
    ok: true,
    data: {
      total: count ?? rows.length,
      pageSize: LINE_PAGE,
      rows: rows.map((r) => {
        const emp = Array.isArray(r.employee) ? r.employee[0] : r.employee;
        const site = Array.isArray(r.site) ? r.site[0] : r.site;
        const { employee: _e, site: _s, ...rest } = r;
        void _e;
        void _s;
        return {
          ...rest,
          hours: Object.fromEntries(Object.entries(rec(r.hours)).map(([k, v]) => [k, Number(v)])),
          employee_name: emp ? `${emp.last_name} ${emp.first_name}` : null,
          site_name: site?.name_fr ?? null,
          existing: (Array.isArray(r.existing) ? r.existing : []).map((e) => {
            const x = rec(e);
            const siteId = String(x.site_id ?? "");
            return {
              site_id: siteId,
              site_name: names.get(siteId) ?? null,
              legend_code: String(x.legend_code ?? ""),
              status_code: String(x.status_code ?? ""),
              source_code: String(x.source_code ?? ""),
            };
          }),
        };
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Deposit: signed upload, then the server reads the file back (hash, parsing) and loads the staging lines
// ---------------------------------------------------------------------------
const prepareSchema = z.object({
  ext: z.enum(["xlsx", "csv"], "Format accepté : classeur Excel .xlsx ou fichier CSV UTF-8."),
  size: z.number().int().positive().max(ARCHIVE_SOURCE_MAX_BYTES, "Fichier trop volumineux (10 Mo maximum)."),
});

export async function prepareArchiveUpload(input: unknown): Promise<ActionResult<{ path: string; token: string }>> {
  const parsed = prepareSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Fichier invalide." };
  const supabase = await createClient();
  const path = `${crypto.randomUUID()}/source.${parsed.data.ext}`;
  const { data, error } = await supabase.storage.from(ARCHIVE_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: error?.message ?? "Envoi refusé." };
  return { ok: true, data: { path, token: data.token } };
}

function sheetToMatrix(ws: ExcelJS.Worksheet): unknown[][] {
  const rows: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    rows[rowNumber - 1] = Array.isArray(row.values) ? row.values.slice(1) : [];
  });
  return Array.from(rows, (r) => r ?? []);
}

async function parseSource(
  bytes: Buffer,
  ext: "xlsx" | "csv",
  format: "GRID" | "ROWS",
  periodFrom: string,
  sheetName: string,
): Promise<ArchiveParseResult & { sheet?: string; delimiter?: string }> {
  let matrix: unknown[][];
  let sheet: string | undefined;
  let delimiter: string | undefined;
  if (ext === "xlsx") {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    } catch {
      return { ok: false, error: "Classeur Excel illisible." };
    }
    const ws = sheetName ? wb.worksheets.find((w) => w.name === sheetName) : wb.worksheets[0];
    if (!ws) return { ok: false, error: sheetName ? `Feuille « ${sheetName} » introuvable.` : "Classeur sans feuille." };
    sheet = ws.name;
    matrix = sheetToMatrix(ws);
  } else {
    const decoded = decodeCsv(new Uint8Array(bytes));
    if (!decoded.ok) return decoded;
    delimiter = detectDelimiter(decoded.text);
    matrix = parseCsv(decoded.text, delimiter);
  }
  const result =
    format === "GRID"
      ? parseGridArchive(matrix, { year: Number(periodFrom.slice(0, 4)), month: Number(periodFrom.slice(5, 7)) })
      : parseRowsArchive(matrix);
  return { ...result, sheet, delimiter };
}

const registerSchema = z.object({
  path: z.string().regex(/^[0-9a-f-]{36}\/source\.(xlsx|csv)$/, "Chemin de fichier invalide."),
  file_name: z.string().trim().min(1).max(200),
  meta: archiveMetaSchema,
});

export async function registerArchiveBatch(
  input: unknown,
): Promise<ActionResult<{ id: string; analysis: ArchiveAnalysis | null; warning: string | null }>> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  const { path, file_name, meta } = parsed.data;
  const ext = path.endsWith(".csv") ? "csv" : "xlsx";
  const supabase = await createClient();
  const { data: blob, error: dlErr } = await supabase.storage.from(ARCHIVE_BUCKET).download(path);
  if (dlErr || !blob) return { ok: false, error: "Fichier non reçu : réessayez l'envoi." };
  const bytes = Buffer.from(await blob.arrayBuffer());
  if (bytes.byteLength > ARCHIVE_SOURCE_MAX_BYTES) return { ok: false, error: "Fichier trop volumineux (10 Mo maximum)." };
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const parsedFile = await parseSource(bytes, ext, meta.format, meta.period_from, ext === "xlsx" ? meta.sheet : "");
  if (!parsedFile.ok) return { ok: false, error: parsedFile.error };
  if (meta.match_by === "NAME") {
    const { data: staff, error: staffErr } = await supabase
      .from("hr_employees")
      .select("matricule, last_name, first_name")
      .limit(10000);
    if (staffErr) return { ok: false, error: staffErr.message };
    parsedFile.lines = matchArchiveLinesByName(parsedFile.lines, staff ?? []);
  }

  const { data: id, error } = await supabase.rpc("hr_attendance_import_create", {
    p_path: path,
    p_name: file_name,
    p_mime: ext === "csv" ? CSV_MIME : XLSX_MIME,
    p_size: bytes.byteLength,
    p_sha256: sha256,
    p: {
      format: meta.format,
      period_from: `${meta.period_from}-01`,
      period_to: `${meta.period_to}-01`,
      reference_year: meta.reference_year,
      site_ids: meta.site_ids,
      provenance_kind: meta.provenance_kind,
      provenance_detail: meta.provenance_detail,
      source_produced_on: meta.source_produced_on || null,
      comment: meta.comment || null,
      control_lines: meta.control_lines,
      control_employees: meta.control_employees,
    },
    p_parse: {
      ...parsedFile.report,
      sheet: parsedFile.sheet ?? null,
      delimiter: parsedFile.delimiter ?? null,
      match_by: meta.match_by,
    },
    p_expected: parsedFile.lines.length,
  });
  revalidateArchives();
  if (error) return { ok: false, error: error.message };
  const batchId = String(id);
  for (const part of chunk(parsedFile.lines)) {
    const { error: lineErr } = await supabase.rpc("hr_attendance_import_add_lines", { p_batch: batchId, p_lines: part });
    if (lineErr) {
      return {
        ok: true,
        data: {
          id: batchId,
          analysis: null,
          warning: `Lot créé, mais toutes les lignes n'ont pas pu être transmises (${lineErr.message}). Rejetez-le et déposez à nouveau le fichier.`,
        },
      };
    }
  }
  const { data: analysis, error: anErr } = await supabase.rpc("hr_attendance_import_analyze", { p_batch: batchId });
  if (anErr) return { ok: true, data: { id: batchId, analysis: null, warning: `Lot créé ; analyse impossible : ${anErr.message}` } };
  return { ok: true, data: { id: batchId, analysis: parseArchiveAnalysis(analysis), warning: null } };
}

export async function analyzeArchiveBatch(id: string): Promise<ActionResult<ArchiveAnalysis>> {
  if (!UUID_RE.test(id)) return { ok: false, error: "Lot invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_attendance_import_analyze", { p_batch: id });
  revalidateArchives();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: parseArchiveAnalysis(data) };
}

/** Codes of the file absent from the reference list, with their number of lines (D11 request form). */
export async function listUnknownCodes(id: string): Promise<ActionResult<{ code: string; lines: number }[]>> {
  if (!UUID_RE.test(id)) return { ok: false, error: "Lot invalide." };
  const supabase = await createClient();
  const counts = new Map<string, number>();
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await supabase
      .from("hr_attendance_import_lines")
      .select("source_code")
      .eq("batch_id", id)
      .eq("kind", "DAY")
      .contains("errors", ["UNKNOWN_CODE"])
      .order("id")
      .range(from, from + 999);
    if (error) return { ok: false, error: error.message };
    for (const r of data ?? []) {
      const code = String(r.source_code ?? "").trim().toUpperCase();
      if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    if (!data || data.length < 1000) break;
  }
  return {
    ok: true,
    data: [...counts].map(([code, lines]) => ({ code, lines })).sort((a, b) => b.lines - a.lines || a.code.localeCompare(b.code)),
  };
}

export type NameReviewRow = {
  source_name: string;
  lines: number;
  employee_id: string | null;
  matricule: string | null;
  employee_name: string | null;
};

/** Names of the batch left without an employee, then the names already tied to one by hand. */
export async function listArchiveNameReview(id: string): Promise<ActionResult<NameReviewRow[]>> {
  if (!UUID_RE.test(id)) return { ok: false, error: "Lot invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_attendance_import_name_review", { p_batch: id });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      source_name: String(r.source_name ?? ""),
      lines: Number(r.lines ?? 0),
      employee_id: r.employee_id ? String(r.employee_id) : null,
      matricule: r.matricule ? String(r.matricule) : null,
      employee_name: r.employee_name ? String(r.employee_name) : null,
    })),
  };
}

export type ArchiveEmployeeOption = { id: string; matricule: string; last_name: string; first_name: string };

export async function listArchiveEmployees(): Promise<ActionResult<ArchiveEmployeeOption[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_employees")
    .select("id, matricule, last_name, first_name")
    .order("last_name")
    .limit(10000);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as ArchiveEmployeeOption[] };
}

const aliasSchema = z.object({
  batchId: uuid,
  name: z.string().trim().min(1).max(240),
  employeeId: uuid.nullable(),
});

/** Ties a name of the file to an employee for this and every later import (null unties it); the batch is analysed again. */
export async function setArchiveNameAlias(input: unknown): Promise<ActionResult<ArchiveAnalysis>> {
  const parsed = aliasSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_attendance_import_set_alias", {
    p_batch: parsed.data.batchId,
    p_name: parsed.data.name,
    p_employee: parsed.data.employeeId,
  });
  revalidateArchives();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: parseArchiveAnalysis(data) };
}

const mappingSchema = z.object({
  id: uuid,
  map: z.record(z.string().trim().min(1).max(16), z.string().trim().min(1).max(16)),
  reason,
});

export async function requestArchiveMapping(input: unknown): Promise<ActionResult<{ decisionId: string }>> {
  const parsed = mappingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Correspondance invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_attendance_import_request_mapping", {
    p_batch: parsed.data.id,
    p_map: parsed.data.map,
    p_reason: parsed.data.reason,
  });
  revalidateArchives();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { decisionId: String(data) } };
}

const resolveSchema = z.object({
  decisionId: uuid,
  lines: z.array(z.object({ id: uuid, resolution: z.enum(["IMPORT", "KEEP"]) })).min(1).max(2000),
});

export async function resolveArchiveConflicts(input: unknown): Promise<ActionResult<{ updated: number; remaining: number }>> {
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Choix invalides." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_attendance_import_resolve_lines", {
    p_decision: parsed.data.decisionId,
    p_lines: parsed.data.lines,
  });
  revalidateArchives();
  if (error) return { ok: false, error: error.message };
  const r = rec(data);
  return { ok: true, data: { updated: Number(r.updated ?? 0), remaining: Number(r.remaining ?? 0) } };
}

export type CommitOutcome =
  | { imported: true; count: number; replaced: number }
  | { imported: false; unresolved: number };

export async function commitArchiveBatch(input: { id: string; ackRejected: boolean }): Promise<ActionResult<CommitOutcome>> {
  if (!UUID_RE.test(input.id)) return { ok: false, error: "Lot invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_attendance_import_commit", {
    p_batch: input.id,
    p_ack_rejected: input.ackRejected === true,
  });
  revalidateArchives();
  if (error) return { ok: false, error: error.message };
  const r = rec(data);
  if (r.ok !== true) return { ok: true, data: { imported: false, unresolved: Number(r.unresolved ?? 0) } };
  return { ok: true, data: { imported: true, count: Number(r.imported ?? 0), replaced: Number(r.replaced ?? 0) } };
}

export async function validateArchiveBatch(
  id: string,
): Promise<ActionResult<{ validated: number; modified: number; generationRequests: number; flaggedRuns: number }>> {
  if (!UUID_RE.test(id)) return { ok: false, error: "Lot invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_attendance_import_validate", { p_batch: id });
  revalidateArchives();
  if (error) return { ok: false, error: error.message };
  const r = rec(data);
  const signals = Array.isArray(r.signals) ? r.signals.map(rec) : [];
  return {
    ok: true,
    data: {
      validated: Number(r.validated ?? 0),
      modified: Number(r.modified_since_import ?? 0),
      generationRequests: signals.filter((s) => typeof s.generation_decision === "string").length,
      flaggedRuns: signals.reduce((n, s) => n + Number(s.flagged_runs ?? 0), 0),
    },
  };
}

export async function cancelArchiveBatch(input: {
  id: string;
  reason: string;
}): Promise<ActionResult<{ status: string; removed: number; restored: number }>> {
  const parsed = z.object({ id: uuid, reason }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_attendance_import_cancel", {
    p_batch: parsed.data.id,
    p_reason: parsed.data.reason,
  });
  revalidateArchives();
  if (error) return { ok: false, error: error.message };
  const r = rec(data);
  return {
    ok: true,
    data: { status: String(r.status ?? ""), removed: Number(r.removed ?? 0), restored: Number(r.restored ?? 0) },
  };
}

// ---------------------------------------------------------------------------
// Supporting documents (scans of the paper register: kept as evidence, never read automatically)
// ---------------------------------------------------------------------------
const piecePrepareSchema = z.object({
  batchId: uuid,
  mime: z.enum(ARCHIVE_PIECE_MIME, "Format accepté : PDF, JPEG, PNG ou WebP."),
  size: z.number().int().positive().max(ARCHIVE_PIECE_MAX_BYTES, "Pièce trop volumineuse (20 Mo maximum)."),
});

export async function prepareArchivePieceUpload(input: unknown): Promise<ActionResult<{ path: string; token: string }>> {
  const parsed = piecePrepareSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Pièce invalide." };
  const supabase = await createClient();
  const path = `${parsed.data.batchId}/pieces/${crypto.randomUUID()}.${PIECE_EXT[parsed.data.mime]}`;
  const { data, error } = await supabase.storage.from(ARCHIVE_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: error?.message ?? "Envoi refusé." };
  return { ok: true, data: { path, token: data.token } };
}

const pieceSchema = z.object({
  batchId: uuid,
  path: z.string().regex(/^[0-9a-f-]{36}\/pieces\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/, "Chemin de pièce invalide."),
  file_name: z.string().trim().min(1).max(200),
  mime: z.enum(ARCHIVE_PIECE_MIME),
  description: z.string().trim().max(300),
});

export async function registerArchivePiece(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = pieceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  const p = parsed.data;
  if (!p.path.startsWith(`${p.batchId}/`) || !p.path.endsWith(`.${PIECE_EXT[p.mime]}`)) {
    return { ok: false, error: "Le fichier ne correspond pas au lot ou à son type." };
  }
  const supabase = await createClient();
  const { data: blob, error: dlErr } = await supabase.storage.from(ARCHIVE_BUCKET).download(p.path);
  if (dlErr || !blob) return { ok: false, error: "Pièce non reçue : réessayez l'envoi." };
  const bytes = Buffer.from(await blob.arrayBuffer());
  const { data, error } = await supabase.rpc("hr_attendance_import_add_document", {
    p_batch: p.batchId,
    p_path: p.path,
    p_name: p.file_name,
    p_mime: p.mime,
    p_size: bytes.byteLength,
    p_sha256: createHash("sha256").update(bytes).digest("hex"),
    p_description: p.description || null,
  });
  revalidateArchives();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: String(data) } };
}

/** Short-lived link to the source file (document id null) or to a supporting document. */
export async function getArchiveFileUrl(input: { batchId: string; documentId?: string | null }): Promise<ActionResult<{ url: string }>> {
  if (!UUID_RE.test(input.batchId) || (input.documentId && !UUID_RE.test(input.documentId))) {
    return { ok: false, error: "Fichier invalide." };
  }
  const supabase = await createClient();
  const { data: row, error } = input.documentId
    ? await supabase
        .from("hr_attendance_import_documents")
        .select("storage_path")
        .eq("id", input.documentId)
        .eq("batch_id", input.batchId)
        .maybeSingle()
    : await supabase.from("hr_attendance_import_batches").select("storage_path").eq("id", input.batchId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "Fichier introuvable." };
  const { data, error: urlErr } = await supabase.storage.from(ARCHIVE_BUCKET).createSignedUrl(row.storage_path as string, 120);
  if (urlErr || !data) return { ok: false, error: urlErr?.message ?? "Lien indisponible." };
  return { ok: true, data: { url: data.signedUrl } };
}

// ---------------------------------------------------------------------------
// D11 policies and D12 validation policy
// ---------------------------------------------------------------------------
export async function listCodeMappings(): Promise<ActionResult<CodeMapping[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_attendance_code_mappings")
    .select(
      `id, source_code, legend_code, status, decision_id, created_at, confirmed_at, revoked_at, revoke_reason,
       batch:hr_attendance_import_batches ( batch_no ), confirmer:sys_users!confirmed_by ( full_name )`,
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { ok: false, error: error.message };
  type Raw = Omit<CodeMapping, "batch_no" | "confirmed_by_name"> & {
    batch: { batch_no: string } | { batch_no: string }[] | null;
    confirmer: NameJoin;
  };
  return {
    ok: true,
    data: ((data ?? []) as unknown as Raw[]).map((m) => {
      const b = Array.isArray(m.batch) ? m.batch[0] : m.batch;
      const { batch: _b, confirmer, ...rest } = m;
      void _b;
      return { ...rest, batch_no: b?.batch_no ?? null, confirmed_by_name: nameOf(confirmer) };
    }),
  };
}

export async function confirmCodeMapping(id: string): Promise<ActionResult> {
  if (!UUID_RE.test(id)) return { ok: false, error: "Correspondance invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("hr_attendance_code_mapping_confirm", { p_id: id });
  revalidateArchives();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

export async function revokeCodeMapping(input: { id: string; reason: string }): Promise<ActionResult> {
  const parsed = z.object({ id: uuid, reason }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("hr_attendance_code_mapping_revoke", {
    p_id: parsed.data.id,
    p_reason: parsed.data.reason,
  });
  revalidateArchives();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

export async function requestImportPolicy(input: { reason: string }): Promise<ActionResult<{ decisionId: string }>> {
  const parsed = reason.safeParse(input.reason);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Motif invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_attendance_import_policy_request", { p_reason: parsed.data });
  revalidateArchives();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { decisionId: String(data) } };
}
