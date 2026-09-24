"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import {
  hrEmployeeIdSchema,
  hrEmployeeUpsertSchema,
} from "@/lib/validations/hr-employee";
import {
  hrEmployeeFullSchema as hrFull,
  hrEmployeeFieldSchema,
  hrEmployeeFieldMetaSchema,
} from "@/lib/validations/hr";
import { maritalAllowsChildren, missingRequiredFields } from "@/lib/hr/employee-field-utils";
import {
  digitsOnly,
  isLatinUppercaseField,
  normalizeFicheValues,
  validateFicheConstraints,
} from "@/lib/hr/employee-fiche-constraints";
import { missingRequiredDocuments } from "@/lib/hr/required-documents";
import { listCatalogItems } from "@/lib/actions/hr-catalogs";
import { listHrFilesForEmployee } from "@/lib/actions/hr-documents";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type HrEmployeeRow = {
  id: string;
  matricule: string;
  last_name: string;
  first_name: string;
  last_name_ar: string | null;
  first_name_ar: string | null;
  nss: string | null;
  nin: string | null;
  birth_date: string | null;
  hired_at: string | null;
  photo_url: string | null;
  irg_category: "STANDARD" | "DISABLED_OR_RETIREE";
  status: string;
  created_at: string;
  updated_at: string;
  import_seq?: number | null;
  id_number?: string | null;
  id_issued_on?: string | null;
  id_issued_by?: string | null;
  fiche_affectation?: string | null;
  fiche_poste?: string | null;
  id_type_code?: string | null;
};

export type HrEmployeeFiche = HrEmployeeRow & {
  attrs: Record<string, unknown>;
  sex_code: string | null;
  marital_code: string | null;
  children_count: number | null;
  blood_code: string | null;
  birth_place_ar: string | null;
  birth_place_fr: string | null;
  birth_act_no: string | null;
  father_name: string | null;
  mother_name: string | null;
  nationality: string | null;
  commune_birth: string | null;
  wilaya_birth: string | null;
  address_ar: string | null;
  address_fr: string | null;
  wilaya_code: string | null;
  commune: string | null;
  postal_code: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  payment_mode_code: string | null;
  account_no: string | null;
  account_key: string | null;
  declaration_date: string | null;
  social_profile_code: string | null;
  level_code: string | null;
  diploma_ar: string | null;
  diploma_fr: string | null;
  experience_years: number | null;
  languages: string | null;
};

export type HrEmployeeField = {
  id: string;
  code: string;
  label_ar: string;
  label_fr: string;
  value_type: "text" | "date" | "number" | "catalog";
  catalog_kind: string | null;
  storage_group: string;
  section_ar: string | null;
  section_fr: string | null;
  sort_order: number;
  is_system: boolean;
  is_active: boolean;
  is_required: boolean;
};

function revalidateHr() {
  revalidatePath("/rh");
  revalidatePath("/rh/employes");
  revalidatePath("/rh/contrats");
  revalidatePath("/rh/documents");
  revalidatePath("/referentiels/contrats");
  revalidatePath("/rh/parametres");
}

