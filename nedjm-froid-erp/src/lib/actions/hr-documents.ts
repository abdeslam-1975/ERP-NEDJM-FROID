"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { htmlToPdf } from "@/lib/pdf/html-to-pdf";
import { archiveFileStem, hrPdfOptions, requestOrigin, uploadHrPdf } from "@/lib/pdf/print-archive";
import { hrCorrespondenceSchema, hrFileSchema } from "@/lib/validations/hr";
import {
  missionDateIssue,
  missionOrderFieldsSchema,
  missionPayload,
  pickMissionContract,
  todayIsoAlgiers,
  type MissionContractHint,
  type MissionOrderFields,
} from "@/lib/hr/mission-order";
import { leaveOfCorrespondence, leaveTitleFieldsSchema, leaveTitlePayload } from "@/lib/hr/leave-title";
import { companyLetterheadUrl } from "@/lib/hr/company-letterhead";
import { HR_DOCS_BUCKET, hrFileDisplayUrl, hrFileHref } from "@/lib/hr/hr-file-url";
import { buildMissionOrderHtml } from "@/components/rh/mission-order-print";
import { buildLeaveTitleHtml } from "@/components/rh/leave-title-print";
import { buildOfficialFicheHtml } from "@/components/rh/employee-fiche-print";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { listCatalogItems } from "@/lib/actions/hr-catalogs";
import { listSites } from "@/lib/actions/sites";
import { mergeAffectationCatalog } from "@/lib/hr/affectation-options";
import {
  getHrEmployeeFiche,
  listHrEmployeeFields,
} from "@/lib/actions/hr-employees";
import { getHrFicheSettings } from "@/lib/actions/hr-fiche";
import { DEFAULT_FICHE_SETTINGS } from "@/lib/hr/fiche-settings";
import { valuesFromFicheRecord } from "@/lib/hr/employee-field-utils";
import { buildFicheRenseignementsFileName } from "@/lib/hr/fiche-renseignements-pdf";
import { createLeaveRequest, decideLeaveRequest, listLeaveBalances } from "@/lib/actions/hr-leave";
import { calendarDays } from "@/lib/hr/leave";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type HrFileRow = {
  id: string;
  employee_id: string;
  doc_type_code: string;
  file_url: string | null;
  file_name: string | null;
  storage_path: string | null;
  issued_on: string | null;
  expires_on: string | null;
  notes: string | null;
  matricule: string;
  employee_name: string;
};

export type HrCorrespondenceRow = {
  id: string;
  employee_id: string;
  site_id: string | null;
  type_code: string;
  number: string;
  status_code: string;
  start_date: string | null;
  end_date: string | null;
  payload: Record<string, unknown>;
  created_at: string | null;
  created_by: string | null;
  created_by_name: string;
  last_name: string;
  first_name: string;
  matricule: string;
  employee_name: string;
  archive_url: string | null;
};

function textField(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" ? value : "";
}

function archiveUrlOf(payload: Record<string, unknown>) {
  return hrFileDisplayUrl(textField(payload, "archive_path"), textField(payload, "archive_url"));
}

/** Renders a print document to PDF and stores it in the HR bucket under `path`. */
async function archivePrintPdf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  html: string,
  origin: string,
  path: string,
): Promise<ActionResult> {
  const pdf = await htmlToPdf(html, hrPdfOptions(supabase, origin));
  const error = await uploadHrPdf(supabase, path, pdf);
  return error ? { ok: false, error } : { ok: true, data: undefined };
}

function revalidate() {
  revalidatePath("/rh");
  revalidatePath("/rh/documents");
  revalidatePath("/rh/employes");
  revalidatePath("/rh/presence");
}

function empName(row: {
  employee?:
    | { matricule?: string; last_name?: string; first_name?: string }
    | { matricule?: string; last_name?: string; first_name?: string }[]
    | null;
  payload?: Record<string, unknown> | null;
}) {
  const emp = Array.isArray(row.employee) ? row.employee[0] : row.employee;
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const last_name = emp?.last_name || textField(payload, "nom") || "";
  const first_name = emp?.first_name || textField(payload, "prenom") || "";
  return {
    matricule: emp?.matricule || textField(payload, "matricule") || "",
    last_name,
    first_name,
    employee_name: `${last_name} ${first_name}`.trim(),
  };
}

