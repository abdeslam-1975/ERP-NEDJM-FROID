import type { HrContractRow } from "@/lib/actions/hr-contracts";
import type { AttendanceRosterRow } from "@/lib/actions/hr-ops";

export type AttendanceColumnKind = "IDENTITY" | "DAYS" | "CODE_COUNTS" | "TOTAL" | "INPUT";
export type AttendanceValueType = "text" | "number" | "date" | "catalog";

export type AttendanceColumn = {
  id: string;
  code: string;
  label_fr: string;
  label_ar: string | null;
  kind: AttendanceColumnKind;
  source: string | null;
  value_type: AttendanceValueType;
  catalog_kind: string | null;
  sort_order: number;
  is_system: boolean;
  is_active: boolean;
};

export type AttendanceColumnAccess = Record<string, { view: boolean; edit: boolean }>;

export type AttendanceRoleOption = {
  id: string;
  code: string;
  label_fr: string;
  hierarchy_level: number;
};

export type AttendanceColumnGrant = {
  column_id: string;
  role_id: string;
  can_view: boolean;
  can_edit: boolean;
};

export type AttendanceSheetRow = {
  employee_id: string;
  values: Record<string, string>;
  /** Last POSTE_EFFECTIF entered on an earlier month, when none is set for this month. */
  carried_poste: string | null;
};

/** Contract fields the pointage screen may receive — no salary amounts. */
export type AttendanceContract = Pick<
  HrContractRow,
  | "employee_id"
  | "site_id"
  | "site_name"
  | "poste_fr"
  | "poste_ar"
  | "start_date"
  | "end_date"
  | "status"
  | "last_name"
  | "first_name"
  | "employee_name"
  | "matricule"
>;

export const POSTE_EFFECTIF = "POSTE_EFFECTIF";

/** Overtime hour columns read by payroll (code → legal rate key). */
export const OVERTIME_COLUMNS = [
  { code: "HS50", rateKey: "HS_TAUX_50", defaultRate: 0.5 },
  { code: "HS75", rateKey: "HS_TAUX_75", defaultRate: 0.75 },
  { code: "HS100", rateKey: "HS_TAUX_100", defaultRate: 1 },
] as const;

/**
 * Contracts shown on a month's sheet: those covering any day of the month (ended ones included),
 * one per employee and site (latest start).
 */
export function contractsForMonth<T extends Pick<AttendanceContract, "employee_id" | "site_id" | "start_date" | "end_date">>(
  contracts: T[],
  year: number,
  month: number,
): T[] {
  const mm = String(month).padStart(2, "0");
  const first = `${year}-${mm}-01`;
  const last = `${year}-${mm}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
  const byKey = new Map<string, T>();
  for (const c of contracts) {
    const start = String(c.start_date ?? "").slice(0, 10);
    const end = c.end_date ? String(c.end_date).slice(0, 10) : null;
    if (!start || start > last || (end && end < first)) continue;
    const key = `${c.employee_id}|${c.site_id}`;
    const prev = byKey.get(key);
    if (!prev || start > String(prev.start_date).slice(0, 10)) byKey.set(key, c);
  }
  return [...byKey.values()];
}

export function toAttendanceContract(c: HrContractRow): AttendanceContract {
  return {
    employee_id: c.employee_id,
    site_id: c.site_id,
    site_name: c.site_name,
    poste_fr: c.poste_fr,
    poste_ar: c.poste_ar,
    start_date: c.start_date,
    end_date: c.end_date,
    status: c.status,
    last_name: c.last_name,
    first_name: c.first_name,
    employee_name: c.employee_name,
    matricule: c.matricule,
  };
}

/** Salary-free roster row (hr_attendance_roster RPC, readable by site chiefs). */
export function rosterToAttendanceContract(r: AttendanceRosterRow): AttendanceContract {
  return {
    employee_id: r.employee_id,
    site_id: r.site_id,
    site_name: r.site_name,
    poste_fr: r.poste || null,
    poste_ar: null,
    start_date: r.start_date,
    end_date: r.end_date,
    status: r.status,
    last_name: r.last_name,
    first_name: r.first_name,
    employee_name: `${r.last_name} ${r.first_name}`.trim(),
    matricule: r.matricule,
  };
}

/** Values stored per row in hr_attendance_sheet_rows.cell_values. */
export function isRowValueColumn(col: Pick<AttendanceColumn, "kind" | "source">) {
  return col.kind === "INPUT" || (col.kind === "IDENTITY" && col.source === POSTE_EFFECTIF);
}

export function isEditableColumn(col: Pick<AttendanceColumn, "kind" | "source">) {
  return col.kind === "DAYS" || isRowValueColumn(col);
}

export function sortColumns<T extends Pick<AttendanceColumn, "sort_order" | "code">>(cols: T[]) {
  return cols
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code));
}

export function visibleColumns(columns: AttendanceColumn[], access: AttendanceColumnAccess) {
  return sortColumns(columns.filter((c) => c.is_active && access[c.code]?.view));
}

export function editableRowValueCodes(
  columns: AttendanceColumn[],
  access: AttendanceColumnAccess,
) {
  return new Set(
    columns
      .filter((c) => c.is_active && isRowValueColumn(c) && access[c.code]?.edit)
      .map((c) => c.code),
  );
}

/**
 * Applies the submitted values of editable columns onto the stored ones.
 * An empty string removes the value. Returns null when nothing changes.
 */
export function mergeRowValues(
  stored: Record<string, string>,
  submitted: Record<string, string>,
  editable: Set<string>,
): Record<string, string> | null {
  const next = { ...stored };
  let changed = false;
  for (const [code, raw] of Object.entries(submitted)) {
    if (!editable.has(code)) continue;
    const value = raw.trim();
    if (!value) {
      if (code in next) {
        delete next[code];
        changed = true;
      }
    } else if (next[code] !== value) {
      next[code] = value;
      changed = true;
    }
  }
  return changed ? next : null;
}

export function pickVisibleValues(
  values: Record<string, unknown>,
  access: AttendanceColumnAccess,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [code, value] of Object.entries(values ?? {})) {
    if (!access[code]?.view || value == null) continue;
    out[code] = String(value);
  }
  return out;
}