function asAttrs(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function mergeFiche(
  emp: HrEmployeeRow & { attrs?: unknown },
  c: Record<string, unknown> | null,
  k: Record<string, unknown> | null,
  b: Record<string, unknown> | null,
  s: Record<string, unknown> | null,
  q: Record<string, unknown> | null,
): HrEmployeeFiche {
  return {
    id: emp.id,
    matricule: emp.matricule,
    last_name: emp.last_name,
    first_name: emp.first_name,
    last_name_ar: emp.last_name_ar,
    first_name_ar: emp.first_name_ar,
    nss: emp.nss,
    nin: emp.nin,
    birth_date: emp.birth_date,
    hired_at: emp.hired_at,
    photo_url: emp.photo_url,
    irg_category: emp.irg_category,
    status: emp.status,
    created_at: emp.created_at,
    updated_at: emp.updated_at,
    attrs: asAttrs(emp.attrs),
    sex_code: (c?.sex_code as string | null) ?? null,
    marital_code: (c?.marital_code as string | null) ?? null,
    children_count:
      c?.children_count == null || c.children_count === ""
        ? null
        : Number(c.children_count),
    blood_code: (c?.blood_code as string | null) ?? null,
    birth_place_ar: (c?.birth_place_ar as string | null) ?? null,
    birth_place_fr: (c?.birth_place_fr as string | null) ?? null,
    birth_act_no: (c?.birth_act_no as string | null) ?? null,
    father_name: (c?.father_name as string | null) ?? null,
    mother_name: (c?.mother_name as string | null) ?? null,
    nationality: (c?.nationality as string | null) ?? null,
    commune_birth: (c?.commune_birth as string | null) ?? null,
    wilaya_birth: (c?.wilaya_birth as string | null) ?? null,
    address_ar: (k?.address_ar as string | null) ?? null,
    address_fr: (k?.address_fr as string | null) ?? null,
    wilaya_code: (k?.wilaya_code as string | null) ?? null,
    commune: (k?.commune as string | null) ?? null,
    postal_code: (k?.postal_code as string | null) ?? null,
    phone: (k?.phone as string | null) ?? null,
    whatsapp: (k?.whatsapp as string | null) ?? null,
    email: (k?.email as string | null) ?? null,
    payment_mode_code: (b?.payment_mode_code as string | null) ?? null,
    account_no: (b?.account_no as string | null) ?? null,
    account_key: (b?.account_key as string | null) ?? null,
    declaration_date: (s?.declaration_date as string | null) ?? null,
    social_profile_code: (s?.social_profile_code as string | null) ?? null,
    level_code: (q?.level_code as string | null) ?? null,
    diploma_ar: (q?.diploma_ar as string | null) ?? null,
    diploma_fr: (q?.diploma_fr as string | null) ?? null,
    experience_years:
      q?.experience_years == null ? null : Number(q.experience_years),
    languages: (q?.languages as string | null) ?? null,
    import_seq: importSeq(emp.attrs),
  };
}

function importSeq(attrs: unknown): number | null {
  const raw = asAttrs(attrs).excel_no;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function attrText(attrs: unknown, key: string): string | null {
  if (!attrs || typeof attrs !== "object" || Array.isArray(attrs)) return null;
  const value = (attrs as Record<string, unknown>)[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function sortEmployees<T extends { matricule: string; import_seq?: number | null }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const aOk = a.import_seq != null;
    const bOk = b.import_seq != null;
    if (aOk && bOk && a.import_seq !== b.import_seq) {
      return (a.import_seq as number) - (b.import_seq as number);
    }
    if (aOk && !bOk) return -1;
    if (!aOk && bOk) return 1;
    return a.matricule.localeCompare(b.matricule, "fr", { numeric: true });
  });
}

const EMP_CORE_SELECT =
  "id, matricule, last_name, first_name, last_name_ar, first_name_ar, nss, nin, birth_date, hired_at, photo_url, irg_category, status, created_at, updated_at, attrs";

export async function nextHrMatricule(): Promise<ActionResult<{ matricule: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_next_matricule");
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { matricule: String(data ?? "") } };
}