function mapCorrespondenceRow(row: {
  id: string;
  employee_id: string;
  site_id: string | null;
  type_code: string;
  number: string;
  status_code: string;
  start_date: string | null;
  end_date: string | null;
  payload?: Record<string, unknown> | null;
  created_at?: string | null;
  created_by?: string | null;
  creator?:
    | { full_name?: string; email?: string }
    | { full_name?: string; email?: string }[]
    | null;
  employee?:
    | { matricule?: string; last_name?: string; first_name?: string }
    | { matricule?: string; last_name?: string; first_name?: string }[]
    | null;
}): HrCorrespondenceRow {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const creator = Array.isArray(row.creator) ? row.creator[0] : row.creator;
  return {
    id: row.id,
    employee_id: row.employee_id,
    site_id: row.site_id,
    type_code: row.type_code,
    number: row.number,
    status_code: row.status_code,
    start_date: row.start_date,
    end_date: row.end_date,
    payload,
    created_at: row.created_at ?? null,
    created_by: row.created_by ?? null,
    created_by_name: creator?.full_name || creator?.email || textField(payload, "etabli_par") || "—",
    archive_url: archiveUrlOf(payload),
    ...empName({ employee: row.employee, payload }),
  };
}

function mapFileRow(row: {
  id: string;
  employee_id: string;
  doc_type_code: string;
  file_url: string | null;
  file_name?: string | null;
  storage_path?: string | null;
  issued_on: string | null;
  expires_on: string | null;
  notes: string | null;
  employee?: HrFileRow extends never ? never : unknown;
}): HrFileRow {
  return {
    id: row.id,
    employee_id: row.employee_id,
    doc_type_code: row.doc_type_code,
    file_url: hrFileDisplayUrl(row.storage_path, row.file_url),
    file_name: row.file_name ?? null,
    storage_path: row.storage_path ?? null,
    issued_on: row.issued_on,
    expires_on: row.expires_on,
    notes: row.notes,
    ...empName(row as Parameters<typeof empName>[0]),
  };
}

const FILE_SELECT =
  "id, employee_id, doc_type_code, file_url, file_name, storage_path, issued_on, expires_on, notes, employee:hr_employees ( matricule, last_name, first_name )";

export async function listHrFiles(): Promise<ActionResult<HrFileRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_employee_files")
    .select(FILE_SELECT)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map((row) => mapFileRow(row)) };
}

export async function listHrFilesForEmployee(
  employeeId: string,
): Promise<ActionResult<HrFileRow[]>> {
  if (!employeeId) return { ok: true, data: [] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_employee_files")
    .select(FILE_SELECT)
    .eq("employee_id", employeeId)
    .order("doc_type_code");
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map((row) => mapFileRow(row)) };
}

export async function upsertHrFile(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = hrFileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const p = parsed.data;
  const supabase = await createClient();
  const payload = {
    employee_id: p.employee_id,
    doc_type_code: p.doc_type_code,
    file_url: p.file_url,
    file_name: p.file_name ?? null,
    storage_path: p.storage_path ?? null,
    issued_on: p.issued_on,
    expires_on: p.expires_on,
    notes: p.notes,
  };

  if (p.id) {
    const { data, error } = await supabase
      .from("hr_employee_files")
      .update(payload)
      .eq("id", p.id)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Enregistrement refusé." };
    revalidate();
    return { ok: true, data: { id: data.id } };
  }

  const { data: existing } = await supabase
    .from("hr_employee_files")
    .select("id")
    .eq("employee_id", p.employee_id)
    .eq("doc_type_code", p.doc_type_code)
    .maybeSingle();

  if (existing?.id) {
    const { data, error } = await supabase
      .from("hr_employee_files")
      .update(payload)
      .eq("id", existing.id)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Enregistrement refusé." };
    revalidate();
    return { ok: true, data: { id: data.id } };
  }

  const { data, error } = await supabase
    .from("hr_employee_files")
    .insert(payload)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Enregistrement refusé." };
  revalidate();
  return { ok: true, data: { id: data.id } };
}

