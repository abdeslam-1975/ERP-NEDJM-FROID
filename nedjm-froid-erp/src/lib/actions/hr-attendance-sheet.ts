"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import {
  getAttendancePeriodStatus,
  listAttendanceMonth,
  type AttendanceCell,
} from "@/lib/actions/hr-ops";
import type { PayrollRunStatus } from "@/lib/hr/payroll-run-status";
import {
  attendanceColumnsConfigSchema,
  attendanceSheetRowsSaveSchema,
} from "@/lib/validations/hr";
import {
  editableRowValueCodes,
  isEditableColumn,
  mergeRowValues,
  pickVisibleValues,
  POSTE_EFFECTIF,
  type AttendanceColumn,
  type AttendanceColumnAccess,
  type AttendanceColumnGrant,
  type AttendanceRoleOption,
  type AttendanceSheetRow,
} from "@/lib/hr/attendance-columns";

type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

const COLUMN_FIELDS =
  "id, code, label_fr, label_ar, kind, source, value_type, catalog_kind, sort_order, is_system, is_active";

const SUPER_ADMIN_ONLY = "Réservé à SUPER_ADMIN. · محصور في SUPER_ADMIN.";

function mapColumn(row: Record<string, unknown>): AttendanceColumn {
  return {
    id: String(row.id),
    code: String(row.code),
    label_fr: String(row.label_fr ?? ""),
    label_ar: (row.label_ar as string | null) ?? null,
    kind: row.kind as AttendanceColumn["kind"],
    source: (row.source as string | null) ?? null,
    value_type: (row.value_type as AttendanceColumn["value_type"]) ?? "text",
    catalog_kind: (row.catalog_kind as string | null) ?? null,
    sort_order: Number(row.sort_order ?? 0),
    is_system: Boolean(row.is_system),
    is_active: Boolean(row.is_active),
  };
}

function revalidateSheet() {
  revalidatePath("/rh/presence");
  revalidatePath("/rh/parametres");
}

export async function listAttendanceColumns(): Promise<ActionResult<AttendanceColumn[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_attendance_columns")
    .select(COLUMN_FIELDS)
    .order("sort_order");
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map(mapColumn) };
}

async function fetchAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  siteId: string,
): Promise<ActionResult<AttendanceColumnAccess>> {
  const { data, error } = await supabase.rpc("hr_attendance_sheet_access", { p_site: siteId });
  if (error) return { ok: false, error: error.message };
  const access: AttendanceColumnAccess = {};
  for (const row of (data ?? []) as { code: string; can_view: boolean; can_edit: boolean }[]) {
    access[row.code] = { view: Boolean(row.can_view), edit: Boolean(row.can_edit) };
  }
  return { ok: true, data: access };
}

export async function getAttendanceSheetAccess(
  siteId: string,
): Promise<ActionResult<AttendanceColumnAccess>> {
  const supabase = await createClient();
  return fetchAccess(supabase, siteId);
}