export async function listHrEmployeeFiches(): Promise<ActionResult<HrEmployeeFiche[]>> {
  const supabase = await createClient();
  const { data: emps, error } = await supabase
    .from("hr_employees")
    .select(EMP_CORE_SELECT)
    .limit(2000);
  if (error) {
    return {
      ok: false,
      error:
        error.message.includes("permission") || error.code === "42501"
          ? "Accès refusé à l'écran Employés (RBAC)."
          : error.message,
    };
  }
  const rows = (emps ?? []) as Array<HrEmployeeRow & { attrs?: unknown }>;
  const ids = rows.map((r) => r.id);
  if (!ids.length) return { ok: true, data: [] };

  const [civil, contacts, bank, social, qual] = await Promise.all([
    supabase.from("hr_employee_civil").select("*").in("employee_id", ids),
    supabase.from("hr_employee_contacts").select("*").in("employee_id", ids),
    supabase.from("hr_employee_bank").select("*").in("employee_id", ids),
    supabase.from("hr_employee_social").select("*").in("employee_id", ids),
    supabase.from("hr_employee_qualifications").select("*").in("employee_id", ids),
  ]);

  const mapBy = (list: Array<Record<string, unknown>> | null) => {
    const m = new Map<string, Record<string, unknown>>();
    for (const row of list ?? []) {
      m.set(String(row.employee_id), row);
    }
    return m;
  };
  const civils = mapBy(civil.data as Array<Record<string, unknown>> | null);
  const ks = mapBy(contacts.data as Array<Record<string, unknown>> | null);
  const banks = mapBy(bank.data as Array<Record<string, unknown>> | null);
  const socials = mapBy(social.data as Array<Record<string, unknown>> | null);
  const quals = mapBy(qual.data as Array<Record<string, unknown>> | null);

  return {
    ok: true,
    data: sortEmployees(
      rows.map((emp) =>
        mergeFiche(
          {
            ...emp,
            irg_category: emp.irg_category as HrEmployeeRow["irg_category"],
          },
          civils.get(emp.id) ?? null,
          ks.get(emp.id) ?? null,
          banks.get(emp.id) ?? null,
          socials.get(emp.id) ?? null,
          quals.get(emp.id) ?? null,
        ),
      ),
    ),
  };
}

export async function listHrEmployeeRows(): Promise<ActionResult<HrEmployeeRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_employees")
    .select(
      "id, matricule, last_name, first_name, last_name_ar, first_name_ar, nss, nin, birth_date, hired_at, photo_url, irg_category, status, created_at, updated_at, attrs",
    )
    .limit(2000);

  if (error) {
    return {
      ok: false,
      error:
        error.message.includes("permission") || error.code === "42501"
          ? "Accès refusé à l'écran Employés (RBAC)."
          : error.message,
    };
  }

  return {
    ok: true,
    data: sortEmployees(
      (data ?? []).map((row) => {
        const { attrs, ...rest } = row as typeof row & { attrs?: unknown };
        return {
          ...rest,
          irg_category: rest.irg_category as HrEmployeeRow["irg_category"],
          import_seq: importSeq(attrs),
          id_number: attrText(attrs, "id_number"),
          id_issued_on: attrText(attrs, "id_issued_on"),
          id_issued_by: attrText(attrs, "id_issued_by"),
          fiche_affectation: attrText(attrs, "affectation"),
          fiche_poste: attrText(attrs, "poste"),
          id_type_code: attrText(attrs, "id_type_code"),
        };
      }),
    ),
  };
}

export async function getHrEmployeeFiche(
  id: string,
): Promise<ActionResult<HrEmployeeFiche>> {
  const supabase = await createClient();
  const { data: emp, error } = await supabase
    .from("hr_employees")
    .select(EMP_CORE_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!emp) return { ok: false, error: "Employé introuvable." };

  const [civil, contacts, bank, social, qual] = await Promise.all([
    supabase.from("hr_employee_civil").select("*").eq("employee_id", id).maybeSingle(),
    supabase.from("hr_employee_contacts").select("*").eq("employee_id", id).maybeSingle(),
    supabase.from("hr_employee_bank").select("*").eq("employee_id", id).maybeSingle(),
    supabase.from("hr_employee_social").select("*").eq("employee_id", id).maybeSingle(),
    supabase
      .from("hr_employee_qualifications")
      .select("*")
      .eq("employee_id", id)
      .maybeSingle(),
  ]);

  return {
    ok: true,
    data: mergeFiche(
      {
        ...emp,
        irg_category: emp.irg_category as HrEmployeeRow["irg_category"],
      },
      (civil.data as Record<string, unknown> | null) ?? null,
      (contacts.data as Record<string, unknown> | null) ?? null,
      (bank.data as Record<string, unknown> | null) ?? null,
      (social.data as Record<string, unknown> | null) ?? null,
      (qual.data as Record<string, unknown> | null) ?? null,
    ),
  };
}