export async function uploadHrEmployeeDocument(
  formData: FormData,
): Promise<ActionResult<HrFileRow>> {
  const file = formData.get("file");
  const employeeId = String(formData.get("employee_id") || "").trim();
  const docType = String(formData.get("doc_type_code") || "").trim();
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choisissez un fichier. · اختر ملفاً." };
  }
  if (!employeeId || employeeId === "draft") {
    return {
      ok: false,
      error: "Enregistrez d'abord la fiche employé. · احفظ بطاقة العامل أولاً.",
    };
  }
  if (!docType) {
    return { ok: false, error: "Type de document requis. · نوع الوثيقة مطلوب." };
  }
  if (file.size > 15 * 1024 * 1024) {
    return { ok: false, error: "Fichier trop volumineux (15 Mo max)." };
  }
  const allowed = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
  ];
  if (!allowed.includes(file.type)) {
    return { ok: false, error: "Formats: PDF, JPG, PNG, WEBP." };
  }

  const ext =
    file.type === "application/pdf"
      ? "pdf"
      : file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : file.type === "image/gif"
            ? "gif"
            : "jpg";
  const safeId = employeeId.replace(/[^a-zA-Z0-9-]/g, "");
  const safeType = docType.replace(/[^a-zA-Z0-9_-]/g, "");
  const path = `${safeId}/${safeType}-${crypto.randomUUID()}.${ext}`;
  const supabase = await createClient();
  const { error: upErr } = await supabase.storage.from(HR_DOCS_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (upErr) return { ok: false, error: upErr.message };
  const saved = await upsertHrFile({
    employee_id: employeeId,
    doc_type_code: docType,
    file_url: hrFileHref(path),
    file_name: file.name || `${safeType}.${ext}`,
    storage_path: path,
  });
  if (!saved.ok) return saved;
  const files = await listHrFilesForEmployee(employeeId);
  if (!files.ok) return { ok: false, error: files.error };
  const row = files.data.find((f) => f.id === saved.data.id);
  if (!row) return { ok: false, error: "Fichier enregistré mais illisible." };
  return { ok: true, data: row };
}

export async function archiveEmployeeFicheRenseignements(
  employeeId: string,
): Promise<ActionResult<{ id: string; file_name: string; file_url: string }>> {
  try {
    if (!employeeId) {
      return { ok: false, error: "Employé requis." };
    }
    const [fiche, fields, catalogs, sites, settings, origin] = await Promise.all([
      getHrEmployeeFiche(employeeId),
      listHrEmployeeFields(),
      listCatalogItems(),
      listSites(),
      getHrFicheSettings(),
      requestOrigin(),
    ]);
    if (!fiche.ok) return { ok: false, error: fiche.error };
    if (!fields.ok) return { ok: false, error: fields.error };
    if (!catalogs.ok) return { ok: false, error: catalogs.error };

    const values = valuesFromFicheRecord(fiche.data, fields.data);
    const fileName = buildFicheRenseignementsFileName({
      matricule: values.matricule,
      last_name: values.last_name,
      first_name: values.first_name,
    });
    const html = buildOfficialFicheHtml(
      values,
      mergeAffectationCatalog(catalogs.data, sites.ok ? sites.data.filter((s) => s.is_active) : []),
      fields.data,
      settings.ok ? settings.data : DEFAULT_FICHE_SETTINGS,
      origin,
    );

    const path = `${employeeId.replace(/[^a-zA-Z0-9-]/g, "")}/FICHE_RENSEIGNEMENTS-${crypto.randomUUID()}.pdf`;
    const supabase = await createClient();
    const stored = await archivePrintPdf(supabase, html, origin, path);
    if (!stored.ok) return stored;
    const fileUrl = hrFileHref(path);
    const saved = await upsertHrFile({
      employee_id: employeeId,
      doc_type_code: "FICHE_RENSEIGNEMENTS",
      file_url: fileUrl,
      file_name: fileName,
      storage_path: path,
      notes: "Générée automatiquement · مُنشأة تلقائياً",
    });
    if (!saved.ok) return saved;
    return {
      ok: true,
      data: { id: saved.data.id, file_name: fileName, file_url: fileUrl },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Échec génération PDF.",
    };
  }
}

