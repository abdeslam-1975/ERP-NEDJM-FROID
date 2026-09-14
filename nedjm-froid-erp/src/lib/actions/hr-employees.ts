"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  hrEmployeeIdSchema,
  hrEmployeeUpsertSchema,
} from "@/lib/validations/hr-employee";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type HrEmployeeRow = {
  id: string;
  matricule: string;
  last_name: string;
  first_name: string;
  nss: string | null;
  nin: string | null;
  birth_date: string | null;
  hired_at: string | null;
  irg_category: "STANDARD" | "DISABLED_OR_RETIREE";
  status: string;
  created_at: string;
  updated_at: string;
};

function revalidateHr() {
  revalidatePath("/rh");
  revalidatePath("/rh/employes");
  revalidatePath("/referentiels/contrats");
}

export async function listHrEmployeeRows(): Promise<
  ActionResult<HrEmployeeRow[]>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_employees")
    .select(
      "id, matricule, last_name, first_name, nss, nin, birth_date, hired_at, irg_category, status, created_at, updated_at",
    )
    .order("last_name")
    .order("first_name")
    .limit(1000);

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
    data: (data ?? []).map((row) => ({
      ...row,
      irg_category: row.irg_category as HrEmployeeRow["irg_category"],
    })),
  };
}

export async function upsertHrEmployee(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = hrEmployeeUpsertSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Données invalides",
    };
  }

  const p = parsed.data;
  const supabase = await createClient();
  const payload = {
    matricule: p.matricule,
    last_name: p.last_name,
    first_name: p.first_name,
    nss: p.nss,
    nin: p.nin,
    birth_date: p.birth_date,
    hired_at: p.hired_at,
    irg_category: p.irg_category,
    status: p.status,
  };

  if (p.id) {
    const { data, error } = await supabase
      .from("hr_employees")
      .update(payload)
      .eq("id", p.id)
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
    if (!data) {
      return { ok: false, error: "Employé introuvable ou accès refusé." };
    }
    revalidateHr();
    return { ok: true, data: { id: data.id } };
  }

  const { data, error } = await supabase
    .from("hr_employees")
    .insert(payload)
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
  revalidateHr();
  return { ok: true, data: { id: data.id } };
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