export async function upsertHrEmployee(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
  const rawInput =
    input && typeof input === "object"
      ? (() => {
          const obj = { ...(input as Record<string, unknown>) };
          if (obj.attrs && typeof obj.attrs === "object" && !Array.isArray(obj.attrs)) {
            const attrs = { ...(obj.attrs as Record<string, unknown>) };
            for (const [k, v] of Object.entries(attrs)) {
              if (typeof v !== "string") continue;
              if (k === "id_number") attrs[k] = digitsOnly(v, 9) || null;
              else if (isLatinUppercaseField(k)) {
                attrs[k] = v.trim() ? v.toLocaleUpperCase("fr-DZ") : null;
              }
            }
            obj.attrs = attrs;
          }
          return normalizeFicheValues(obj);
        })()
      : input;

  const full = hrFull.safeParse(rawInput);
  const parsed = full.success ? full : hrEmployeeUpsertSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Données invalides",
    };
  }

  const p = parsed.data as ReturnType<typeof hrFull.parse>;
  const supabase = await createClient();

  const fieldsRes = await listHrEmployeeFields();
  if (fieldsRes.ok) {
    const checkValues: Record<string, unknown> = { ...(p as Record<string, unknown>) };
    if (full.success && full.data.attrs) {
      Object.assign(checkValues, full.data.attrs);
    }
    const missing = missingRequiredFields(checkValues, fieldsRes.data);
    if (missing.length) {
      const labels = missing
        .slice(0, 6)
        .map((f) => f.label_fr || f.label_ar || f.code)
        .join(", ");
      return {
        ok: false,
        error: `Champs obligatoires manquants · حقول إجبارية ناقصة: ${labels}`,
      };
    }
    const constraints = validateFicheConstraints(checkValues);
    if (constraints.length) {
      return { ok: false, error: constraints.map((c) => c.message).join(" ") };
    }
  }

  // Documents obligatoires : après la 1re création (employé déjà identifié)
  if (p.id) {
    const [cats, files] = await Promise.all([
      listCatalogItems(),
      listHrFilesForEmployee(p.id),
    ]);
    if (cats.ok && files.ok) {
      const missingDocs = missingRequiredDocuments(
        cats.data,
        files.data.map((f) => f.doc_type_code),
      );
      if (missingDocs.length) {
        const labels = missingDocs
          .slice(0, 6)
          .map((d) => d.label_fr || d.code)
          .join(", ");
        return {
          ok: false,
          error: `Documents obligatoires manquants : ${labels}. Téléversez-les dans l'onglet Documents puis réessayez.`,
        };
      }
    }
  }

  const core: Record<string, unknown> = {
    matricule: p.matricule,
    last_name: p.last_name,
    first_name: p.first_name,
    last_name_ar: "last_name_ar" in p ? p.last_name_ar : null,
    first_name_ar: "first_name_ar" in p ? p.first_name_ar : null,
    nss: p.nss,
    nin: p.nin,
    birth_date: p.birth_date,
    hired_at: p.hired_at,
    photo_url: "photo_url" in p ? p.photo_url : null,
    irg_category: p.irg_category,
    status: p.status,
  };
  if (full.success) {
    let previous: Record<string, unknown> = {};
    if (p.id) {
      const { data: current } = await supabase
        .from("hr_employees")
        .select("attrs")
        .eq("id", p.id)
        .maybeSingle();
      previous = asAttrs(current?.attrs);
    }
    core.attrs = { ...previous, ...(full.data.attrs ?? {}) };
  }

  let id: string | undefined = p.id;
  if (id) {
    const { data, error } = await supabase
      .from("hr_employees")
      .update(core)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) {
      return {
        ok: false,
        error: error.message.includes("hr_employees_matricule_key")
          ? "Matricule déjà utilisé."
          : error.message,
      };
    }
    if (!data) return { ok: false, error: "Employé introuvable ou accès refusé." };
    id = data.id;
  } else {
    const { data, error } = await supabase
      .from("hr_employees")
      .insert(core)
      .select("id")
      .maybeSingle();
    if (error) {
      return {
        ok: false,
        error: error.message.includes("hr_employees_matricule_key")
          ? "Matricule déjà utilisé."
          : error.message,
      };
    }
    if (!data) return { ok: false, error: "Création refusée (RBAC)." };
    id = data.id;
  }

  if (!id) return { ok: false, error: "Identifiant employé manquant." };

  if (full.success) {
    const f = full.data;
    await Promise.all([
      supabase.from("hr_employee_civil").upsert({
        employee_id: id,
        sex_code: f.sex_code,
        marital_code: f.marital_code,
        children_count: maritalAllowsChildren(f.marital_code)
          ? f.children_count ?? null
          : null,
        blood_code: f.blood_code,
        birth_place_ar: f.birth_place_ar,
        birth_place_fr: f.birth_place_fr,
        birth_act_no: f.birth_act_no,
        father_name: f.father_name,
        mother_name: f.mother_name,
        nationality: f.nationality,
        commune_birth: f.commune_birth,
        wilaya_birth: f.wilaya_birth,
      }),
      supabase.from("hr_employee_contacts").upsert({
        employee_id: id,
        address_ar: f.address_ar,
        address_fr: f.address_fr,
        wilaya_code: f.wilaya_code,
        commune: f.commune,
        postal_code: f.postal_code,
        phone: f.phone,
        whatsapp: f.whatsapp,
        email: f.email,
      }),
      supabase.from("hr_employee_bank").upsert({
        employee_id: id,
        payment_mode_code: f.payment_mode_code,
        account_no: f.account_no,
        account_key: f.account_key,
      }),
      supabase.from("hr_employee_social").upsert({
        employee_id: id,
        declaration_date: f.declaration_date,
        social_profile_code: f.social_profile_code,
      }),
    ]);
    const { data: existingQual } = await supabase
      .from("hr_employee_qualifications")
      .select("id")
      .eq("employee_id", id)
      .maybeSingle();
    const qual = {
      employee_id: id,
      level_code: f.level_code,
      diploma_ar: f.diploma_ar,
      diploma_fr: f.diploma_fr,
      experience_years: f.experience_years ?? null,
      languages: f.languages,
    };
    if (existingQual?.id) {
      await supabase
        .from("hr_employee_qualifications")
        .update(qual)
        .eq("id", existingQual.id);
    } else {
      await supabase.from("hr_employee_qualifications").insert(qual);
    }
  }

  revalidateHr();
  return { ok: true, data: { id } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erreur enregistrement employé.",
    };
  }
}

