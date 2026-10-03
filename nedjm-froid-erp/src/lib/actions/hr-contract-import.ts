"use server";

import { z } from "zod";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { createClient } from "@/lib/supabase/server";
import { upsertHrContract, type ActionResult } from "@/lib/actions/hr-contracts";
import { CONTRACT_IMPORT_MAX_ROWS } from "@/lib/hr/contract-import";
import { EMPLOYEE_IMPORT_MAX_BYTES, readSheetMatrix } from "@/lib/hr/employee-import-file";
import { OPEN_PRINCIPAL_STATUSES, rangesOverlap } from "@/lib/hr/principal-contract";

/** Reads one sheet of a contract list (.xlsx, or .csv) as rows of text, with the workbook's sheet names. */
export async function readContractImportFile(
  formData: FormData,
): Promise<ActionResult<{ sheets: string[]; sheet: string; matrix: string[][] }>> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return { ok: false, error: "Session requise." };
  const file = formData.get("file");
  const sheet = String(formData.get("sheet") ?? "");
  if (!(file instanceof File)) return { ok: false, error: "Choisissez un fichier Excel (.xlsx) ou CSV." };
  if (file.size === 0) return { ok: false, error: "Fichier vide." };
  if (file.size > EMPLOYEE_IMPORT_MAX_BYTES) return { ok: false, error: "Fichier supérieur à 5 Mo." };
  try {
    const read = await readSheetMatrix(await file.arrayBuffer(), file.name || "contrats.xlsx", sheet);
    if (read.matrix.length < 2) return { ok: false, error: "Aucune ligne trouvée dans cette feuille." };
    return { ok: true, data: { ...read, matrix: read.matrix.slice(0, CONTRACT_IMPORT_MAX_ROWS + 16) } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Lecture du fichier impossible." };
  }
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const importSchema = z.object({
  rows: z
    .array(
      z.object({
        line: z.number().int().positive(),
        payload: z.object({
          employee_id: z.string().uuid(),
          site_id: z.string().uuid(),
          activity_code_id: z.string().uuid(),
          contract_type_code: z.string().max(40).nullable(),
          work_regime_code: z.string().max(40).nullable(),
          poste_fr: z.string().max(120).nullable(),
          affectation_principale: z.literal(true),
          salaire_base_monthly: z.number().min(0),
          salaire_net_ref_monthly: z.number().min(0),
          start_date: isoDate,
          end_date: isoDate.nullable(),
          status: z.enum(["DRAFT", "ACTIVE", "ENDED"]),
        }),
      }),
    )
    .min(1)
    .max(50),
});

export type ContractImportResult = { line: number; ok: boolean; error?: string };

/**
 * Creates the given contracts one by one with the same checks as the contract form.
 * A contract that overlaps a principal contract already recorded is refused: the import never ends an existing one.
 */
export async function importContractRows(input: unknown): Promise<ActionResult<ContractImportResult[]>> {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const supabase = await createClient();
  const ids = [...new Set(parsed.data.rows.map((r) => r.payload.employee_id))];
  const { data: current, error } = await supabase
    .from("hr_contracts")
    .select("employee_id, start_date, end_date, status")
    .in("employee_id", ids)
    .eq("affectation_principale", true);
  if (error) return { ok: false, error: error.message };
  const open = (current ?? []).filter((c) =>
    OPEN_PRINCIPAL_STATUSES.includes(c.status as (typeof OPEN_PRINCIPAL_STATUSES)[number]),
  );

  const results: ContractImportResult[] = [];
  for (const { line, payload } of parsed.data.rows) {
    const clash = open.find(
      (c) =>
        c.employee_id === payload.employee_id &&
        rangesOverlap(String(c.start_date).slice(0, 10), c.end_date ? String(c.end_date).slice(0, 10) : null, payload.start_date, payload.end_date),
    );
    if (clash && payload.status !== "ENDED") {
      results.push({ line, ok: false, error: "Contrat principal déjà enregistré sur cette période." });
      continue;
    }
    const saved = await upsertHrContract({ ...payload, cnas_regime_code: null });
    if (!saved.ok) {
      results.push({ line, ok: false, error: saved.error });
      continue;
    }
    if (payload.status !== "ENDED") {
      open.push({ employee_id: payload.employee_id, start_date: payload.start_date, end_date: payload.end_date, status: payload.status });
    }
    results.push(saved.data.warning ? { line, ok: true, error: saved.data.warning } : { line, ok: true });
  }
  return { ok: true, data: results };
}
