"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { renderDocument, sanitizeTemplate } from "@/lib/doc/engine";
import { applyPageSetup } from "@/lib/doc/page-setup";
import {
  customDocDefInputSchema,
  customDocData,
  customLetterhead,
  formatReference,
  normalizeCustomDocDef,
  numberingPeriod,
  parseInputAmount,
  starterTemplate,
  CUSTOM_STARTERS,
  DOC_ASSETS_BUCKET,
  EMPTY_CUSTOM_CONTEXT,
  type CustomDocContext,
  type CustomDocDef,
  type CustomStarter,
  type ListLabel,
} from "@/lib/doc/custom-docs";
import { docFontOptions, fontFaceCss, fontFileFormat, fontStack, withFontFaces, type UploadedFont } from "@/lib/doc/fonts";
import { loadCompanyProfile } from "@/lib/doc/print-kit";
import { getHrEmployeeFiche, listHrEmployeeFields } from "@/lib/actions/hr-employees";
import { getHrFicheSettings } from "@/lib/actions/hr-fiche";
import { valuesFromFicheRecord } from "@/lib/hr/employee-field-utils";
import { companyLetterheadUrl } from "@/lib/hr/company-letterhead";
import { missionReference } from "@/lib/hr/mission-order";
import { hrFileHref } from "@/lib/hr/hr-file-url";
import { htmlToPdf } from "@/lib/pdf/html-to-pdf";
import { archiveFileStem, archiveFolder, hrPdfOptions, requestOrigin, uploadHrPdf } from "@/lib/pdf/print-archive";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

type Db = Awaited<ReturnType<typeof createClient>>;

export type CustomDocRow = CustomDocDef & {
  /** Version printed (null: never approved, the document cannot be printed yet). */
  approved_version: number | null;
  has_draft: boolean;
};

export type CustomSourceOption = { id: string; label: string; sub: string };

export type IssuedCustomDoc = {
  id: string;
  def_id: string;
  doc_name: string;
  reference: string | null;
  employee_id: string | null;
  employee_name: string;
  matricule: string;
  status: "ISSUED" | "CANCELLED";
  archive_url: string | null;
  created_at: string;
  created_by_name: string;
};

export type CustomDocSelection = {
  defId: string;
  employeeId?: string | null;
  sourceId?: string | null;
  inputs?: Record<string, string>;
};

const DEF_COLUMNS =
  "id, code, doc_type, name_fr, name_ar, family, lang, source, inputs, page, numbering, is_active, created_at, updated_at";
const FONT_COLUMNS = "id, family, weight, style, format, url, is_active, created_at";
const ASSETS_BUCKET = DOC_ASSETS_BUCKET;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidate() {
  revalidatePath("/rh/parametres");
  revalidatePath("/rh/documents");
}

async function canEditSettings(db: Db) {
  const { data } = await db.rpc("erp_has_perm", { p_screen: "hr_settings", p_action: "update" });
  return data === true;
}

async function loadFonts(db: Db): Promise<UploadedFont[]> {
  const { data } = await db.from("doc_fonts").select(FONT_COLUMNS).order("family");
  return (data ?? []) as UploadedFont[];
}