export async function listHrCorrespondences(): Promise<
  ActionResult<HrCorrespondenceRow[]>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_correspondences")
    .select(
      "id, employee_id, site_id, type_code, number, status_code, start_date, end_date, payload, created_at, created_by, employee:hr_employees ( matricule, last_name, first_name ), creator:sys_users!hr_correspondences_created_by_fkey ( full_name, email )",
    )
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) {
    // Fallback if the creator FK embed is unavailable.
    const retry = await supabase
      .from("hr_correspondences")
      .select(
        "id, employee_id, site_id, type_code, number, status_code, start_date, end_date, payload, created_at, created_by, employee:hr_employees ( matricule, last_name, first_name )",
      )
      .order("created_at", { ascending: false })
      .limit(1000);
    if (retry.error) return { ok: false, error: retry.error.message };
    const creatorIds = [
      ...new Set(
        (retry.data ?? [])
          .map((row) => row.created_by)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    ];
    const creators = new Map<string, string>();
    if (creatorIds.length) {
      const { data: users } = await supabase
        .from("sys_users")
        .select("id, full_name, email")
        .in("id", creatorIds);
      for (const user of users ?? []) {
        creators.set(user.id, user.full_name || user.email || "—");
      }
    }
    return {
      ok: true,
      data: (retry.data ?? []).map((row) => {
        const mapped = mapCorrespondenceRow(row);
        return {
          ...mapped,
          created_by_name:
            (row.created_by && creators.get(row.created_by)) || mapped.created_by_name,
        };
      }),
    };
  }
  return {
    ok: true,
    data: (data ?? []).map((row) => mapCorrespondenceRow(row)),
  };
}