async function fetchSheetRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: { site_id: string; year: number; month: number },
  access: AttendanceColumnAccess,
): Promise<ActionResult<AttendanceSheetRow[]>> {
  const [current, earlier] = await Promise.all([
    supabase
      .from("hr_attendance_sheet_rows")
      .select("employee_id, cell_values")
      .eq("site_id", input.site_id)
      .eq("period_year", input.year)
      .eq("period_month", input.month),
    access[POSTE_EFFECTIF]?.view
      ? supabase
          .from("hr_attendance_sheet_rows")
          .select(`employee_id, period_year, period_month, poste:cell_values->>${POSTE_EFFECTIF}`)
          .eq("site_id", input.site_id)
          .gte("period_year", input.year - 2)
          .or(
            `period_year.lt.${input.year},and(period_year.eq.${input.year},period_month.lt.${input.month})`,
          )
          .not(`cell_values->>${POSTE_EFFECTIF}`, "is", null)
          .order("period_year", { ascending: false })
          .order("period_month", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (current.error) return { ok: false, error: current.error.message };
  if (earlier.error) return { ok: false, error: earlier.error.message };

  const carried = new Map<string, string>();
  for (const row of (earlier.data ?? []) as { employee_id: string; poste: string | null }[]) {
    if (row.poste && !carried.has(row.employee_id)) carried.set(row.employee_id, row.poste);
  }

  const rows = new Map<string, AttendanceSheetRow>();
  for (const row of current.data ?? []) {
    rows.set(row.employee_id, {
      employee_id: row.employee_id,
      values: pickVisibleValues((row.cell_values ?? {}) as Record<string, unknown>, access),
      carried_poste: null,
    });
  }
  for (const [employeeId, poste] of carried) {
    const row = rows.get(employeeId) ?? { employee_id: employeeId, values: {}, carried_poste: null };
    if (!row.values[POSTE_EFFECTIF]) row.carried_poste = poste;
    rows.set(employeeId, row);
  }
  return { ok: true, data: [...rows.values()] };
}

/** Everything the pointage grid needs for one site × month, filtered by the caller's rights. */
export async function loadAttendanceSheet(input: {
  site_id: string;
  year: number;
  month: number;
}): Promise<
  ActionResult<{
    cells: AttendanceCell[];
    loaded_at: string;
    period_status: PayrollRunStatus | null;
    access: AttendanceColumnAccess;
    rows: AttendanceSheetRow[];
  }>
> {
  const supabase = await createClient();
  const access = await fetchAccess(supabase, input.site_id);
  if (!access.ok) return access;
  const needsCells = ["DAYS", "CODE_COUNTS", "COEF"].some((code) => access.data[code]?.view);
  const [month, rows] = await Promise.all([
    needsCells
      ? listAttendanceMonth(input)
      : getAttendancePeriodStatus(input).then((status) =>
          status.ok
            ? {
                ok: true as const,
                data: {
                  cells: [] as AttendanceCell[],
                  loaded_at: new Date().toISOString(),
                  period_status: status.data,
                },
              }
            : status,
        ),
    fetchSheetRows(supabase, input, access.data),
  ]);
  if (!month.ok) return month;
  if (!rows.ok) return rows;
  return {
    ok: true,
    data: {
      cells: month.data.cells,
      loaded_at: month.data.loaded_at,
      period_status: month.data.period_status,
      access: access.data,
      rows: rows.data,
    },
  };
}

export async function saveAttendanceSheetRows(
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  const parsed = attendanceSheetRowsSaveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const p = parsed.data;
  const supabase = await createClient();
  const [access, columns] = await Promise.all([
    fetchAccess(supabase, p.site_id),
    listAttendanceColumns(),
  ]);
  if (!access.ok) return access;
  if (!columns.ok) return columns;
  const editable = editableRowValueCodes(columns.data, access.data);
  if (!editable.size) {
    return { ok: false, error: "Aucune colonne modifiable pour votre rôle. · لا توجد أعمدة قابلة للتعديل." };
  }

  const employeeIds = [...new Set(p.rows.map((r) => r.employee_id))];
  if (!employeeIds.length) return { ok: true, data: { count: 0 } };
  const { data: existing, error: exErr } = await supabase
    .from("hr_attendance_sheet_rows")
    .select("id, employee_id, cell_values")
    .eq("site_id", p.site_id)
    .eq("period_year", p.year)
    .eq("period_month", p.month)
    .in("employee_id", employeeIds);
  if (exErr) return { ok: false, error: exErr.message };
  const byEmployee = new Map((existing ?? []).map((r) => [r.employee_id, r]));

  let count = 0;
  const inserts: Record<string, unknown>[] = [];
  for (const row of p.rows) {
    const stored = byEmployee.get(row.employee_id);
    const storedValues = (stored?.cell_values ?? {}) as Record<string, string>;
    const next = mergeRowValues(storedValues, row.values, editable);
    if (!next) continue;
    if (stored) {
      const { error } = await supabase
        .from("hr_attendance_sheet_rows")
        .update({ cell_values: next })
        .eq("id", stored.id);
      if (error) return { ok: false, error: error.message };
    } else {
      inserts.push({
        site_id: p.site_id,
        employee_id: row.employee_id,
        period_year: p.year,
        period_month: p.month,
        cell_values: next,
      });
    }
    count += 1;
  }
  if (inserts.length) {
    const { error } = await supabase.from("hr_attendance_sheet_rows").insert(inserts);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/rh/presence");
  return { ok: true, data: { count } };
}

export type AttendanceColumnsAdmin = {
  columns: AttendanceColumn[];
  roles: AttendanceRoleOption[];
  grants: AttendanceColumnGrant[];
};

export async function loadAttendanceColumnsAdmin(): Promise<ActionResult<AttendanceColumnsAdmin>> {
  const workspace = await getWorkspaceProfile();
  if (!workspace?.isSuperAdmin) return { ok: false, error: SUPER_ADMIN_ONLY };
  const supabase = await createClient();
  const [columns, roles, grants] = await Promise.all([
    listAttendanceColumns(),
    supabase
      .from("sys_roles")
      .select("id, code, label_fr, hierarchy_level")
      .eq("is_active", true)
      .neq("code", "SUPER_ADMIN")
      .order("hierarchy_level", { ascending: false }),
    supabase.from("hr_attendance_column_roles").select("column_id, role_id, can_view, can_edit"),
  ]);
  if (!columns.ok) return columns;
  if (roles.error) return { ok: false, error: roles.error.message };
  if (grants.error) return { ok: false, error: grants.error.message };
  return {
    ok: true,
    data: {
      columns: columns.data,
      roles: (roles.data ?? []) as AttendanceRoleOption[],
      grants: (grants.data ?? []) as AttendanceColumnGrant[],
    },
  };
}

export async function saveAttendanceColumnsConfig(
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  const workspace = await getWorkspaceProfile();
  if (!workspace?.isSuperAdmin) return { ok: false, error: SUPER_ADMIN_ONLY };
  const parsed = attendanceColumnsConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const p = parsed.data;
  const codes = p.columns.map((c) => c.code);
  if (new Set(codes).size !== codes.length) {
    return { ok: false, error: "Codes de colonne en double. · رموز أعمدة مكررة." };
  }

  const supabase = await createClient();
  const current = await listAttendanceColumns();
  if (!current.ok) return current;
  const byId = new Map(current.data.map((c) => [c.id, c]));
  const byCode = new Map(current.data.map((c) => [c.code, c]));

  for (const col of p.columns) {
    const stored = col.id ? byId.get(col.id) : undefined;
    if (col.id && !stored) return { ok: false, error: `Colonne introuvable : ${col.code}.` };
    if (stored) {
      const patch: Record<string, unknown> = {
        label_fr: col.label_fr,
        label_ar: col.label_ar || null,
        sort_order: col.sort_order,
        is_active: stored.kind === "DAYS" ? true : col.is_active,
      };
      if (!stored.is_system) {
        patch.code = col.code;
        patch.value_type = col.value_type === "catalog" ? "text" : col.value_type;
      }
      const { error } = await supabase
        .from("hr_attendance_columns")
        .update(patch)
        .eq("id", stored.id);
      if (error) return { ok: false, error: error.message };
    } else {
      if (byCode.has(col.code)) {
        return { ok: false, error: `Le code ${col.code} existe déjà.` };
      }
      const { error } = await supabase.from("hr_attendance_columns").insert({
        code: col.code,
        label_fr: col.label_fr,
        label_ar: col.label_ar || null,
        kind: "INPUT",
        value_type: col.value_type === "catalog" ? "text" : col.value_type,
        sort_order: col.sort_order,
        is_active: col.is_active,
        is_system: false,
      });
      if (error) return { ok: false, error: error.message };
    }
  }

  const refreshed = await listAttendanceColumns();
  if (!refreshed.ok) return refreshed;
  const columnByCode = new Map(refreshed.data.map((c) => [c.code, c]));
  const grantRows = p.grants.flatMap((g) => {
    const col = columnByCode.get(g.column_code);
    if (!col) return [];
    const canEdit = g.can_edit && isEditableColumn(col);
    return [
      {
        column_id: col.id,
        role_id: g.role_id,
        can_view: g.can_view || canEdit,
        can_edit: canEdit,
      },
    ];
  });
  if (grantRows.length) {
    const { error } = await supabase
      .from("hr_attendance_column_roles")
      .upsert(grantRows, { onConflict: "column_id,role_id" });
    if (error) return { ok: false, error: error.message };
  }
  revalidateSheet();
  return { ok: true, data: { count: p.columns.length } };
}

export async function deleteAttendanceColumn(id: string): Promise<ActionResult> {
  const workspace = await getWorkspaceProfile();
  if (!workspace?.isSuperAdmin) return { ok: false, error: SUPER_ADMIN_ONLY };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_attendance_columns")
    .delete()
    .eq("id", id)
    .eq("is_system", false)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Colonne système ou introuvable : suppression refusée." };
  revalidateSheet();
  return { ok: true, data: undefined };
}
