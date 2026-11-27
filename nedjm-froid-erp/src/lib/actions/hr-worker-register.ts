"use server";

import { createClient } from "@/lib/supabase/server";

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