async function archiveMissionOrderSnapshot(input: {
  correspondenceId: string;
  employeeId: string;
  number: string;
  fields: ReturnType<typeof missionPayload>;
}): Promise<ActionResult<{ archive_url: string; archive_path: string }>> {
  try {
    const [settings, origin] = await Promise.all([getHrFicheSettings(), requestOrigin()]);
    const letterhead = companyLetterheadUrl(
      settings.ok ? settings.data.letterhead_url : null,
      origin,
    );
    const checked = missionOrderFieldsSchema.safeParse(input.fields);
    if (!checked.success) {
      return {
        ok: false,
        error: checked.error.issues[0]?.message ?? "Données de mission invalides",
      };
    }
    const html = buildMissionOrderHtml(
      { ...checked.data, numero: input.number },
      letterhead,
      origin,
    );
    const safeNum = input.number.replace(/\//g, "-");
    const fileName = `OM_${archiveFileStem(safeNum, checked.data.matricule || "NA", checked.data.nom || "OM")}.pdf`;
    const path = `${input.employeeId.replace(/[^a-zA-Z0-9-]/g, "")}/OM_ARCHIVE-${safeNum}-${crypto.randomUUID()}.pdf`;
    const supabase = await createClient();
    const stored = await archivePrintPdf(supabase, html, origin, path);
    if (!stored.ok) return stored;
    const archiveUrl = hrFileHref(path);
    const filed = await upsertHrFile({
      employee_id: input.employeeId,
      doc_type_code: "OM_ARCHIVE",
      file_url: archiveUrl,
      file_name: fileName,
      storage_path: path,
      notes: `Ordre de mission ${input.number} · أمر بمهمة`,
    });
    if (!filed.ok) return { ok: false, error: filed.error };
    const { data: current } = await supabase
      .from("hr_correspondences")
      .select("payload")
      .eq("id", input.correspondenceId)
      .maybeSingle();
    const { error: payErr } = await supabase
      .from("hr_correspondences")
      .update({
        payload: {
          ...((current?.payload ?? {}) as Record<string, unknown>),
          archive_url: archiveUrl,
          archive_path: path,
        },
      })
      .eq("id", input.correspondenceId);
    if (payErr) return { ok: false, error: payErr.message };
    return { ok: true, data: { archive_url: archiveUrl, archive_path: path } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Échec archivage de l'ordre de mission.",
    };
  }
}

async function missionSiteOf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  employeeId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("hr_contracts")
    .select("employee_id, site_id, poste_fr, poste_ar, affectation_principale, status, start_date")
    .eq("employee_id", employeeId);
  return pickMissionContract((data ?? []) as MissionContractHint[], employeeId)?.site_id ?? null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Saves the print fields of a titre de congé on its LEAVE correspondence (leave dates and legend untouched). */
export async function saveLeaveTitle(input: {
  id: string;
  fields: unknown;
}): Promise<
  ActionResult<{
    titre: Record<string, string | null>;
    archive_url: string | null;
    archive_path: string | null;
    archive_error: string | null;
  }>
> {
  if (!UUID.test(input.id ?? "")) return { ok: false, error: "Titre de congé invalide." };
  const checked = leaveTitleFieldsSchema.safeParse(input.fields);
  if (!checked.success) {
    return { ok: false, error: checked.error.issues[0]?.message ?? "Données invalides" };
  }
  const supabase = await createClient();
  const { data: current, error: readErr } = await supabase
    .from("hr_correspondences")
    .select("payload, status_code, employee_id, number, start_date, end_date")
    .eq("id", input.id)
    .eq("type_code", "LEAVE")
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!current) return { ok: false, error: "Titre de congé introuvable. · سند الإجازة غير موجود." };
  if (current.status_code === "CANCELLED") {
    return { ok: false, error: "Ce congé a été annulé. · هذه الإجازة ملغاة." };
  }
  const titre = leaveTitlePayload(checked.data);
  const payload = (current.payload ?? {}) as Record<string, unknown>;
  const { data: saved, error } = await supabase
    .from("hr_correspondences")
    .update({ payload: { ...payload, titre } })
    .eq("id", input.id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!saved?.length) return { ok: false, error: "Enregistrement refusé (droits)." };

  const archived = await archiveLeaveTitle({
    id: input.id,
    employeeId: current.employee_id,
    number: current.number,
    fields: checked.data,
    leave: leaveOfCorrespondence({ start_date: current.start_date, end_date: current.end_date, payload }),
  });
  revalidatePath("/rh/documents");
  return {
    ok: true,
    data: {
      titre,
      archive_url: archived.ok ? archived.data.archive_url : null,
      archive_path: archived.ok ? archived.data.archive_path : null,
      archive_error: archived.ok ? null : archived.error,
    },
  };
}

export type NewLeaveTitleResult =
  | { status: "balance"; balance: number; days: number }
  | { status: "submitted"; message: string }
  | { status: "created"; row: HrCorrespondenceRow; archive_error: string | null };

/**
 * « Nouveau titre de congé »: records the leave request, approves it (which numbers the title) and saves the
 * print fields. Without the right to approve, the request stays pending and the title comes with the approval.
 */
