import type { createClient } from "@/lib/supabase/server";
import { renderDocument, type DocData } from "@/lib/doc/engine";
import { DOC_TYPES, isDocType, type DocTypeId } from "@/lib/doc/registry";
import { COMPANY_PROFILE_KEYS, normalizeCompanyProfile, type HrCompanyProfile } from "@/lib/hr/company-profile";
import {
  HR_LIST_KINDS,
  LEAVE_KIND_LIST,
  printListsFrom,
  TRANSPORT_MODE_LIST,
  type HrListItem,
  type PrintLists,
} from "@/lib/hr/hr-lists";

type Db = Awaited<ReturnType<typeof createClient>>;
type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** What printing needs: the approved template of each document, the company identity and the HR lists. */
export type PrintKit = {
  company: HrCompanyProfile;
  templates: Partial<Record<DocTypeId, string>>;
  lists: PrintLists;
};

export const COMPANY_PROFILE_COLUMNS = COMPANY_PROFILE_KEYS.join(", ");

export async function loadCompanyProfile(db: Db): Promise<Result<HrCompanyProfile>> {
  const { data, error } = await db.from("hr_company_profile").select(COMPANY_PROFILE_COLUMNS).eq("id", "default").maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: normalizeCompanyProfile(data) };
}

/** Short company name (falls back to the legal name), "" when the profile is unreadable. */
export async function companyShortName(db: Db): Promise<string> {
  const company = await loadCompanyProfile(db);
  return company.ok ? company.data.short_name || company.data.name_fr : "";
}

export function missingTemplate(docType: DocTypeId) {
  return `Modèle « ${DOC_TYPES[docType].label} » introuvable : appliquez la migration des modèles de documents.`;
}

/** Latest approved version of each template. */
export async function loadApprovedTemplates(db: Db, docTypes: readonly DocTypeId[]): Promise<Result<Partial<Record<DocTypeId, string>>>> {
  const types = [...new Set(docTypes)].filter(isDocType);
  if (!types.length) return { ok: true, data: {} };
  const { data, error } = await db
    .from("doc_templates")
    .select("doc_type, html, version")
    .in("doc_type", types)
    .eq("status", "approved")
    .order("version", { ascending: false });
  if (error) return { ok: false, error: error.message };
  const out: Partial<Record<DocTypeId, string>> = {};
  for (const row of data ?? []) {
    const type = row.doc_type as DocTypeId;
    if (out[type] == null) out[type] = row.html as string;
  }
  const missing = types.find((t) => out[t] == null);
  if (missing) return { ok: false, error: missingTemplate(missing) };
  return { ok: true, data: out };
}

/** Items (archived ones included) of the HR lists edited in Paramètres RH › Listes et codes. */
export async function loadHrListItems(db: Db, kinds: readonly string[] = HR_LIST_KINDS): Promise<Result<HrListItem[]>> {
  const { data, error } = await db
    .from("hr_catalogs")
    .select("kind, code, label_fr, label_ar, extra, sort_order, is_active")
    .in("kind", [...kinds]);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as HrListItem[] };
}

export async function loadPrintKit(db: Db, docTypes: readonly DocTypeId[]): Promise<Result<PrintKit>> {
  const [company, templates, lists] = await Promise.all([
    loadCompanyProfile(db),
    loadApprovedTemplates(db, docTypes),
    loadHrListItems(db, [LEAVE_KIND_LIST, TRANSPORT_MODE_LIST]),
  ]);
  if (!company.ok) return company;
  if (!templates.ok) return templates;
  if (!lists.ok) return lists;
  return { ok: true, data: { company: company.data, templates: templates.data, lists: printListsFrom(lists.data) } };
}

/** Print HTML of a document from the kit; `origin` makes the template's relative asset URLs absolute. */
export function printFromKit(kit: PrintKit, docType: DocTypeId, data: DocData, origin = ""): Result<string> {
  const html = kit.templates[docType];
  if (html == null) return { ok: false, error: missingTemplate(docType) };
  return { ok: true, data: renderDocument(html, data, origin) };
}