export async function setHrEmployeeStatus(
  input: unknown,
): Promise<ActionResult<{ id: string; status: string }>> {
  const parsed = hrEmployeeIdSchema
    .extend({ status: hrEmployeeUpsertSchema.shape.status })
    .safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Données invalides",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_employees")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .select("id, status")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return { ok: false, error: "Employé introuvable ou accès refusé." };
  }
  revalidateHr();
  return { ok: true, data: { id: data.id, status: data.status } };
}

export async function listHrEmployeeFields(): Promise<ActionResult<HrEmployeeField[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_employee_fields")
    .select(
      "id, code, label_ar, label_fr, value_type, catalog_kind, storage_group, section_ar, section_fr, sort_order, is_system, is_active, is_required",
    )
    .order("sort_order");
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as HrEmployeeField[] };
}

export async function upsertHrEmployeeField(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = hrEmployeeFieldSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const p = parsed.data;
  if (p.value_type === "catalog" && !p.catalog_kind) {
    return { ok: false, error: "Choisissez une liste pour cette colonne." };
  }
  const supabase = await createClient();
  const payload = {
    code: p.code,
    label_ar: p.label_ar,
    label_fr: p.label_fr,
    value_type: p.value_type,
    catalog_kind: p.catalog_kind,
    storage_group: "extra",
    section_ar: p.section_ar ?? "إضافي",
    section_fr: p.section_fr ?? "Extra",
    sort_order: p.sort_order,
    is_active: p.is_active,
    is_system: false,
    is_required: p.is_required ?? false,
  };
  const q = p.id
    ? supabase.from("hr_employee_fields").update(payload).eq("id", p.id).eq("is_system", false)
    : supabase.from("hr_employee_fields").insert(payload);
  const { data, error } = await q.select("id").maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Enregistrement refusé (colonne système ou droits)." };
  revalidateHr();
  return { ok: true, data: { id: data.id } };
}