export async function createLeaveTitle(input: {
  request: { employee_id: string; kind: string; start_date: string; end_date: string; days?: string };
  fields: unknown;
  confirmBalance?: boolean;
}): Promise<ActionResult<NewLeaveTitleResult>> {
  const checked = leaveTitleFieldsSchema.safeParse(input.fields);
  if (!checked.success) {
    return { ok: false, error: checked.error.issues[0]?.message ?? "Données invalides" };
  }
  const { employee_id, kind, start_date, end_date } = input.request;
  if (!UUID.test(employee_id ?? "")) return { ok: false, error: "Recherchez d'abord l'employé. · ابحث عن العامل" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(end_date ?? "")) {
    return { ok: false, error: "Dates du congé requises (du … au …). · تواريخ الإجازة مطلوبة" };
  }
  const days = Number(String(input.request.days ?? "").replace(",", ".")) || calendarDays(start_date, end_date);
  if (kind === "ANNUAL" && !input.confirmBalance) {
    const balances = await listLeaveBalances({ employeeId: employee_id });
    const balance = balances.ok ? balances.data[0]?.balance : undefined;
    if (balance !== undefined && balance < days) return { ok: true, data: { status: "balance", balance, days } };
  }
  const created = await createLeaveRequest({ employee_id, kind, start_date, end_date, days: input.request.days || undefined });
  if (!created.ok) return created;
  const decided = await decideLeaveRequest({ id: created.data.id, status: "APPROVED" });
  if (!decided.ok || !decided.data.correspondence_id) {
    return {
      ok: true,
      data: {
        status: "submitted",
        message: `Demande de congé enregistrée, en attente d'approbation : le titre sera établi à l'approbation.${
          decided.ok ? "" : ` (${decided.error})`
        }`,
      },
    };
  }
  const corrId = decided.data.correspondence_id;
  const saved = await saveLeaveTitle({ id: corrId, fields: checked.data });
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("hr_correspondences")
    .select(
      "id, employee_id, site_id, type_code, number, status_code, start_date, end_date, payload, created_at, created_by, employee:hr_employees ( matricule, last_name, first_name ), creator:sys_users!hr_correspondences_created_by_fkey ( full_name, email )",
    )
    .eq("id", corrId)
    .maybeSingle();
  if (error || !row) return { ok: false, error: error?.message ?? "Titre de congé introuvable après création." };
  return {
    ok: true,
    data: {
      status: "created",
      row: mapCorrespondenceRow(row),
      archive_error: saved.ok ? saved.data.archive_error : saved.error,
    },
  };
}

