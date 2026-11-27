"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { WorkerRegisterWrite } from "@/lib/hr/worker-register-sheet";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

/** One employment period in the worker register. Not an employee card. */
export type WorkerRegisterRow = {
  id: number;
  lineNo: number;
  matricule: string;
  lastName: string;
  firstName: string;
  birthDate: string | null;
  birthPlace: string | null;
  sex: string | null;
  poste: string | null;
  hiredAt: string;
  endedAt: string | null;
  nss: string | null;
  status: string;
};

type DbRow = {
  id: number;
  line_no: number;
  matricule: string;
  last_name: string;
  first_name: string | null;
  birth_date: string | null;
  birth_place: string | null;
  sex: string | null;
  poste: string | null;
  hired_at: string;
  ended_at: string | null;
  nss: string | null;
  status: string;
};

function mapRow(row: DbRow): WorkerRegisterRow {
  return {
    id: row.id,
    lineNo: row.line_no,
    matricule: row.matricule,
    lastName: row.last_name,
    firstName: row.first_name ?? "",
    birthDate: row.birth_date,
    birthPlace: row.birth_place,
    sex: row.sex,
    poste: row.poste,
    hiredAt: row.hired_at,
    endedAt: row.ended_at,
    nss: row.nss,
    status: row.status,
  };
}

/** Every hiring period, newest start date first. */
export async function listHrWorkerRegister(): Promise<ActionResult<WorkerRegisterRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_worker_register")
    .select(
      "id, line_no, matricule, last_name, first_name, birth_date, birth_place, sex, poste, hired_at, ended_at, nss, status",
    )
    .order("hired_at", { ascending: false })
    .order("line_no", { ascending: false })
    .limit(5000);
  if (error) {
    return {
      ok: false,
      error:
        error.message.includes("permission") || error.code === "42501"
          ? "Accès refusé au registre des travailleurs."
          : error.message,
    };
  }
  return { ok: true, data: ((data ?? []) as DbRow[]).map(mapRow) };
}

const MATRICULE = /^\d{3}\/\d{2}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function permissionError(message: string, code?: string) {
  return message.includes("permission") || code === "42501"
    ? "Accès refusé au registre des travailleurs."
    : message;
}

function cleanWrite(row: WorkerRegisterWrite): WorkerRegisterWrite | null {
  const matricule = row.matricule?.trim() ?? "";
  const hiredAt = row.hiredAt?.slice(0, 10) ?? "";
  const lastName = row.lastName?.trim() ?? "";
  if (!MATRICULE.test(matricule) || !DAY.test(hiredAt) || !lastName) return null;
  if (row.birthDate && !DAY.test(row.birthDate)) return null;
  if (row.endedAt && !DAY.test(row.endedAt)) return null;
  if (row.status !== "ACTIVE" && row.status !== "DÉSACTIVE") return null;
  return {
    matricule,
    lastName,
    firstName: row.firstName?.trim() ?? "",
    birthDate: row.birthDate,
    birthPlace: row.birthPlace?.trim() || null,
    sex: row.sex === "M" || row.sex === "F" ? row.sex : null,
    poste: row.poste?.trim() || null,
    hiredAt,
    endedAt: row.endedAt,
    nss: row.nss?.replace(/\D/g, "") || null,
    status: row.status,
  };
}

/** The uploaded file becomes the worker register. Previous periods are removed in the same transaction. */
export async function importHrWorkerRegister(
  input: WorkerRegisterWrite[],
): Promise<ActionResult<{ inserted: number }>> {
  const unique = new Map<string, WorkerRegisterWrite>();
  for (const row of input) {
    const clean = cleanWrite(row);
    if (!clean) continue;
    unique.set(`${clean.matricule}|${clean.hiredAt}`, clean);
  }
  const rows = [...unique.values()];
  if (!rows.length) return { ok: false, error: "Aucune période valide à importer." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_worker_register_replace", {
    p_rows: rows.map((row) => ({
      matricule: row.matricule,
      last_name: row.lastName,
      first_name: row.firstName,
      birth_date: row.birthDate,
      birth_place: row.birthPlace,
      sex: row.sex,
      poste: row.poste,
      hired_at: row.hiredAt,
      ended_at: row.endedAt,
      nss: row.nss,
      status: row.status,
    })),
  });
  if (error) return { ok: false, error: permissionError(error.message, error.code) };

  revalidatePath("/rh/employes");
  return { ok: true, data: { inserted: typeof data === "number" ? data : rows.length } };
}