async function loadDef(db: Db, id: string): Promise<ActionResult<CustomDocDef>> {
  if (!UUID.test(id ?? "")) return { ok: false, error: "Document inconnu." };
  const { data, error } = await db.from("hr_doc_defs").select(DEF_COLUMNS).eq("id", id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Document introuvable." };
  return { ok: true, data: normalizeCustomDocDef(data as Record<string, unknown>) };
}

/** Draft if any, else the approved version (what the designer works from). */
async function workingTemplate(db: Db, docType: string) {
  const { data } = await db
    .from("doc_templates")
    .select("html, status, version")
    .eq("doc_type", docType)
    .order("version", { ascending: false, nullsFirst: true })
    .limit(2);
  const rows = (data ?? []) as { html: string; status: string; version: number | null }[];
  return (rows.find((r) => r.status === "draft") ?? rows.find((r) => r.status === "approved"))?.html ?? null;
}

async function approvedTemplate(db: Db, docType: string) {
  const { data, error } = await db
    .from("doc_templates")
    .select("html, version")
    .eq("doc_type", docType)
    .eq("status", "approved")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  if (!data) return { ok: false as const, error: "Ce document n'a pas encore de modèle approuvé : approuvez-le dans Paramètres RH › Documents." };
  return { ok: true as const, data: data as { html: string; version: number } };
}

async function saveDraft(db: Db, docType: string, html: string, note: string) {
  const clean = sanitizeTemplate(html);
  const existing = await db.from("doc_templates").select("id").eq("doc_type", docType).eq("status", "draft").maybeSingle();
  if (existing.error) return existing.error.message;
  const query = existing.data
    ? db.from("doc_templates").update({ html: clean, note }).eq("id", existing.data.id)
    : db.from("doc_templates").insert({ doc_type: docType, status: "draft", html: clean, note });
  const { error } = await query;
  return error?.message ?? null;
}

// ---------------------------------------------------------------- definitions

export async function listCustomDocDefs(): Promise<ActionResult<{ defs: CustomDocRow[]; canEdit: boolean }>> {
  const supabase = await createClient();
  const [defs, canEdit] = await Promise.all([
    supabase.from("hr_doc_defs").select(DEF_COLUMNS).order("name_fr"),
    canEditSettings(supabase),
  ]);
  if (defs.error) return { ok: false, error: defs.error.message };
  const list = (defs.data ?? []).map((row) => normalizeCustomDocDef(row as Record<string, unknown>));
  const types = list.map((d) => d.doc_type);
  const templates = types.length
    ? await supabase.from("doc_templates").select("doc_type, status, version").in("doc_type", types)
    : { data: [], error: null };
  if (templates.error) return { ok: false, error: templates.error.message };
  const rows = (templates.data ?? []) as { doc_type: string; status: string; version: number | null }[];
  return {
    ok: true,
    data: {
      canEdit,
      defs: list.map((d) => {
        const own = rows.filter((r) => r.doc_type === d.doc_type);
        const versions = own.filter((r) => r.status === "approved").map((r) => r.version ?? 0);
        return { ...d, approved_version: versions.length ? Math.max(...versions) : null, has_draft: own.some((r) => r.status === "draft") };
      }),
    },
  };
}

export type CustomDocStart = { starter: CustomStarter } | { copyOf: string };

/**
 * Creates or updates a definition. A new document gets a first draft (starter layout or copy of another
 * custom document); a changed page setup is written into the draft, which then has to be approved.
 */
export async function saveCustomDocDef(input: unknown, start?: CustomDocStart): Promise<ActionResult<CustomDocDef>> {
  const parsed = customDocDefInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  const v = parsed.data;
  const supabase = await createClient();
  if (!(await canEditSettings(supabase))) return { ok: false, error: "Le droit « Paramètres RH — modifier » est nécessaire." };
  const fonts = docFontOptions(await loadFonts(supabase));
  const target = { page: v.page, lang: v.lang, fontStack: fontStack(v.page.font_family, fonts) };
  const payload = {
    name_fr: v.name_fr,
    name_ar: v.name_ar,
    family: v.family,
    lang: v.lang,
    inputs: v.inputs,
    page: v.page,
    numbering: v.numbering,
  };

  if (v.id) {
    const before = await loadDef(supabase, v.id);
    if (!before.ok) return before;
    const { data, error } = await supabase.from("hr_doc_defs").update(payload).eq("id", v.id).select(DEF_COLUMNS).maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Enregistrement refusé (droits)." };
    const def = normalizeCustomDocDef(data as Record<string, unknown>);
    const current = await workingTemplate(supabase, def.doc_type);
    if (current) {
      const next = applyPageSetup(current, target);
      if (next !== current) {
        const problem = await saveDraft(supabase, def.doc_type, next, "Mise en page modifiée");
        if (problem) return { ok: false, error: problem };
      }
    }
    revalidate();
    return { ok: true, data: def };
  }

  const { data, error } = await supabase
    .from("hr_doc_defs")
    .insert({ ...payload, code: v.code, source: v.source })
    .select(DEF_COLUMNS)
    .maybeSingle();
  if (error) {
    return { ok: false, error: error.code === "23505" ? `Le code « ${v.code} » est déjà utilisé par un autre document.` : error.message };
  }
  if (!data) return { ok: false, error: "Enregistrement refusé (droits)." };
  const def = normalizeCustomDocDef(data as Record<string, unknown>);
  let html: string | null = null;
  if (start && "copyOf" in start) {
    const source = await loadDef(supabase, start.copyOf);
    if (source.ok) html = await workingTemplate(supabase, source.data.doc_type);
    if (html) html = applyPageSetup(html, target);
  }
  if (!html) {
    const starter = start && "starter" in start && CUSTOM_STARTERS.some((s) => s.id === start.starter) ? start.starter : "blank";
    html = starterTemplate(v, starter, target.fontStack);
  }
  const problem = await saveDraft(supabase, def.doc_type, html, "Création du document");
  if (problem) return { ok: false, error: problem };
  revalidate();
  return { ok: true, data: def };
}

export async function setCustomDocDefActive(id: string, active: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("hr_doc_defs").update({ is_active: active }).eq("id", id).select("id").maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Modification refusée (droits)." };
  revalidate();
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------- fonts and letterheads

export async function listDocFonts(): Promise<ActionResult<UploadedFont[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("doc_fonts").select(FONT_COLUMNS).order("family").order("weight");
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as UploadedFont[] };
}

const FONT_MAX_BYTES = 5 * 1024 * 1024;
const LETTERHEAD_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const FONT_PATH = /^fonts\/[0-9a-f-]{36}\.(woff2|woff|ttf|otf)$/;

export type DocAssetUpload = { path: string; token: string; url: string; contentType: string };

/** Signed upload of a font or a letterhead image: the browser sends the file straight to storage. */
export async function prepareDocAssetUpload(input: {
  kind: "font" | "letterhead";
  fileName: string;
  mime: string;
  size: number;
}): Promise<ActionResult<DocAssetUpload>> {
  let ext: string;
  let contentType: string;
  if (input.kind === "font") {
    const kind = fontFileFormat(input.fileName ?? "");
    if (!kind) return { ok: false, error: "Formats acceptés : WOFF2, WOFF, TTF, OTF." };
    if (!(input.size > 0) || input.size > FONT_MAX_BYTES) return { ok: false, error: "Police trop volumineuse (5 Mo max)." };
    ext = kind.ext;
    contentType = kind.mime;
  } else {
    const hit = IMAGE_EXT[input.mime];
    if (!hit) return { ok: false, error: "Formats acceptés : PNG, JPG, WEBP." };
    if (!(input.size > 0) || input.size > LETTERHEAD_MAX_BYTES) return { ok: false, error: "Image trop volumineuse (8 Mo max)." };
    ext = hit;
    contentType = input.mime;
  }
  const supabase = await createClient();
  if (!(await canEditSettings(supabase))) return { ok: false, error: "Le droit « Paramètres RH — modifier » est nécessaire." };
  const path = `${input.kind === "font" ? "fonts" : "letterheads"}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await supabase.storage.from(ASSETS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: error?.message ?? "Envoi refusé." };
  const url = supabase.storage.from(ASSETS_BUCKET).getPublicUrl(path).data.publicUrl;
  return { ok: true, data: { path, token: data.token, url, contentType } };
}

/** Records a font file already sent with `prepareDocAssetUpload`. */
export async function registerDocFont(input: {
  path: string;
  family: string;
  weight: number;
  style: "normal" | "italic";
}): Promise<ActionResult<UploadedFont>> {
  const family = String(input.family ?? "").trim();
  const weight = Number(input.weight);
  const style = input.style === "italic" ? "italic" : "normal";
  if (!FONT_PATH.test(input.path ?? "")) return { ok: false, error: "Fichier de police invalide." };
  if (!/^[A-Za-z0-9 _-]{2,60}$/.test(family)) {
    return { ok: false, error: "Nom de la police : 2 à 60 lettres latines, chiffres, espaces, - ou _." };
  }
  if (![100, 200, 300, 400, 500, 600, 700, 800, 900].includes(weight)) return { ok: false, error: "Graisse invalide." };
  const kind = fontFileFormat(input.path);
  if (!kind) return { ok: false, error: "Fichier de police invalide." };
  const supabase = await createClient();
  const { data: blob, error: dlErr } = await supabase.storage.from(ASSETS_BUCKET).download(input.path);
  if (dlErr || !blob) return { ok: false, error: "Fichier non reçu : réessayez l'envoi." };
  if (blob.size > FONT_MAX_BYTES) {
    await supabase.storage.from(ASSETS_BUCKET).remove([input.path]);
    return { ok: false, error: "Police trop volumineuse (5 Mo max)." };
  }
  const url = supabase.storage.from(ASSETS_BUCKET).getPublicUrl(input.path).data.publicUrl;
  const { data, error } = await supabase
    .from("doc_fonts")
    .insert({ family, weight, style, format: kind.format, storage_path: input.path, url })
    .select(FONT_COLUMNS)
    .maybeSingle();
  if (error || !data) {
    await supabase.storage.from(ASSETS_BUCKET).remove([input.path]);
    if (error?.code === "23505") return { ok: false, error: `« ${family} » existe déjà avec cette graisse et ce style.` };
    return { ok: false, error: error?.message ?? "Enregistrement refusé (droits)." };
  }
  revalidate();
  return { ok: true, data: data as UploadedFont };
}

export async function setDocFontActive(id: string, active: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("doc_fonts").update({ is_active: active }).eq("id", id).select("id").maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Modification refusée (droits)." };
  revalidate();
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------- data of a print

type Catalog = { kind: string; code: string; label_fr: string; label_ar: string };

async function loadCatalogs(db: Db): Promise<Catalog[]> {
  const { data } = await db.from("hr_catalogs").select("kind, code, label_fr, label_ar");
  return (data ?? []) as Catalog[];
}

function labeler(catalogs: Catalog[]): ListLabel {
  return (kind, code) => {
    const hit = catalogs.find((c) => c.kind === kind && c.code === code);
    return { fr: hit?.label_fr || code, ar: hit?.label_ar || hit?.label_fr || code };
  };
}

function slash(iso: unknown) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

type ContractRow = {
  id: string;
  employee_id: string;
  contract_number: string | null;
  contract_type_code: string | null;
  poste_fr: string | null;
  poste_ar: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  affectation_principale: boolean | null;
  salaire_net_ref_monthly: number | null;
  site: { name_fr?: string } | { name_fr?: string }[] | null;
};

const CONTRACT_SELECT =
  "id, employee_id, contract_number, contract_type_code, poste_fr, poste_ar, start_date, end_date, status, affectation_principale, salaire_net_ref_monthly, site:ref_sites ( name_fr )";

function contractRecord(row: ContractRow, label: ListLabel): CustomDocContext["contract"] {
  const site = Array.isArray(row.site) ? row.site[0] : row.site;
  const type = row.contract_type_code ? label("contract_type", row.contract_type_code) : { fr: "", ar: "" };
  return {
    numero: row.contract_number ?? "",
    type_fr: type.fr,
    type_ar: type.ar,
    poste_fr: row.poste_fr ?? "",
    poste_ar: row.poste_ar ?? "",
    start_date: row.start_date,
    end_date: row.end_date,
    affectation: site?.name_fr ?? "",
    salaire_net: row.salaire_net_ref_monthly == null ? null : Number(row.salaire_net_ref_monthly),
  };
}

async function employeeValues(db: Db, employeeId: string, lang: CustomDocDef["lang"], label: ListLabel) {
  const [fiche, fields] = await Promise.all([getHrEmployeeFiche(employeeId), listHrEmployeeFields()]);
  if (!fiche.ok) return { ok: false as const, error: fiche.error };
  if (!fields.ok) return { ok: false as const, error: fields.error };
  const raw = valuesFromFicheRecord(fiche.data, fields.data);
  const values: Record<string, string> = {};
  for (const f of fields.data) {
    const v = raw[f.code] ?? "";
    if (!v) values[f.code] = "";
    else if (f.value_type === "catalog" && f.catalog_kind) {
      const l = label(f.catalog_kind, v);
      values[f.code] = lang === "ar" ? l.ar : l.fr;
    } else if (f.value_type === "date") values[f.code] = slash(v) || v;
    else values[f.code] = v;
  }
  for (const key of ["matricule", "last_name", "first_name", "last_name_ar", "first_name_ar"] as const) {
    values[key] = values[key] || String(fiche.data[key] ?? "");
  }
  values.birth_date = values.birth_date || slash(fiche.data.birth_date);
  values.hired_at = values.hired_at || slash(fiche.data.hired_at);
  const sex = String(fiche.data.sex_code ?? "").toUpperCase();
  return { ok: true as const, data: { values, sex: sex === "F" ? ("F" as const) : sex === "M" ? ("M" as const) : ("" as const) } };
}

async function loadContext(db: Db, def: CustomDocDef, sel: CustomDocSelection, catalogs: Catalog[]): Promise<ActionResult<CustomDocContext>> {
  if (def.source === "free") return { ok: true, data: EMPTY_CUSTOM_CONTEXT };
  const employeeId = sel.employeeId ?? "";
  if (!UUID.test(employeeId)) return { ok: false, error: "Choisissez l'employé." };
  const label = labeler(catalogs);
  const emp = await employeeValues(db, employeeId, def.lang, label);
  if (!emp.ok) return emp;
  const ctx: CustomDocContext = { ...EMPTY_CUSTOM_CONTEXT, employee: emp.data.values, sex: emp.data.sex };
  const sourceId = sel.sourceId ?? "";
  const needsRecord = def.source !== "employee";
  if (needsRecord && !UUID.test(sourceId)) return { ok: false, error: "Choisissez l'élément du dossier à imprimer." };

  switch (def.source) {
    case "employee": {
      const { data } = await db.from("hr_contracts").select(CONTRACT_SELECT).eq("employee_id", employeeId);
      const rows = ((data ?? []) as ContractRow[]).sort(
        (a, b) =>
          Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE") ||
          Number(Boolean(b.affectation_principale)) - Number(Boolean(a.affectation_principale)) ||
          String(b.start_date ?? "").localeCompare(String(a.start_date ?? "")),
      );
      ctx.contract = rows[0] ? contractRecord(rows[0], label) : null;
      break;
    }
    case "contract": {
      const { data, error } = await db.from("hr_contracts").select(CONTRACT_SELECT).eq("id", sourceId).eq("employee_id", employeeId).maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: "Contrat introuvable pour cet employé." };
      ctx.contract = contractRecord(data as ContractRow, label);
      break;
    }
    case "leave": {
      const { data, error } = await db
        .from("hr_leave_requests")
        .select("kind, start_date, end_date, days, reason")
        .eq("id", sourceId)
        .eq("employee_id", employeeId)
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: "Congé introuvable pour cet employé." };
      const kind = label("leave_kind", data.kind);
      ctx.leave = {
        kind_fr: kind.fr,
        kind_ar: kind.ar,
        start_date: data.start_date,
        end_date: data.end_date,
        days: Number(data.days ?? 0),
        reason: data.reason ?? "",
      };
      break;
    }
    case "mission": {
      const [{ data, error }, company] = await Promise.all([
        db
          .from("hr_correspondences")
          .select("number, payload")
          .eq("id", sourceId)
          .eq("employee_id", employeeId)
          .eq("type_code", "MISSION")
          .maybeSingle(),
        loadCompanyProfile(db),
      ]);
      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: "Ordre de mission introuvable pour cet employé." };
      const p = (data.payload ?? {}) as Record<string, unknown>;
      const s = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");
      ctx.mission = {
        reference: company.ok ? missionReference(data.number, company.data) : data.number,
        dest1: s("dest1"),
        dest2: s("dest2"),
        motif: s("motif"),
        lieu_depart: s("lieuDepart"),
        date_depart: s("dateDepart"),
        lieu_retour: s("lieuRetour"),
        date_retour: s("dateRetour"),
        moyen: s("moyen"),
        immat: s("immat"),
      };
      break;
    }
    case "exit": {
      const { data, error } = await db
        .from("hr_employee_exits")
        .select("exit_date, reason_code, leave_balance_days, notes")
        .eq("id", sourceId)
        .eq("employee_id", employeeId)
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: "Sortie introuvable pour cet employé." };
      const reason = label("exit_reason", data.reason_code);
      ctx.exit = {
        exit_date: data.exit_date,
        reason_fr: reason.fr,
        reason_ar: reason.ar,
        leave_balance_days: data.leave_balance_days == null ? null : Number(data.leave_balance_days),
        notes: data.notes ?? "",
      };
      break;
    }
  }
  return { ok: true, data: ctx };
}

/** Records of the employee a document of `source` can be printed for (contracts, leaves, missions, exits). */
export async function listCustomSourceRecords(defId: string, employeeId: string): Promise<ActionResult<CustomSourceOption[]>> {
  if (!UUID.test(employeeId ?? "")) return { ok: true, data: [] };
  const supabase = await createClient();
  const def = await loadDef(supabase, defId);
  if (!def.ok) return def;
  const label = labeler(await loadCatalogs(supabase));
  const period = (a: unknown, b: unknown) => [slash(a), slash(b)].filter(Boolean).join(" → ");
  switch (def.data.source) {
    case "contract": {
      const { data, error } = await supabase
        .from("hr_contracts")
        .select(CONTRACT_SELECT)
        .eq("employee_id", employeeId)
        .order("start_date", { ascending: false });
      if (error) return { ok: false, error: error.message };
      return {
        ok: true,
        data: ((data ?? []) as ContractRow[]).map((c) => ({
          id: c.id,
          label: [c.contract_number || "Contrat sans n°", c.poste_fr || c.poste_ar].filter(Boolean).join(" · "),
          sub: [period(c.start_date, c.end_date), c.status].filter(Boolean).join(" · "),
        })),
      };
    }
    case "leave": {
      const { data, error } = await supabase
        .from("hr_leave_requests")
        .select("id, kind, start_date, end_date, days, status")
        .eq("employee_id", employeeId)
        .order("start_date", { ascending: false });
      if (error) return { ok: false, error: error.message };
      return {
        ok: true,
        data: (data ?? []).map((l) => ({
          id: l.id,
          label: `${label("leave_kind", l.kind).fr} · ${l.days} j`,
          sub: [period(l.start_date, l.end_date), l.status].filter(Boolean).join(" · "),
        })),
      };
    }
    case "mission": {
      const [{ data, error }, company] = await Promise.all([
        supabase
          .from("hr_correspondences")
          .select("id, number, payload, start_date, end_date")
          .eq("employee_id", employeeId)
          .eq("type_code", "MISSION")
          .order("created_at", { ascending: false }),
        loadCompanyProfile(supabase),
      ]);
      if (error) return { ok: false, error: error.message };
      return {
        ok: true,
        data: (data ?? []).map((m) => {
          const p = (m.payload ?? {}) as Record<string, unknown>;
          return {
            id: m.id,
            label: [company.ok ? missionReference(m.number, company.data) : m.number, String(p.dest1 ?? "")].filter(Boolean).join(" · "),
            sub: period(m.start_date ?? p.dateDepart, m.end_date ?? p.dateRetour),
          };
        }),
      };
    }
    case "exit": {
      const { data, error } = await supabase
        .from("hr_employee_exits")
        .select("id, exit_date, reason_code, status")
        .eq("employee_id", employeeId)
        .order("exit_date", { ascending: false });
      if (error) return { ok: false, error: error.message };
      return {
        ok: true,
        data: (data ?? []).map((x) => ({ id: x.id, label: `${slash(x.exit_date)} · ${label("exit_reason", x.reason_code).fr}`, sub: x.status })),
      };
    }
    default:
      return { ok: true, data: [] };
  }
}

function checkInputs(def: CustomDocDef, raw: Record<string, string>): string | null {
  for (const i of def.inputs) {
    const v = String(raw[i.key] ?? "").trim();
    if (!v) {
      if (i.required) return `« ${i.label_fr} » est obligatoire.`;
      continue;
    }
    if (v.length > 4000) return `« ${i.label_fr} » est trop long.`;
    if (i.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return `« ${i.label_fr} » : date invalide.`;
    if ((i.type === "amount" || i.type === "number") && parseInputAmount(v) == null) return `« ${i.label_fr} » : nombre invalide.`;
  }
  return null;
}

type Prepared = { def: CustomDocDef; html: string; version: number; inputs: Record<string, string>; reference: string };

async function prepare(db: Db, sel: CustomDocSelection, reference: (def: CustomDocDef) => Promise<ActionResult<string>>): Promise<ActionResult<Prepared>> {
  const def = await loadDef(db, sel.defId);
  if (!def.ok) return def;
  if (!def.data.is_active) return { ok: false, error: "Ce document est archivé." };
  const inputs = Object.fromEntries(
    Object.entries(sel.inputs ?? {}).filter(([k, v]) => typeof k === "string" && typeof v === "string"),
  ) as Record<string, string>;
  const problem = checkInputs(def.data, inputs);
  if (problem) return { ok: false, error: problem };
  const [template, catalogs, company, fonts, fiche, origin] = await Promise.all([
    approvedTemplate(db, def.data.doc_type),
    loadCatalogs(db),
    loadCompanyProfile(db),
    loadFonts(db),
    getHrFicheSettings(),
    requestOrigin(),
  ]);
  if (!template.ok) return template;
  if (!company.ok) return company;
  const ctx = await loadContext(db, def.data, sel, catalogs);
  if (!ctx.ok) return ctx;
  const ref = await reference(def.data);
  if (!ref.ok) return ref;
  const data = customDocData(def.data, ctx.data, inputs, {
    company: company.data,
    letterheadUrl: customLetterhead(
      def.data.page,
      companyLetterheadUrl(fiche.ok ? fiche.data.letterhead_url : null, origin),
    ),
    reference: ref.data,
    today: new Date().toISOString().slice(0, 10),
    listLabel: labeler(catalogs),
  });
  const html = renderDocument(withFontFaces(template.data.html, fontFaceCss(fonts)), data, origin);
  return { ok: true, data: { def: def.data, html, version: template.data.version, inputs, reference: ref.data } };
}

/** Print preview with the approved template (no number is taken). */
export async function previewCustomDoc(sel: CustomDocSelection): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const r = await prepare(supabase, sel, async (def) => ({ ok: true, data: def.numbering.enabled ? "(attribuée à l'impression)" : "" }));
  return r.ok ? { ok: true, data: r.data.html } : r;
}

/** Takes the next reference, renders the document, archives its PDF and records the copy. */
export async function issueCustomDoc(
  sel: CustomDocSelection,
): Promise<ActionResult<{ id: string; reference: string | null; html: string; archive_url: string | null; warning: string | null }>> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const r = await prepare(supabase, sel, async (def) => {
    if (!def.numbering.enabled) return { ok: true, data: "" };
    const [seq, company] = await Promise.all([
      supabase.rpc("hr_doc_next_seq", { p_doc_type: def.doc_type, p_period: numberingPeriod(def.numbering, today) }),
      loadCompanyProfile(supabase),
    ]);
    if (seq.error) return { ok: false, error: seq.error.message };
    return {
      ok: true,
      data: formatReference(def.numbering, {
        seq: Number(seq.data),
        isoDate: today,
        prefix: company.ok ? company.data.doc_prefix : "",
        code: def.code,
      }),
    };
  });
  if (!r.ok) return r;
  const { def, html, version, inputs } = r.data;
  const reference = r.data.reference || null;
  const employeeId = def.source === "free" ? null : (sel.employeeId ?? null);

  let storagePath: string | null = null;
  let warning: string | null = null;
  try {
    const origin = await requestOrigin();
    const pdf = await htmlToPdf(html, hrPdfOptions(supabase, origin));
    const path = `${employeeId ? archiveFolder(employeeId) : "documents"}/${archiveFileStem("DOC", def.code, reference ?? crypto.randomUUID())}-${crypto.randomUUID().slice(0, 8)}.pdf`;
    const upload = await uploadHrPdf(supabase, path, pdf);
    if (upload) warning = `Document imprimé, mais l'archive PDF a échoué : ${upload}`;
    else storagePath = path;
  } catch (e) {
    warning = `Document imprimé, mais l'archive PDF a échoué : ${e instanceof Error ? e.message : "erreur inconnue"}`;
  }

  const { data, error } = await supabase
    .from("hr_doc_issued")
    .insert({
      def_id: def.id,
      doc_type: def.doc_type,
      template_version: version,
      reference,
      employee_id: employeeId,
      source_id: def.source === "free" || def.source === "employee" ? null : (sel.sourceId ?? null),
      inputs,
      storage_path: storagePath,
    })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Enregistrement refusé (droits)." };
  revalidatePath("/rh/documents");
  return { ok: true, data: { id: data.id, reference, html, archive_url: storagePath ? hrFileHref(storagePath) : null, warning } };
}

