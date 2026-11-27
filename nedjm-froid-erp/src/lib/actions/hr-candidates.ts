"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { listCatalogItems } from "@/lib/actions/hr-catalogs";
import { clientTermsForContract, listOpenClientContracts, upsertHrContract } from "@/lib/actions/hr-contracts";
import {
  appendClientTerms,
  asStoredClientTerms,
  clientTermsKey,
  posteMatchesLabor,
  type StoredClientTerms,
} from "@/lib/hr/client-contract-terms";
import { upsertHrFile } from "@/lib/actions/hr-documents";
import {
  CONTRACT_DOCUMENT,
  FICHE_DOCUMENT,
  canPromote,
  contractTermsChanged,
  cycleStep,
  identityChanged,
  identityRequirements,
  producedArchived,
  type CycleDocument,
  type CycleStep,
  type DocStatus,
  type IdentityFields,
  type IdentitySlot,
} from "@/lib/hr/candidate-cycle";
import { candidateContractHtml, candidateFicheHtml } from "@/lib/hr/candidate-print";
import { HR_DOCS_BUCKET, hrFileDisplayUrl, hrFileHref } from "@/lib/hr/hr-file-url";
import { nextMatriculeForHire } from "@/lib/hr/employee-matricule";
import { htmlToPdf } from "@/lib/pdf/html-to-pdf";
import { hrPdfOptions, requestOrigin, uploadHrPdf } from "@/lib/pdf/print-archive";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export type CandidateRow = IdentityFields & {
  id: string;
  phone: string | null;
  cycle_step: CycleStep;
  employee_id: string | null;
  site_id: string | null;
  activity_code_id: string | null;
  contract_type_code: string | null;
  poste_fr: string | null;
  salaire_base_monthly: number | null;
  contract_start: string | null;
  contract_end: string | null;
  client_contract_id: string | null;
  client_terms: StoredClientTerms | null;
  promoted_at: string | null;
};

export type CandidateDocumentRow = {
  id: string;
  candidate_id: string;
  doc_code: string;
  family: "INCOMING" | "PRODUCED";
  version_no: number;
  is_current: boolean;
  status: DocStatus;
  file_url: string | null;
  file_name: string | null;
  specimen_url: string | null;
  specimen_name: string | null;
  reject_reason: string | null;
  created_at: string;
};

export type CandidateCycleData = {
  candidates: CandidateRow[];
  documents: CandidateDocumentRow[];
  identitySlots: IdentitySlot[];
  notice: string | null;
};

const CANDIDATE_SELECT =
  "id, last_name, first_name, last_name_ar, first_name_ar, nin, birth_date, phone, cycle_step, employee_id, site_id, activity_code_id, contract_type_code, poste_fr, salaire_base_monthly, contract_start, contract_end, client_contract_id, client_terms, promoted_at";

const DOC_SELECT =
  "id, candidate_id, doc_code, family, version_no, is_current, status, file_url, file_name, storage_path, specimen_url, specimen_name, specimen_path, reject_reason, created_at";

const STATUSES = new Set<DocStatus>([
  "MISSING",
  "UPLOADED",
  "REJECTED",
  "VALIDATED",
  "GENERATED",
  "PENDING_REVIEW",
  "ARCHIVED",
]);

function revalidate() {
  revalidatePath("/rh/candidats");
  revalidatePath("/rh/employes");
  revalidatePath("/rh/presence");
}

function dateOrNull(value: unknown): string | null {
  const text = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function textOrNull(value: unknown, max: number): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, max);
}

function mapCandidate(row: Record<string, unknown>): CandidateRow {
  return {
    id: String(row.id),
    last_name: String(row.last_name ?? ""),
    first_name: String(row.first_name ?? ""),
    last_name_ar: textOrNull(row.last_name_ar, 80),
    first_name_ar: textOrNull(row.first_name_ar, 80),
    nin: textOrNull(row.nin, 20),
    birth_date: dateOrNull(row.birth_date),
    phone: textOrNull(row.phone, 30),
    cycle_step: (row.cycle_step as CycleStep) || "IDENTITY",
    employee_id: row.employee_id ? String(row.employee_id) : null,
    site_id: row.site_id ? String(row.site_id) : null,
    activity_code_id: row.activity_code_id ? String(row.activity_code_id) : null,
    contract_type_code: textOrNull(row.contract_type_code, 40),
    poste_fr: textOrNull(row.poste_fr, 120),
    salaire_base_monthly: row.salaire_base_monthly == null ? null : Number(row.salaire_base_monthly),
    contract_start: dateOrNull(row.contract_start),
    contract_end: dateOrNull(row.contract_end),
    client_contract_id: row.client_contract_id ? String(row.client_contract_id) : null,
    client_terms: asStoredClientTerms(row.client_terms),
    promoted_at: row.promoted_at ? String(row.promoted_at) : null,
  };
}

