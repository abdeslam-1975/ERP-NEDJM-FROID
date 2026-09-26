"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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
import { companyLetterheadUrl } from "@/lib/hr/company-letterhead";
import { HR_DOCS_BUCKET, hrFileDisplayUrl, hrFileHref } from "@/lib/hr/hr-file-url";
import { buildMissionOrderHtml } from "@/components/rh/mission-order-print";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { listCatalogItems } from "@/lib/actions/hr-catalogs";
import {
  getHrEmployeeFiche,
  listHrEmployeeFields,
} from "@/lib/actions/hr-employees";
import { getHrFicheSettings } from "@/lib/actions/hr-fiche";
import { DEFAULT_FICHE_SETTINGS } from "@/lib/hr/fiche-settings";
import { valuesFromFicheRecord } from "@/lib/hr/employee-field-utils";
import {
  buildFicheRenseignementsFileName,
  buildFicheRenseignementsPdfBytes,
} from "@/lib/hr/fiche-renseignements-pdf";

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

function siteOrigin() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "";
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
    const [fiche, fields, catalogs, settings] = await Promise.all([
      getHrEmployeeFiche(employeeId),
      listHrEmployeeFields(),
      listCatalogItems(),
      getHrFicheSettings(),
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
    const bytes = await buildFicheRenseignementsPdfBytes({
      values,
      fields: fields.data,
      catalogs: catalogs.data,
      settings: settings.ok ? settings.data : DEFAULT_FICHE_SETTINGS,
    });

    const path = `${employeeId.replace(/[^a-zA-Z0-9-]/g, "")}/FICHE_RENSEIGNEMENTS-${crypto.randomUUID()}.pdf`;
    const supabase = await createClient();
    const body = Buffer.from(bytes);
    const { error: upErr } = await supabase.storage.from(HR_DOCS_BUCKET).upload(path, body, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (upErr) return { ok: false, error: upErr.message };
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
    const settings = await getHrFicheSettings();
    const letterhead = companyLetterheadUrl(
      settings.ok ? settings.data.letterhead_url : null,
      siteOrigin(),
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
    );
    const safeMat = (checked.data.matricule || "NA").replace(/[^\w/-]+/g, "_");
    const safeNom = (checked.data.nom || "OM").replace(/[^\w/-]+/g, "_");
    const safeNum = input.number.replace(/\//g, "-");
    const fileName = `OM_${safeNum}_${safeMat}_${safeNom}.html`;
    const path = `${input.employeeId.replace(/[^a-zA-Z0-9-]/g, "")}/OM_ARCHIVE-${safeNum}-${crypto.randomUUID()}.html`;
    const supabase = await createClient();
    const body = Buffer.from(html, "utf8");
    const { error: upErr } = await supabase.storage.from(HR_DOCS_BUCKET).upload(path, body, {
      contentType: "text/html; charset=utf-8",
      upsert: false,
    });
    if (upErr) return { ok: false, error: upErr.message };
    const archiveUrl = hrFileHref(path);
    await upsertHrFile({
      employee_id: input.employeeId,
      doc_type_code: "OM_ARCHIVE",
      file_url: archiveUrl,
      file_name: fileName,
      storage_path: path,
      notes: `Ordre de mission ${input.number} · أمر بمهمة`,
    });
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

const UNIQUE_VIOLATION = "23505";

export async function upsertHrCorrespondence(input: unknown): Promise<
  ActionResult<{
    id: string;
    number: string;
    site_id: string | null;
    archive_url: string | null;
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
  if (fields) {
    const archived = await archiveMissionOrderSnapshot({
      correspondenceId: id,
      employeeId: p.employee_id,
      number,
      fields: missionPayload(fields),
    });
    if (archived.ok) archiveUrl = archived.data.archive_url;
  }

  revalidate();
  return { ok: true, data: { id, number, site_id: siteId, archive_url: archiveUrl } };
}
