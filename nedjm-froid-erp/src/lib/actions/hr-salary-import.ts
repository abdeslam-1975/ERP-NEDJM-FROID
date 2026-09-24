"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { createClient } from "@/lib/supabase/server";
import { salaryRubriqueImportApplySchema } from "@/lib/validations/hr";
import {
  previewRubriqueImport,
  type RubriqueDraft,
  type RubriqueImportPreview,
} from "@/lib/hr/salary-rubrique-import";
import {
  buildSalaryRubriquesTemplate,
  parseSalaryImportBuffer,
  SALARY_IMPORT_MAX_BYTES,
} from "@/lib/hr/salary-rubrique-import-file";
import { salaryClassFlags } from "@/lib/hr/payroll-calc";
import { listSalaryRubriques, type ActionResult, type SalaryRubrique } from "@/lib/actions/hr-salary";

async function requireSuperAdmin(): Promise<ActionResult<true>> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return { ok: false, error: "Session requise." };
  if (!workspace.isSuperAdmin) {
    return { ok: false, error: "Import des rubriques réservé à SUPER_ADMIN. · استيراد بنود الأجر محصور في SUPER_ADMIN." };
  }
  return { ok: true, data: true };
}

function revalidate() {
  revalidatePath("/rh/parametres");
  revalidatePath("/rh/paie");
}

export type SalaryImportPreviewResult = {
  rows: RubriqueImportPreview[];
  drafts: RubriqueDraft[];
  counts: { new: number; update: number; unchanged: number; rejected: number };
};

function summarize(rows: RubriqueImportPreview[]): SalaryImportPreviewResult["counts"] {
  return {
    new: rows.filter((r) => r.status === "new").length,
    update: rows.filter((r) => r.status === "update").length,
    unchanged: rows.filter((r) => r.status === "unchanged").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
  };
}

async function previewFromBuffer(
  buffer: ArrayBuffer,
  filename: string,
  replaceScope: boolean,
): Promise<ActionResult<SalaryImportPreviewResult>> {
  if (buffer.byteLength === 0) return { ok: false, error: "Fichier vide. · الملف فارغ." };
  if (buffer.byteLength > SALARY_IMPORT_MAX_BYTES) {
    return { ok: false, error: "Fichier supérieur à 2 Mo. · الملف أكبر من 2 ميغابايت." };
  }
  let parsed;
  try {
    parsed = await parseSalaryImportBuffer(buffer, filename);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Lecture du fichier impossible. · تعذر قراءة الملف." };
  }
  if (!parsed.drafts.length && !parsed.rejected.length) {
    return { ok: false, error: "Aucune rubrique trouvée dans le fichier. · لم يُعثر على بنود في الملف." };
  }
  const existing = await listSalaryRubriques();
  if (!existing.ok) return existing;
  const rows = previewRubriqueImport(
    parsed.drafts,
    parsed.rejected,
    existing.data,
    replaceScope,
  );
  return {
    ok: true,
    data: { rows, drafts: parsed.drafts, counts: summarize(rows) },
  };
}

export async function downloadSalaryRubriquesTemplate(): Promise<
  ActionResult<{ filename: string; base64: string }>
> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  const buf = await buildSalaryRubriquesTemplate();
  return {
    ok: true,
    data: {
      filename: "rubriques-salaire.xlsx",
      base64: Buffer.from(buf).toString("base64"),
    },
  };
}

export async function previewSalaryRubriquesFile(
  formData: FormData,
): Promise<ActionResult<SalaryImportPreviewResult>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Choisissez un fichier Excel, CSV ou JSON. · اختر ملف إكسل أو CSV أو JSON." };
  const replaceScope = String(formData.get("replace_scope") ?? "") === "true";
  const buffer = await file.arrayBuffer();
  return previewFromBuffer(buffer, file.name || "import.xlsx", replaceScope);
}

function assertPublicHttpUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("URL invalide. · الرابط غير صالح.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Le lien doit être http ou https. · الرابط يجب أن يكون http أو https.");
  }
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal"
  ) {
    throw new Error("Lien non autorisé. · الرابط غير مسموح.");
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const [a, b] = host.split(".").map(Number);
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 192 && b === 168) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 169 && b === 254)
    ) {
      throw new Error("Lien non autorisé. · الرابط غير مسموح.");
    }
  }
  return url.toString();
}

export async function previewSalaryRubriquesUrl(input: {
  url: string;
  replace_scope: boolean;
}): Promise<ActionResult<SalaryImportPreviewResult>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  let href: string;
  try {
    href = assertPublicHttpUrl(input.url);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "URL invalide. · الرابط غير صالح." };
  }
  let res: Response;
  try {
    res = await fetch(href, {
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/json,*/*" },
    });
  } catch {
    return { ok: false, error: "Téléchargement impossible depuis l'URL. · تعذر تنزيل الملف من الرابط." };
  }
  if (!res.ok) return { ok: false, error: `Le serveur a renvoyé ${res.status}. · المصدر أرجع خطأ ${res.status}.` };
  const len = Number(res.headers.get("content-length") ?? "0");
  if (len > SALARY_IMPORT_MAX_BYTES) {
    return { ok: false, error: "Fichier supérieur à 2 Mo. · الملف أكبر من 2 ميغابايت." };
  }
  const buffer = await res.arrayBuffer();
  const cd = res.headers.get("content-disposition") ?? "";
  const named = /filename\*?=(?:UTF-8''|"?)([^";]+)/i.exec(cd)?.[1];
  const fromUrl = new URL(href).pathname.split("/").pop() ?? "import.xlsx";
  const filename = decodeURIComponent(named ?? fromUrl);
  return previewFromBuffer(buffer, filename, input.replace_scope);
}

export async function applySalaryRubriquesImport(input: unknown): Promise<
  ActionResult<{
    inserted: number;
    updated: number;
    cleared_assignments: number;
    items: SalaryRubrique[];
  }>
> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  const parsed = salaryRubriqueImportApplySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const existing = await listSalaryRubriques();
  if (!existing.ok) return existing;
  const preview = previewRubriqueImport(
    parsed.data.drafts,
    [],
    existing.data,
    parsed.data.replace_scope,
  );
  const toWrite = preview.filter((r) => r.status === "new" || r.status === "update");
  if (!toWrite.length) {
    return { ok: false, error: "Aucune rubrique nouvelle ou modifiée à confirmer. · لا توجد بنود جديدة أو معدَّلة للتأكيد." };
  }
  const supabase = await createClient();
  let cleared = 0;
  if (parsed.data.replace_scope) {
    for (const row of toWrite) {
      const prev = existing.data.find((e) => e.code === row.code);
      if (!prev || !row.incoming) continue;
      if (prev.apply_scope === row.incoming.apply_scope) continue;
      const { error } = await supabase
        .from("hr_salary_assignments")
        .delete()
        .eq("rubrique_id", prev.id);
      if (error) return { ok: false, error: error.message };
      cleared += 1;
    }
  }
  const payloads = toWrite
    .map((row) => row.incoming)
    .filter((d): d is RubriqueDraft => Boolean(d))
    .map((d) => ({ ...d, ...salaryClassFlags(d.category) }));
  const { error } = await supabase.from("hr_salary_rubriques").upsert(payloads, {
    onConflict: "code",
  });
  if (error) return { ok: false, error: error.message };
  const listed = await listSalaryRubriques();
  revalidate();
  return {
    ok: true,
    data: {
      inserted: toWrite.filter((r) => r.status === "new").length,
      updated: toWrite.filter((r) => r.status === "update").length,
      cleared_assignments: cleared,
      items: listed.ok ? listed.data : [],
    },
  };
}