function mapDocument(row: Record<string, unknown>): CandidateDocumentRow {
  const status = String(row.status ?? "");
  return {
    id: String(row.id),
    candidate_id: String(row.candidate_id),
    doc_code: String(row.doc_code),
    family: row.family === "PRODUCED" ? "PRODUCED" : "INCOMING",
    version_no: Number(row.version_no ?? 1),
    is_current: row.is_current !== false,
    status: STATUSES.has(status as DocStatus) ? (status as DocStatus) : "MISSING",
    file_url: hrFileDisplayUrl(row.storage_path as string | null, row.file_url as string | null),
    file_name: textOrNull(row.file_name, 240),
    specimen_url: hrFileDisplayUrl(row.specimen_path as string | null, row.specimen_url as string | null),
    specimen_name: textOrNull(row.specimen_name, 240),
    reject_reason: textOrNull(row.reject_reason, 400),
    created_at: String(row.created_at ?? ""),
  };
}

function asCycle(docs: CandidateDocumentRow[]): CycleDocument[] {
  return docs.map((doc) => ({
    doc_code: doc.doc_code,
    family: doc.family,
    is_current: doc.is_current,
    status: doc.status,
  }));
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadRaw(supabase: Supabase) {
  const [candidates, documents, catalogs] = await Promise.all([
    supabase.from("hr_candidates").select(CANDIDATE_SELECT).order("updated_at", { ascending: false }).limit(500),
    supabase.from("hr_candidate_documents").select(DOC_SELECT).order("created_at", { ascending: false }).limit(4000),
    listCatalogItems(),
  ]);
  if (candidates.error) return { ok: false as const, error: candidates.error.message };
  if (documents.error) return { ok: false as const, error: documents.error.message };
  if (!catalogs.ok) return { ok: false as const, error: catalogs.error };
  return {
    ok: true as const,
    candidates: (candidates.data ?? []).map((row) => mapCandidate(row as Record<string, unknown>)),
    documents: (documents.data ?? []).map((row) => mapDocument(row as Record<string, unknown>)),
    identitySlots: identityRequirements(catalogs.data),
  };
}

async function bundle(supabase: Supabase, notice: string | null = null): Promise<ActionResult<CandidateCycleData>> {
  const raw = await loadRaw(supabase);
  if (!raw.ok) return raw;
  const candidates: CandidateRow[] = [];
  for (const candidate of raw.candidates) {
    const docs = raw.documents.filter((doc) => doc.candidate_id === candidate.id);
    const step = cycleStep({
      promoted: Boolean(candidate.employee_id),
      docs: asCycle(docs),
      requiredIdentity: raw.identitySlots,
    });
    if (step !== candidate.cycle_step) {
      await supabase.from("hr_candidates").update({ cycle_step: step }).eq("id", candidate.id);
    }
    candidates.push({ ...candidate, cycle_step: step });
  }
  return { ok: true, data: { candidates, documents: raw.documents, identitySlots: raw.identitySlots, notice } };
}

async function oneCandidate(supabase: Supabase, id: string): Promise<CandidateRow | null> {
  const { data, error } = await supabase.from("hr_candidates").select(CANDIDATE_SELECT).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return mapCandidate(data as Record<string, unknown>);
}

async function currentDocs(supabase: Supabase, candidateId: string): Promise<CandidateDocumentRow[]> {
  const { data, error } = await supabase
    .from("hr_candidate_documents")
    .select(DOC_SELECT)
    .eq("candidate_id", candidateId);
  if (error) return [];
  return (data ?? []).map((row) => mapDocument(row as Record<string, unknown>));
}

async function closeCurrent(supabase: Supabase, candidateId: string, codes: string[]) {
  if (!codes.length) return { ok: true as const };
  const { error } = await supabase
    .from("hr_candidate_documents")
    .update({ is_current: false })
    .eq("candidate_id", candidateId)
    .eq("is_current", true)
    .in("doc_code", codes);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

function nextVersion(docs: CandidateDocumentRow[], code: string): number {
  return docs.filter((doc) => doc.doc_code === code).reduce((max, doc) => Math.max(max, doc.version_no), 0) + 1;
}

function requireName(last: string, first: string): string | null {
  if (last.trim().length < 1 || first.trim().length < 1) return "Nom et prénom requis. · اللقب والاسم مطلوبان.";
  if (last.trim().length > 80 || first.trim().length > 80) return "Nom trop long.";
  return null;
}

export async function listCandidateCycle(): Promise<ActionResult<CandidateCycleData>> {
  const supabase = await createClient();
  return bundle(supabase);
}

export async function createCandidate(input: {
  last_name: string;
  first_name: string;
  last_name_ar?: string;
  first_name_ar?: string;
  nin?: string;
  birth_date?: string;
  phone?: string;
}): Promise<ActionResult<CandidateCycleData>> {
  const last = input.last_name.trim();
  const first = input.first_name.trim();
  const nameError = requireName(last, first);
  if (nameError) return { ok: false, error: nameError };
  const birth = dateOrNull(input.birth_date);
  if (input.birth_date && !birth) return { ok: false, error: "Date de naissance invalide." };
  const supabase = await createClient();
  const { error } = await supabase.from("hr_candidates").insert({
    last_name: last,
    first_name: first,
    last_name_ar: textOrNull(input.last_name_ar, 80),
    first_name_ar: textOrNull(input.first_name_ar, 80),
    nin: textOrNull(input.nin, 20),
    birth_date: birth,
    phone: textOrNull(input.phone, 30),
    cycle_step: "IDENTITY",
  });
  if (error) return { ok: false, error: error.message };
  revalidate();
  return bundle(supabase);
}

export async function saveCandidateIdentity(input: {
  id: string;
  last_name: string;
  first_name: string;
  last_name_ar?: string;
  first_name_ar?: string;
  nin?: string;
  birth_date?: string;
  phone?: string;
}): Promise<ActionResult<CandidateCycleData>> {
  const last = input.last_name.trim();
  const first = input.first_name.trim();
  const nameError = requireName(last, first);
  if (nameError) return { ok: false, error: nameError };
  const birth = dateOrNull(input.birth_date);
  if (input.birth_date && !birth) return { ok: false, error: "Date de naissance invalide." };
  const supabase = await createClient();
  const current = await oneCandidate(supabase, input.id);
  if (!current) return { ok: false, error: "Candidat introuvable." };
  if (current.employee_id) return { ok: false, error: "Ce candidat est déjà dans la base des salariés." };
  const next = {
    last_name: last,
    first_name: first,
    last_name_ar: textOrNull(input.last_name_ar, 80),
    first_name_ar: textOrNull(input.first_name_ar, 80),
    nin: textOrNull(input.nin, 20),
    birth_date: birth,
    phone: textOrNull(input.phone, 30),
  };
  if (identityChanged(current, next)) {
    const closed = await closeCurrent(supabase, current.id, [FICHE_DOCUMENT, CONTRACT_DOCUMENT]);
    if (!closed.ok) return closed;
  }
  const { error } = await supabase
    .from("hr_candidates")
    .update(next)
    .eq("id", current.id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return bundle(
    supabase,
    identityChanged(current, next)
      ? "Identité modifiée : la fiche et le contrat signés sont à rééditer."
      : null,
  );
}

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"];

function extension(type: string): string {
  if (type === "application/pdf") return "pdf";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "jpg";
}

export async function uploadCandidateFile(formData: FormData): Promise<ActionResult<CandidateCycleData>> {
  const file = formData.get("file");
  const candidateId = String(formData.get("candidate_id") || "").trim();
  const docCode = String(formData.get("doc_code") || "").trim().toUpperCase();
  const role = String(formData.get("role") || "").trim();
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choisissez un fichier. · اختر ملفاً." };
  if (!candidateId || !/^[A-Z][A-Z0-9_]{0,39}$/.test(docCode)) {
    return { ok: false, error: "Document requis." };
  }
  if (file.size > 15 * 1024 * 1024) return { ok: false, error: "Fichier trop volumineux (15 Mo max)." };
  if (!ALLOWED_TYPES.includes(file.type)) return { ok: false, error: "Formats : PDF, JPG, PNG, WEBP." };
  const supabase = await createClient();
  const candidate = await oneCandidate(supabase, candidateId);
  if (!candidate) return { ok: false, error: "Candidat introuvable." };
  if (candidate.employee_id) return { ok: false, error: "Ce candidat est déjà dans la base des salariés." };
  const docs = await currentDocs(supabase, candidateId);
  const catalogs = await listCatalogItems();
  const slots = identityRequirements(catalogs.ok ? catalogs.data : []);
  const current = docs.find((doc) => doc.is_current && doc.doc_code === docCode) ?? null;

  if (role === "scan") {
    if (docCode !== FICHE_DOCUMENT && docCode !== CONTRACT_DOCUMENT) {
      return { ok: false, error: "Le scan signé concerne la fiche ou le contrat." };
    }
    if (!current || (current.status !== "GENERATED" && current.status !== "REJECTED" && current.status !== "PENDING_REVIEW")) {
      return { ok: false, error: "Imprimez d'abord la version, puis scannez cette même version." };
    }
  } else if (role === "incoming") {
    if (docCode === FICHE_DOCUMENT || docCode === CONTRACT_DOCUMENT) {
      return { ok: false, error: "Cette pièce est produite par l'application." };
    }
    const allowed = new Set(slots.map((slot) => slot.code));
    if (!allowed.has(docCode)) return { ok: false, error: "Cette pièce ne fait pas partie du cycle." };
  } else {
    return { ok: false, error: "Rôle de fichier inconnu." };
  }

  const path = `${candidateId.replace(/[^a-zA-Z0-9-]/g, "")}/${docCode}-${crypto.randomUUID()}.${extension(file.type)}`;
  const { error: upErr } = await supabase.storage.from(HR_DOCS_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (upErr) return { ok: false, error: upErr.message };
  const href = hrFileHref(path);
  const fileName = file.name || `${docCode}.${extension(file.type)}`;

  if (role === "scan" && current) {
    const { error } = await supabase
      .from("hr_candidate_documents")
      .update({
        status: "PENDING_REVIEW",
        file_url: href,
        file_name: fileName,
        storage_path: path,
        reject_reason: null,
      })
      .eq("id", current.id);
    if (error) return { ok: false, error: error.message };
  } else {
    if (current?.status === "VALIDATED") {
      const closed = await closeCurrent(supabase, candidateId, [FICHE_DOCUMENT, CONTRACT_DOCUMENT]);
      if (!closed.ok) return closed;
    }
    const closed = await closeCurrent(supabase, candidateId, [docCode]);
    if (!closed.ok) return closed;
    const { error } = await supabase.from("hr_candidate_documents").insert({
      candidate_id: candidateId,
      doc_code: docCode,
      family: "INCOMING",
      version_no: nextVersion(docs, docCode),
      is_current: true,
      status: "UPLOADED",
      file_url: href,
      file_name: fileName,
      storage_path: path,
    });
    if (error) return { ok: false, error: error.message };
  }
  revalidate();
  return bundle(supabase);
}

export async function reviewCandidateDocument(input: {
  candidate_id: string;
  doc_code: string;
  decision: "VALIDATED" | "REJECTED" | "ARCHIVED";
  reason?: string;
}): Promise<ActionResult<CandidateCycleData>> {
  const docCode = input.doc_code.trim().toUpperCase();
  const reason = textOrNull(input.reason, 400);
  if (input.decision === "REJECTED" && !reason) {
    return { ok: false, error: "Indiquez le motif du rejet. · اذكر سبب الرفض." };
  }
  const supabase = await createClient();
  const candidate = await oneCandidate(supabase, input.candidate_id);
  if (!candidate) return { ok: false, error: "Candidat introuvable." };
  if (candidate.employee_id) return { ok: false, error: "Ce candidat est déjà dans la base des salariés." };
  const docs = await currentDocs(supabase, candidate.id);
  const current = docs.find((doc) => doc.is_current && doc.doc_code === docCode);
  if (!current) return { ok: false, error: "Aucune version en cours pour cette pièce." };

  if (current.family === "INCOMING") {
    if (current.status !== "UPLOADED" && current.status !== "REJECTED") {
      return { ok: false, error: "La pièce doit être téléversée avant la décision." };
    }
    if (input.decision === "ARCHIVED") return { ok: false, error: "Une pièce reçue se valide, elle ne s'archive pas comme un scan signé." };
    const { error } = await supabase
      .from("hr_candidate_documents")
      .update({
        status: input.decision,
        reject_reason: input.decision === "REJECTED" ? reason : null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", current.id);
    if (error) return { ok: false, error: error.message };
  } else {
    if (current.status !== "PENDING_REVIEW") {
      return { ok: false, error: "Le scan signé doit être téléversé avant l'archivage." };
    }
    if (input.decision === "VALIDATED") return { ok: false, error: "Le scan se confirme comme archive." };
    const { error } = await supabase
      .from("hr_candidate_documents")
      .update({
        status: input.decision === "ARCHIVED" ? "ARCHIVED" : "REJECTED",
        reject_reason: input.decision === "REJECTED" ? reason : null,
        reviewed_at: new Date().toISOString(),
        ...(input.decision === "REJECTED"
          ? { file_url: null, file_name: null, storage_path: null }
          : {}),
      })
      .eq("id", current.id);
    if (error) return { ok: false, error: error.message };
  }
  revalidate();
  return bundle(supabase);
}

export async function saveCandidateContract(input: {
  id: string;
  site_id: string;
  activity_code_id: string;
  contract_type_code?: string;
  poste_fr?: string;
  salaire_base_monthly: number;
  contract_start: string;
  contract_end?: string;
  client_contract_id?: string;
  clause_ids?: string[];
}): Promise<ActionResult<CandidateCycleData>> {
  const start = dateOrNull(input.contract_start);
  const end = dateOrNull(input.contract_end);
  if (!start) return { ok: false, error: "Date de début invalide. · تاريخ البداية غير صالح." };
  if (input.contract_end && !end) return { ok: false, error: "Date de fin invalide." };
  if (end && end < start) return { ok: false, error: "La fin précède le début." };
  if (!input.site_id || !input.activity_code_id) return { ok: false, error: "Site et activité requis." };
  if (!Number.isFinite(input.salaire_base_monthly) || input.salaire_base_monthly < 0) {
    return { ok: false, error: "Salaire de base requis." };
  }
  const supabase = await createClient();
  const candidate = await oneCandidate(supabase, input.id);
  if (!candidate) return { ok: false, error: "Candidat introuvable." };
  if (candidate.employee_id) return { ok: false, error: "Ce candidat est déjà dans la base des salariés." };
  const docs = await currentDocs(supabase, candidate.id);
  if (!producedArchived(asCycle(docs), FICHE_DOCUMENT)) {
    return { ok: false, error: "Archivez la fiche signée avant de préparer le contrat." };
  }
  const linked = await clientTermsForContract(supabase, {
    site_id: input.site_id,
    poste_fr: textOrNull(input.poste_fr, 120),
    poste_ar: null,
    client_contract_id: textOrNull(input.client_contract_id, 40),
    clause_ids: input.clause_ids ?? [],
  });
  if (!linked.ok) return linked;
  const next = {
    site_id: input.site_id,
    activity_code_id: input.activity_code_id,
    contract_type_code: textOrNull(input.contract_type_code, 40),
    poste_fr: linked.data?.poste_label || textOrNull(input.poste_fr, 120),
    salaire_base_monthly: input.salaire_base_monthly,
    contract_start: start,
    contract_end: end,
    client_contract_id: linked.data?.client_contract_id ?? null,
    client_terms: linked.data,
  };
  let notice: string | null = null;
  if (
    contractTermsChanged(
      { ...candidate, client_terms_key: clientTermsKey(candidate.client_terms) },
      { ...next, client_terms_key: clientTermsKey(linked.data) },
    )
  ) {
    const closed = await closeCurrent(supabase, candidate.id, [CONTRACT_DOCUMENT]);
    if (!closed.ok) return closed;
    if (docs.some((doc) => doc.is_current && doc.doc_code === CONTRACT_DOCUMENT)) {
      notice = "Termes modifiés : le contrat signé est à rééditer.";
    }
  }
  const { error } = await supabase.from("hr_candidates").update(next).eq("id", candidate.id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return bundle(supabase, notice);
}

export async function generateCandidateDocument(input: {
  id: string;
  kind: "FICHE" | "CONTRACT";
}): Promise<ActionResult<CandidateCycleData>> {
  const code = input.kind === "CONTRACT" ? CONTRACT_DOCUMENT : FICHE_DOCUMENT;
  const supabase = await createClient();
  const candidate = await oneCandidate(supabase, input.id);
  if (!candidate) return { ok: false, error: "Candidat introuvable." };
  if (candidate.employee_id) return { ok: false, error: "Ce candidat est déjà dans la base des salariés." };
  const catalogs = await listCatalogItems();
  if (!catalogs.ok) return catalogs;
  const slots = identityRequirements(catalogs.data);
  const docs = await currentDocs(supabase, candidate.id);
  const cycleDocs = asCycle(docs);
  if (code === FICHE_DOCUMENT) {
    const step = cycleStep({ promoted: false, docs: cycleDocs, requiredIdentity: slots });
    if (step === "IDENTITY") {
      return { ok: false, error: "Validez d'abord chaque pièce d'identité obligatoire." };
    }
  } else {
    if (!producedArchived(cycleDocs, FICHE_DOCUMENT)) {
      return { ok: false, error: "Archivez la fiche signée avant d'imprimer le contrat." };
    }
    if (!candidate.site_id || !candidate.activity_code_id || !candidate.contract_start || candidate.salaire_base_monthly == null) {
      return { ok: false, error: "Enregistrez le site, l'activité, le poste, le salaire et la date de début." };
    }
    const clients = await listOpenClientContracts();
    if (!clients.ok) return clients;
    const onSite = clients.data.filter((row) => row.site_id === candidate.site_id);
    if (onSite.length && !candidate.client_contract_id) {
      return {
        ok: false,
        error: "Choisissez le contrat client de cette affectation avant d'imprimer. · اختاروا عقد العميل قبل الطباعة.",
      };
    }
  }

  const version = nextVersion(docs, code);
  let html = candidateFicheHtml(candidate, version);
  if (code === CONTRACT_DOCUMENT) {
    const [site, activity] = await Promise.all([
      supabase.from("ref_sites").select("name_fr").eq("id", candidate.site_id).maybeSingle(),
      supabase.from("ref_activity_codes").select("code, label_fr").eq("id", candidate.activity_code_id).maybeSingle(),
    ]);
    html = appendClientTerms(
      candidateContractHtml(candidate, {
        ...candidate,
        site_name: site.data?.name_fr ?? "",
        activity_label: activity.data ? `${activity.data.code} · ${activity.data.label_fr}` : "",
      }, version),
      candidate.client_terms,
    );
  }
  const origin = await requestOrigin();
  let pdf: Buffer;
  try {
    pdf = await htmlToPdf(html, hrPdfOptions(supabase, origin));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Échec de génération du PDF." };
  }
  const path = `${candidate.id}/${code}-v${version}-${crypto.randomUUID()}.pdf`;
  const stored = await uploadHrPdf(supabase, path, pdf);
  if (stored) return { ok: false, error: stored };
  if (code === FICHE_DOCUMENT) {
    const closedContract = await closeCurrent(supabase, candidate.id, [CONTRACT_DOCUMENT]);
    if (!closedContract.ok) return closedContract;
  }
  const closed = await closeCurrent(supabase, candidate.id, [code]);
  if (!closed.ok) return closed;
  const { error } = await supabase.from("hr_candidate_documents").insert({
    candidate_id: candidate.id,
    doc_code: code,
    family: "PRODUCED",
    version_no: version,
    is_current: true,
    status: "GENERATED",
    specimen_url: hrFileHref(path),
    specimen_name: `${code}-v${version}.pdf`,
    specimen_path: path,
  });
  if (error) return { ok: false, error: error.message };
  revalidate();
  return bundle(supabase, "Version prête à imprimer. Le scan signé de cette version clôt l'étape.");
}

export async function promoteCandidate(id: string): Promise<ActionResult<CandidateCycleData>> {
  const supabase = await createClient();
  const candidate = await oneCandidate(supabase, id);
  if (!candidate) return { ok: false, error: "Candidat introuvable." };
  if (candidate.employee_id) return { ok: false, error: "Déjà transféré dans la base des salariés." };
  const catalogs = await listCatalogItems();
  if (!catalogs.ok) return catalogs;
  const slots = identityRequirements(catalogs.data);
  const docs = await currentDocs(supabase, candidate.id);
  if (!canPromote({ promoted: false, docs: asCycle(docs), requiredIdentity: slots })) {
    return { ok: false, error: "Archivez le contrat signé de la version en cours avant le transfert." };
  }
  if (!candidate.site_id || !candidate.activity_code_id || !candidate.contract_start || candidate.salaire_base_monthly == null) {
    return { ok: false, error: "Les termes du contrat sont incomplets." };
  }
  const { data: mats, error: matError } = await supabase.from("hr_employees").select("matricule");
  if (matError) return { ok: false, error: matError.message };
  const matricule = nextMatriculeForHire(
    candidate.contract_start,
    (mats ?? []).map((row) => String(row.matricule ?? "")),
  );
  if (!matricule) return { ok: false, error: "Matricule impossible à attribuer pour cette date." };

  const clients = await listOpenClientContracts();
  if (!clients.ok) return clients;
  const onSite = clients.data.filter((row) => row.site_id === candidate.site_id);
  let clientContractId: string | null = null;
  let clauseIds: string[] = [];
  let posteFr = candidate.poste_fr;
  if (onSite.length && !candidate.client_contract_id) {
    return {
      ok: false,
      error: "Choisissez le contrat client de cette affectation avant le transfert. · اختاروا عقد العميل قبل النقل.",
    };
  }
  const chosen = onSite.find((row) => row.id === candidate.client_contract_id);
  if (candidate.client_contract_id && !chosen) {
    return { ok: false, error: "Le contrat client choisi n'est plus ouvert sur cette affectation." };
  }
  if (chosen) {
    const poste = posteMatchesLabor(candidate.client_terms?.poste_label || candidate.poste_fr || "", chosen.labor);
    if (chosen.labor.length && !poste) {
      return {
        ok: false,
        error: `Le poste doit être l'un des postes du contrat client ${chosen.contract_number} : ${chosen.labor.map((item) => item.designation).join(", ")}.`,
      };
    }
    clientContractId = chosen.id;
    clauseIds = candidate.client_terms?.clauses.map((clause) => clause.id) ?? [];
    if (poste) posteFr = poste.designation;
  }

  const { data: created, error: createError } = await supabase
    .from("hr_employees")
    .insert({
      matricule,
      last_name: candidate.last_name,
      first_name: candidate.first_name,
      last_name_ar: candidate.last_name_ar,
      first_name_ar: candidate.first_name_ar,
      nin: candidate.nin,
      birth_date: candidate.birth_date,
      hired_at: candidate.contract_start,
      status: "ACTIVE",
      fiche_done_at: new Date().toISOString(),
      affiliation_legacy: false,
      affiliation_start: null,
    })
    .select("id")
    .single();
  if (createError || !created) return { ok: false, error: createError?.message ?? "Création du salarié refusée." };

  const contract = await upsertHrContract({
    employee_id: created.id,
    site_id: candidate.site_id,
    activity_code_id: candidate.activity_code_id,
    contract_type_code: candidate.contract_type_code,
    poste_fr: posteFr,
    affectation_principale: true,
    salaire_base_monthly: candidate.salaire_base_monthly,
    salaire_net_ref_monthly: candidate.salaire_base_monthly,
    start_date: candidate.contract_start,
    end_date: candidate.contract_end,
    status: "ACTIVE",
    client_contract_id: clientContractId,
    clause_ids: clauseIds,
  });
  if (!contract.ok) {
    await supabase.from("hr_employees").delete().eq("id", created.id);
    return contract;
  }

  let notice = `Salarié ${matricule} créé. Il apparaît au pointage après l'attestation CNAS et sa date de début.`;
  for (const doc of docs.filter((row) => row.is_current && (row.status === "VALIDATED" || row.status === "ARCHIVED"))) {
    if (!doc.file_url) continue;
    const stored = await supabase
      .from("hr_candidate_documents")
      .select("storage_path, file_name")
      .eq("id", doc.id)
      .maybeSingle();
    const storagePath = stored.data?.storage_path ? String(stored.data.storage_path) : null;
    if (!storagePath) continue;
    const saved = await upsertHrFile({
      employee_id: created.id,
      doc_type_code: doc.doc_code === CONTRACT_DOCUMENT ? "CONTRACT_SCAN" : doc.doc_code,
      file_url: hrFileHref(storagePath),
      file_name: stored.data?.file_name ? String(stored.data.file_name) : doc.file_name,
      storage_path: storagePath,
    });
    if (!saved.ok) notice = `${notice} Copie d'archive incomplète : ${saved.error}`;
  }

  const { error: linkError } = await supabase
    .from("hr_candidates")
    .update({
      employee_id: created.id,
      cycle_step: "PROMOTED",
      promoted_at: new Date().toISOString(),
    })
    .eq("id", candidate.id);
  if (linkError) return { ok: false, error: linkError.message };
  revalidate();
  return bundle(supabase, notice);
}