async function archiveLeaveTitle(input: {
  id: string;
  employeeId: string;
  number: string;
  fields: ReturnType<typeof leaveTitleFieldsSchema.parse>;
  leave: ReturnType<typeof leaveOfCorrespondence>;
}): Promise<ActionResult<{ archive_url: string; archive_path: string }>> {
  try {
    const [settings, origin] = await Promise.all([getHrFicheSettings(), requestOrigin()]);
    const html = buildLeaveTitleHtml(
      { ...input.fields, matricule: input.fields.matricule || "—", nom: input.fields.nom || "—" },
      input.leave,
      input.number,
      companyLetterheadUrl(settings.ok ? settings.data.letterhead_url : null, origin),
      origin,
    );
    const safeNum = input.number.replace(/\//g, "-");
    const fileName = `TC_${archiveFileStem(safeNum, input.fields.matricule || "NA", input.fields.nom || "TC")}.pdf`;
    const path = `${input.employeeId.replace(/[^a-zA-Z0-9-]/g, "")}/LEAVE_ARCHIVE-${safeNum}-${crypto.randomUUID()}.pdf`;
    const supabase = await createClient();
    const stored = await archivePrintPdf(supabase, html, origin, path);
    if (!stored.ok) return stored;
    const archiveUrl = hrFileHref(path);
    const filed = await upsertHrFile({
      employee_id: input.employeeId,
      doc_type_code: "LEAVE_ARCHIVE",
      file_url: archiveUrl,
      file_name: fileName,
      storage_path: path,
      notes: `Titre de congé ${input.number} · سند عطلة`,
    });
    if (!filed.ok) return { ok: false, error: filed.error };
    const { data: current } = await supabase
      .from("hr_correspondences")
      .select("payload")
      .eq("id", input.id)
      .maybeSingle();
    const { error } = await supabase
      .from("hr_correspondences")
      .update({
        payload: {
          ...((current?.payload ?? {}) as Record<string, unknown>),
          archive_url: archiveUrl,
          archive_path: path,
        },
      })
      .eq("id", input.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { archive_url: archiveUrl, archive_path: path } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Échec archivage du titre de congé.",
    };
  }
}

const UNIQUE_VIOLATION = "23505";

export async function upsertHrCorrespondence(input: unknown): Promise<
  ActionResult<{
    id: string;
    number: string;
    site_id: string | null;
    archive_url: string | null;
    archive_error: string | null;
  }>
> {
  const parsed = hrCorrespondenceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const p = parsed.data;
  const supabase = await createClient();

  let existing: {
    number: string;
    start_date: string | null;
    end_date: string | null;
    payload: Record<string, unknown> | null;
  } | null = null;
  if (p.id) {
    const { data, error } = await supabase
      .from("hr_correspondences")
      .select("number, start_date, end_date, payload")
      .eq("id", p.id)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Document introuvable. · الوثيقة غير موجودة." };
    existing = data;
  }

  const isMission = p.type_code === "OM";
  let fields: MissionOrderFields | null = null;
  let siteId = p.site_id ?? null;
  let startDate = p.start_date;
  let endDate = p.end_date;

  if (isMission) {
    const checked = missionOrderFieldsSchema.safeParse(p.payload ?? {});
    if (!checked.success) {
      return { ok: false, error: checked.error.issues[0]?.message ?? "Données de mission invalides" };
    }
    fields = checked.data;
    const issue = missionDateIssue(
      fields,
      todayIsoAlgiers(),
      existing ? { dateDepart: existing.start_date, dateRetour: existing.end_date } : null,
    );
    if (issue) return { ok: false, error: issue.message };
    startDate = fields.dateDepart;
    endDate = fields.dateRetour;
    if (!siteId) siteId = await missionSiteOf(supabase, p.employee_id);
    if (!siteId) {
      return {
        ok: false,
        error:
          "Affectation introuvable : impossible de lier l'ordre au pointage. · لا توجد Affectation للعامل، تعذّر ربط الأمر بجدول الحضور.",
      };
    }
  }

  const previous = (existing?.payload ?? {}) as Record<string, unknown>;
  let etabliPar = textField(previous, "etabli_par");
  if (!existing) {
    const profile = await getWorkspaceProfile();
    etabliPar = profile?.fullName || profile?.email || "";
  }
  const payload: Record<string, unknown> = {
    ...previous,
    ...(fields ? missionPayload(fields) : (p.payload ?? {})),
    ...(etabliPar ? { etabli_par: etabliPar } : {}),
  };
  const row = {
    employee_id: p.employee_id,
    site_id: siteId,
    type_code: p.type_code,
    status_code: p.status_code,
    start_date: startDate,
    end_date: endDate,
    payload,
  };

  let id = p.id ?? "";
  let number = existing?.number ?? "";
  if (p.id) {
    const { error } = await supabase.from("hr_correspondences").update(row).eq("id", p.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    for (let attempt = 0; attempt < 3 && !id; attempt += 1) {
      const { data: next, error: numErr } = await supabase.rpc("hr_next_doc_number", {
        p_prefix: p.type_code,
      });
      if (numErr || typeof next !== "string") {
        return { ok: false, error: numErr?.message ?? "Numérotation indisponible." };
      }
      const { data, error } = await supabase
        .from("hr_correspondences")
        .insert({ ...row, number: next, created_by: user?.id ?? null })
        .select("id, number")
        .maybeSingle();
      if (error?.code === UNIQUE_VIOLATION) continue;
      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: "Enregistrement refusé." };
      id = data.id;
      number = data.number;
    }
    if (!id) return { ok: false, error: "Numéro déjà attribué, réessayez." };
  }

  let archiveUrl: string | null = archiveUrlOf(previous);
  let archiveError: string | null = null;
  if (fields) {
    const archived = await archiveMissionOrderSnapshot({
      correspondenceId: id,
      employeeId: p.employee_id,
      number,
      fields: missionPayload(fields),
    });
    if (archived.ok) archiveUrl = archived.data.archive_url;
    else archiveError = archived.error;
  }

  revalidate();
  return { ok: true, data: { id, number, site_id: siteId, archive_url: archiveUrl, archive_error: archiveError } };
}