export async function listIssuedCustomDocs(): Promise<ActionResult<IssuedCustomDoc[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_doc_issued")
    .select(
      "id, def_id, reference, employee_id, status, storage_path, created_at, created_by, def:hr_doc_defs ( name_fr ), employee:hr_employees ( matricule, last_name, first_name )",
    )
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) return { ok: false, error: error.message };
  const creators = [...new Set((data ?? []).map((r) => r.created_by).filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (creators.length) {
    const { data: users } = await supabase.from("sys_users").select("id, full_name, email").in("id", creators);
    for (const u of users ?? []) names.set(u.id, u.full_name || u.email || "—");
  }
  return {
    ok: true,
    data: (data ?? []).map((row) => {
      const def = (Array.isArray(row.def) ? row.def[0] : row.def) as { name_fr?: string } | null;
      const emp = (Array.isArray(row.employee) ? row.employee[0] : row.employee) as
        | { matricule?: string; last_name?: string; first_name?: string }
        | null;
      return {
        id: row.id,
        def_id: row.def_id,
        doc_name: def?.name_fr ?? "—",
        reference: row.reference,
        employee_id: row.employee_id,
        employee_name: [emp?.last_name, emp?.first_name].filter(Boolean).join(" "),
        matricule: emp?.matricule ?? "",
        status: row.status === "CANCELLED" ? "CANCELLED" : "ISSUED",
        archive_url: row.storage_path ? hrFileHref(row.storage_path) : null,
        created_at: row.created_at,
        created_by_name: (row.created_by && names.get(row.created_by)) || "—",
      };
    }),
  };
}

export async function cancelIssuedCustomDoc(id: string): Promise<ActionResult> {
  if (!UUID.test(id ?? "")) return { ok: false, error: "Document inconnu." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_doc_issued")
    .update({ status: "CANCELLED" })
    .eq("id", id)
    .eq("status", "ISSUED")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Annulation refusée (droits ou document déjà annulé)." };
  revalidatePath("/rh/documents");
  return { ok: true, data: undefined };
}
