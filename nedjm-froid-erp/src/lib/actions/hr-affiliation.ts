"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { upsertHrFile } from "@/lib/actions/hr-documents";
import { SS_DOCUMENT, affiliationReady } from "@/lib/hr/candidate-cycle";
import { HR_DOCS_BUCKET, hrFileDisplayUrl, hrFileHref } from "@/lib/hr/hr-file-url";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export type EmployeeAffiliation = {
  employee_id: string;
  legacy: boolean;
  affiliation_start: string | null;
  hired_at: string | null;
  nss: string | null;
  file_url: string | null;
  file_name: string | null;
};

function digits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 12);
}

export async function getEmployeeAffiliation(employeeId: string): Promise<ActionResult<EmployeeAffiliation>> {
  if (!employeeId) return { ok: false, error: "Salarié requis." };
  const supabase = await createClient();
  const [employee, file] = await Promise.all([
    supabase
      .from("hr_employees")
      .select("id, affiliation_legacy, affiliation_start, hired_at, nss")
      .eq("id", employeeId)
      .maybeSingle(),
    supabase
      .from("hr_employee_files")
      .select("file_url, file_name, storage_path")
      .eq("employee_id", employeeId)
      .eq("doc_type_code", SS_DOCUMENT)
      .maybeSingle(),
  ]);
  if (employee.error) return { ok: false, error: employee.error.message };
  if (!employee.data) return { ok: false, error: "Salarié introuvable." };
  if (file.error) return { ok: false, error: file.error.message };
  return {
    ok: true,
    data: {
      employee_id: employeeId,
      legacy: employee.data.affiliation_legacy === true,
      affiliation_start: employee.data.affiliation_start
        ? String(employee.data.affiliation_start).slice(0, 10)
        : null,
      hired_at: employee.data.hired_at ? String(employee.data.hired_at).slice(0, 10) : null,
      nss: employee.data.nss ? String(employee.data.nss) : null,
      file_url: file.data
        ? hrFileDisplayUrl(file.data.storage_path, file.data.file_url)
        : null,
      file_name: file.data?.file_name ? String(file.data.file_name) : null,
    },
  };
}

export async function confirmSocialAffiliation(formData: FormData): Promise<ActionResult<EmployeeAffiliation>> {
  const employeeId = String(formData.get("employee_id") || "").trim();
  const workStart = String(formData.get("work_start") || "").slice(0, 10);
  const nss = digits(String(formData.get("nss") || ""));
  const file = formData.get("file");
  const ready = affiliationReady(nss, workStart);
  if (!employeeId) return { ok: false, error: "Salarié requis." };
  if (ready) return { ok: false, error: ready };

  const supabase = await createClient();
  const { data: employee, error } = await supabase
    .from("hr_employees")
    .select("id, affiliation_legacy")
    .eq("id", employeeId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!employee) return { ok: false, error: "Salarié introuvable." };
  if (employee.affiliation_legacy === true) {
    return {
      ok: false,
      error: "Ce salarié est déjà affilié (reprise de l'ancienne base). Son pointage reste ouvert.",
    };
  }

  const { data: clash } = await supabase
    .from("hr_employees")
    .select("id, matricule")
    .eq("nss", nss)
    .neq("id", employeeId)
    .limit(1);
  if (clash?.length) {
    return { ok: false, error: `NSS déjà porté par ${clash[0].matricule}.` };
  }

  const existing = await supabase
    .from("hr_employee_files")
    .select("id, storage_path, file_name, file_url")
    .eq("employee_id", employeeId)
    .eq("doc_type_code", SS_DOCUMENT)
    .maybeSingle();
  if (existing.error) return { ok: false, error: existing.error.message };

  let storagePath: string | null = null;
  let fileName: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > 15 * 1024 * 1024) return { ok: false, error: "Fichier trop volumineux (15 Mo max)." };
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) return { ok: false, error: "Formats : PDF, JPG, PNG, WEBP." };
    const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
    storagePath = `${employeeId.replace(/[^a-zA-Z0-9-]/g, "")}/${SS_DOCUMENT}-${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from(HR_DOCS_BUCKET).upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });
    if (upErr) return { ok: false, error: upErr.message };
    fileName = file.name || `${SS_DOCUMENT}.${ext}`;
  } else if (!existing.data?.storage_path && !existing.data?.file_url) {
    return { ok: false, error: "Téléversez l'attestation CNAS qui confirme l'immatriculation." };
  }

  if (storagePath) {
    const saved = await upsertHrFile({
      id: existing.data?.id,
      employee_id: employeeId,
      doc_type_code: SS_DOCUMENT,
      file_url: hrFileHref(storagePath),
      file_name: fileName,
      storage_path: storagePath,
      issued_on: workStart,
      notes: "Attestation CNAS validée · شهادة الضمان مصادق عليها",
    });
    if (!saved.ok) return saved;
  } else {
    const { error: fileError } = await supabase
      .from("hr_employee_files")
      .update({ issued_on: workStart, notes: "Attestation CNAS validée · شهادة الضمان مصادق عليها" })
      .eq("employee_id", employeeId)
      .eq("doc_type_code", SS_DOCUMENT);
    if (fileError) return { ok: false, error: fileError.message };
  }

  const { error: updateError } = await supabase
    .from("hr_employees")
    .update({ nss, affiliation_start: workStart, affiliation_legacy: false })
    .eq("id", employeeId);
  if (updateError) return { ok: false, error: updateError.message };

  revalidatePath("/rh/presence");
  revalidatePath("/rh/employes");
  return getEmployeeAffiliation(employeeId);
}
