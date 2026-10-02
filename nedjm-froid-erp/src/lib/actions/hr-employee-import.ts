"use server";

import { z } from "zod";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import {
  listHrEmployeeFields,
  nextHrMatricule,
  upsertHrEmployee,
  type ActionResult,
} from "@/lib/actions/hr-employees";
import { EMPLOYEE_IMPORT_MAX_ROWS } from "@/lib/hr/employee-import";
import { EMPLOYEE_IMPORT_MAX_BYTES, readEmployeeSheet } from "@/lib/hr/employee-import-file";
import { employeePayloadFromValues } from "@/lib/hr/employee-payload";
import { normalizeFicheValues } from "@/lib/hr/employee-fiche-constraints";
import { hrEmployeeFullSchema } from "@/lib/validations/hr";

/** Reads the old staff base (first sheet of an .xlsx, or a .csv) as rows of text. */
export async function readEmployeeImportFile(formData: FormData): Promise<ActionResult<{ matrix: string[][] }>> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return { ok: false, error: "Session requise." };
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Choisissez un fichier Excel (.xlsx) ou CSV." };
  if (file.size === 0) return { ok: false, error: "Fichier vide." };
  if (file.size > EMPLOYEE_IMPORT_MAX_BYTES) return { ok: false, error: "Fichier supérieur à 5 Mo." };
  try {
    const matrix = await readEmployeeSheet(await file.arrayBuffer(), file.name || "import.xlsx");
    if (matrix.length < 2) return { ok: false, error: "Aucune ligne d'employé trouvée dans le fichier." };
    return { ok: true, data: { matrix: matrix.slice(0, EMPLOYEE_IMPORT_MAX_ROWS + 16) } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Lecture du fichier impossible." };
  }
}

const importRowsSchema = z.object({
  rows: z
    .array(
      z.object({
        line: z.number().int().positive(),
        values: z.record(z.string(), z.string().max(500)),
        excelNo: z.number().finite().nullable(),
      }),
    )
    .min(1)
    .max(100),
});

export type EmployeeImportResult = { line: number; ok: boolean; error?: string; matricule?: string };

/** Creates the given employees one by one, with the same checks as the fiche; existing ones are never touched. */
export async function importEmployeeRows(input: unknown): Promise<ActionResult<EmployeeImportResult[]>> {
  const parsed = importRowsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const fields = await listHrEmployeeFields();
  if (!fields.ok) return fields;
  const active = fields.data.filter((f) => f.is_active);

  const results: EmployeeImportResult[] = [];
  for (const row of parsed.data.rows) {
    const values = { ...row.values };
    delete values.id;
    if (!values.matricule?.trim()) {
      const next = await nextHrMatricule();
      if (!next.ok || !next.data.matricule) {
        results.push({ line: row.line, ok: false, error: next.ok ? "Matricule automatique indisponible." : next.error });
        continue;
      }
      values.matricule = next.data.matricule;
    }
    const payload = employeePayloadFromValues(
      values,
      active,
      { imported_from: "ancienne_base", ...(row.excelNo == null ? {} : { excel_no: row.excelNo }) },
    );
    const check = hrEmployeeFullSchema.safeParse(normalizeFicheValues(payload));
    if (!check.success) {
      results.push({ line: row.line, ok: false, error: check.error.issues[0]?.message ?? "Données invalides" });
      continue;
    }
    const saved = await upsertHrEmployee(payload);
    results.push(
      saved.ok
        ? { line: row.line, ok: true, matricule: values.matricule }
        : { line: row.line, ok: false, error: saved.error },
    );
  }
  return { ok: true, data: results };
}