export async function updateHrEmployeeFieldMeta(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = hrEmployeeFieldMetaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const p = parsed.data;
  if (p.value_type === "catalog" && !p.catalog_kind) {
    return { ok: false, error: "Choisissez une liste pour cette colonne." };
  }
  const supabase = await createClient();
  const payload: Record<string, unknown> = {
    label_ar: p.label_ar,
    label_fr: p.label_fr,
    section_ar: p.section_ar,
    section_fr: p.section_fr,
    sort_order: p.sort_order,
    is_active: p.is_active,
  };
  if (p.value_type) payload.value_type = p.value_type;
  if (p.catalog_kind !== undefined) payload.catalog_kind = p.catalog_kind;
  if (p.is_required !== undefined) {
    const workspace = await getWorkspaceProfile();
    if (!workspace?.isSuperAdmin) {
      return {
        ok: false,
        error: "Réservé à SUPER_ADMIN. · محصور في SUPER_ADMIN.",
      };
    }
    payload.is_required = p.is_required;
  }
  const { data, error } = await supabase
    .from("hr_employee_fields")
    .update(payload)
    .eq("id", p.id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Mise à jour refusée." };
  revalidateHr();
  return { ok: true, data: { id: data.id } };
}

export async function setHrEmployeeFieldActive(input: {
  id: string;
  is_active: boolean;
}): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_employee_fields")
    .update({ is_active: input.is_active })
    .eq("id", input.id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Mise à jour refusée." };
  revalidateHr();
  return { ok: true, data: { id: data.id } };
}

export async function deleteHrEmployeeField(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const { data: field, error: readErr } = await supabase
    .from("hr_employee_fields")
    .select("id, is_system")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!field) return { ok: false, error: "Colonne introuvable." };
  if (field.is_system) {
    const hidden = await setHrEmployeeFieldActive({ id, is_active: false });
    return hidden;
  }
  const { error } = await supabase.from("hr_employee_fields").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateHr();
  return { ok: true, data: { id } };
}

export async function uploadHrEmployeePhoto(
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choisissez une photo." };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: "Photo trop volumineuse (5 Mo max)." };
  }
  const type = file.type;
  if (!["image/jpeg", "image/png", "image/webp"].includes(type)) {
    return { ok: false, error: "Formats acceptés: JPG, PNG, WEBP." };
  }
  const employeeId = String(formData.get("employee_id") || "draft").replace(
    /[^a-zA-Z0-9-]/g,
    "",
  );
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const path = `${employeeId || "draft"}/${crypto.randomUUID()}.${ext}`;
  const supabase = await createClient();
  const { error } = await supabase.storage.from("hr-photos").upload(path, file, {
    contentType: type,
    upsert: false,
  });
  if (error) return { ok: false, error: error.message };
  const { data } = supabase.storage.from("hr-photos").getPublicUrl(path);
  return { ok: true, data: { url: data.publicUrl } };
}
