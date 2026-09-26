"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireHrSalaryValues } from "@/lib/auth/require-roles";
import { createClient } from "@/lib/supabase/server";
import { refreshDraftPayroll } from "@/lib/actions/hr-ops";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type SalaryHistoryRow = {
  id: string;
  contract_id: string;
  effective_from: string;
  salaire_base_monthly: number;
  salaire_net_ref_monthly: number;
  reason: string;
  created_at: string;
  author_name: string | null;
};

const avenantSchema = z.object({
  contract_id: z.string().uuid(),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date d'effet invalide"),
  salaire_base_monthly: z.coerce.number().min(0, "Salaire de base invalide"),
  salaire_net_ref_monthly: z.coerce.number().min(0).optional().default(0),
  reason: z.string().trim().min(3, "Motif requis (3 caractères min.) · السبب مطلوب"),
});

function revalidateContracts() {
  revalidatePath("/rh/contrats");
  revalidatePath("/rh/paie");
}

export async function listSalaryHistory(contractId: string): Promise<ActionResult<SalaryHistoryRow[]>> {
  if (!z.string().uuid().safeParse(contractId).success) return { ok: false, error: "Contrat invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_contract_salary_history")
    .select(
      "id, contract_id, effective_from, salaire_base_monthly, salaire_net_ref_monthly, reason, created_at, author:sys_users!created_by ( full_name )",
    )
    .eq("contract_id", contractId)
    .order("effective_from", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((row) => {
      const author = Array.isArray(row.author) ? row.author[0] : row.author;
      return {
        id: row.id,
        contract_id: row.contract_id,
        effective_from: String(row.effective_from).slice(0, 10),
        salaire_base_monthly: Number(row.salaire_base_monthly),
        salaire_net_ref_monthly: Number(row.salaire_net_ref_monthly),
        reason: row.reason,
        created_at: row.created_at,
        author_name: author?.full_name ?? null,
      };
    }),
  };
}

export async function saveSalaryAvenant(input: unknown): Promise<ActionResult<{ id: string }>> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  const parsed = avenantSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const p = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_contract_salary_avenant", {
    p_contract: p.contract_id,
    p_from: p.effective_from,
    p_base: p.salaire_base_monthly,
    p_net: p.salaire_net_ref_monthly,
    p_reason: p.reason,
  });
  if (error) return { ok: false, error: error.message };
  await refreshDraftPayroll({ contractId: p.contract_id });
  revalidateContracts();
  return { ok: true, data: { id: String(data) } };
}

export async function deleteSalaryVersion(input: {
  id: string;
  contract_id: string;
}): Promise<ActionResult> {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const { error } = await supabase.rpc("hr_contract_salary_delete", { p_id: input.id });
  if (error) return { ok: false, error: error.message };
  await refreshDraftPayroll({ contractId: input.contract_id });
  revalidateContracts();
  return { ok: true, data: undefined };
}
