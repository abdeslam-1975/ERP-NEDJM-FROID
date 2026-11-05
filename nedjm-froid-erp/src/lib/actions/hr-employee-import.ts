"use server";

import { z } from "zod";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { createClient } from "@/lib/supabase/server";
import { matriculeKey } from "@/lib/hr/contract-import";
import { archiveEmployeeFicheRenseignements } from "@/lib/actions/hr-documents";
import {
  getHrEmployeeFiche,
  listHrEmployeeFields,
  upsertHrEmployee,
  type ActionResult,
} from "@/lib/actions/hr-employees";
import { EMPLOYEE_IMPORT_MAX_ROWS } from "@/lib/hr/employee-import";
import { EMPLOYEE_IMPORT_MAX_BYTES, readEmployeeSheet } from "@/lib/hr/employee-import-file";
import { nextMatriculeForHire } from "@/lib/hr/employee-matricule";
import { valuesFromFiche } from "@/components/rh/employee-fiche-save";
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
        employeeId: z.string().uuid().optional(),
      }),
    )
    .min(1)
    .max(100),
});

export type EmployeeImportResult = {
  line: number;
  ok: boolean;
  error?: string;
  matricule?: string;
  id?: string;
  note?: string;
};

function matriculeVariants(value: string): string[] {
  const compact = value.toUpperCase().replace(/\s+/g, "");
  const parts = /^(0*\d+)\/(\d{2})$/.exec(compact);
  if (!parts) return [...new Set([value.trim(), compact].filter(Boolean))];
  const serial = String(Number(parts[1]));
  const year = parts[2];
  const variants = new Set<string>([value.trim()]);
  for (let width = serial.length; width <= 3; width += 1) variants.add(`${serial.padStart(width, "0")}/${year}`);
  return [...variants];
}

/** Creates a new employee, or updates a known one and archives a new fiche PDF beside the old one. */
export async function importEmployeeRows(input: unknown): Promise<ActionResult<EmployeeImportResult[]>> {
  const parsed = importRowsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const fields = await listHrEmployeeFields();
  if (!fields.ok) return fields;
  const active = fields.data.filter((f) => f.is_active);

  const results: EmployeeImportResult[] = [];
  const supabase = await createClient();
  const { data: knownMats, error: matError } = await supabase.from("hr_employees").select("matricule");
  if (matError) return { ok: false, error: matError.message };
  const pool = (knownMats ?? []).map((item) => String(item.matricule ?? ""));
  for (const row of parsed.data.rows) {
    const values = { ...row.values };
    let previous: Record<string, string> | null = null;
    let parked: { id: string; matricule: string } | null = null;
    if (row.employeeId) {
      const current = await getHrEmployeeFiche(row.employeeId);
      if (!current.ok) {
        results.push({ line: row.line, ok: false, error: current.error });
        continue;
      }
      const before = valuesFromFiche(current.data, active);
      previous = { ...before };
      for (const [key, value] of Object.entries(values)) {
        if (key === "id" || key === "matricule" || !value.trim()) continue;
        if (key === "hired_at") {
          const current = (before.hired_at ?? "").slice(0, 10);
          const incoming = value.slice(0, 10);
          if (!current || incoming < current) previous.hired_at = incoming;
          continue;
        }
        previous[key] = value;
      }
      previous.id = row.employeeId;
      const incomingMat = (values.matricule ?? "").trim();
      const currentMat = current.data.matricule;
      if (incomingMat && matriculeKey(incomingMat) !== matriculeKey(currentMat)) {
        const { data: holders, error: holdError } = await supabase
          .from("hr_employees")
          .select("id, matricule")
          .in("matricule", matriculeVariants(incomingMat))
          .neq("id", row.employeeId)
          .limit(5);
        if (holdError) {
          results.push({ line: row.line, ok: false, error: holdError.message });
          continue;
        }
        const holder = (holders ?? []).find((item) => matriculeKey(item.matricule) === matriculeKey(incomingMat));
        if (holder) {
          const temporary = `~${holder.id}`;
          const { error: parkError } = await supabase.from("hr_employees").update({ matricule: temporary }).eq("id", holder.id);
          if (parkError) {
            results.push({ line: row.line, ok: false, error: "Matricule déjà utilisé." });
            continue;
          }
          parked = { id: holder.id, matricule: holder.matricule };
        }
        previous.matricule = incomingMat;
      } else {
        previous.matricule = currentMat;
      }
      Object.assign(values, previous);
      previous = before;
    } else {
      delete values.id;
      if (!values.matricule?.trim()) {
        const hired = (values.hired_at ?? "").slice(0, 10);
        const next = nextMatriculeForHire(hired, pool);
        if (!next) {
          results.push({ line: row.line, ok: false, error: "Date d'embauche absente : le matricule ne peut pas être créé." });
          continue;
        }
        values.matricule = next;
        pool.push(next);
      }
    }
    const payload = employeePayloadFromValues(
      values,
      active,
      { imported_from: "ancienne_base", ...(row.excelNo == null ? {} : { excel_no: row.excelNo }) },
    );
    const check = hrEmployeeFullSchema.safeParse(normalizeFicheValues(payload));
    if (!check.success) {
      if (parked) await supabase.from("hr_employees").update({ matricule: parked.matricule }).eq("id", parked.id);
      results.push({ line: row.line, ok: false, error: check.error.issues[0]?.message ?? "Données invalides" });
      continue;
    }
    const saved = await upsertHrEmployee(payload);
    if (!saved.ok) {
      if (parked) await supabase.from("hr_employees").update({ matricule: parked.matricule }).eq("id", parked.id);
      results.push({ line: row.line, ok: false, error: saved.error });
      continue;
    }
    let note: string | undefined;
    if (row.employeeId && previous) {
      const changed = active.some((field) => (previous?.[field.code] ?? "").trim() !== (values[field.code] ?? "").trim());
      if (!changed) note = "Fiche inchangée, ancienne fiche PDF conservée.";
      else {
        const archived = await archiveEmployeeFicheRenseignements(saved.data.id);
        note = archived.ok
          ? "Nouvelle fiche PDF archivée, l'ancienne est conservée."
          : `Fiche mise à jour. PDF non archivé : ${archived.error}`;
      }
    }
    results.push({ line: row.line, ok: true, matricule: values.matricule, id: saved.data.id, note });
  }
  return { ok: true, data: results };
}
