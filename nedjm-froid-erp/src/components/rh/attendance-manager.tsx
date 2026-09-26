"use client";

import { Fragment, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { saveAttendanceMonth, type AttendanceCell } from "@/lib/actions/hr-ops";
import { attendanceFrozenMessage, type PayrollRunStatus } from "@/lib/hr/payroll-run-status";
import {
  loadAttendanceSheet,
  saveAttendanceSheetRows,
} from "@/lib/actions/hr-attendance-sheet";
import type { LegendRow } from "@/lib/actions/hr-catalogs";
import {
  editableRowValueCodes,
  POSTE_EFFECTIF,
  visibleColumns,
  type AttendanceColumn,
  type AttendanceColumnAccess,
  type AttendanceContract,
  type AttendanceSheetRow,
} from "@/lib/hr/attendance-columns";
import {
  cellOriginLabel,
  countPending,
  isAutoProposed,
  paintAttendanceCells,
} from "@/lib/hr/attendance-source";
import { Button } from "@/components/ui/button";
import {
  RhAlert,
  RhModal,
  RhPageHeader,
  RhTableWrap,
  RhTabs,
  rhInput,
} from "@/components/rh/rh-ui";

type SiteOpt = { id: string; name_fr: string };
type SearchMode = "site" | "employee";

const MONTHS = [
  "JANVIER",
  "FEVRIER",
  "MARS",
  "AVRIL",
  "MAI",
  "JUIN",
  "JUILLET",
  "AOUT",
  "SEPTEMBRE",
  "OCTOBRE",
  "NOVEMBRE",
  "DECEMBRE",
];
const WEEK = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

type Person = {
  id: string;
  last_name: string;
  first_name: string;
  matricule: string;
  poste: string;
  affectation: string;
  start_date: string;
  site_id: string;
  site_name: string;
};

type RowValues = Record<string, Record<string, string>>;

type MonthCard = {
  employeeId: string;
  start: number;
  end: number;
  code: string;
  pick: "start" | "end";
};

let cardTimer: number | null = null;

const PROPOSED_STYLE = { background: "#f1f5f9", color: "#94a3b8" } as const;

function ToolbarBtn({
  className,
  children,
  onClick,
  disabled,
  href,
}: {
  className: string;
  children: string;
  onClick?: () => void;
  disabled?: boolean;
  href?: string;
}) {
  const cls = `inline-flex h-8 items-center rounded px-3 text-[11px] font-bold text-white shadow-sm disabled:opacity-50 ${className}`;
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function personFromContract(c: AttendanceContract): Person {
  return {
    id: c.employee_id,
    last_name: (c.last_name || c.employee_name.split(" ")[0] || "").toUpperCase(),
    first_name: c.first_name || c.employee_name.split(" ").slice(1).join(" "),
    matricule: c.matricule,
    poste: c.poste_fr || c.poste_ar || "",
    affectation: [c.site_name, c.start_date ? `CONTRAT ${c.start_date}` : ""]
      .filter(Boolean)
      .join(" · "),
    start_date: c.start_date,
    site_id: c.site_id,
    site_name: c.site_name,
  };
}

function buildPeople(contracts: AttendanceContract[]) {
  const map = new Map<string, Person>();
  for (const c of contracts) {
    if (c.status === "ENDED") continue;
    const key = `${c.employee_id}|${c.site_id}`;
    if (!map.has(key)) map.set(key, personFromContract(c));
  }
  return [...map.values()];
}

export type AttendanceFocus = {
  employeeId?: string;
  siteId?: string;
  /** YYYY-MM */
  month?: string;
};

function focusPerson(people: Person[], focus?: AttendanceFocus) {
  if (!focus?.employeeId) return null;
  const mine = people.filter((p) => p.id === focus.employeeId);
  return mine.find((p) => p.site_id === focus.siteId) ?? mine[0] ?? null;
}

function focusMonth(focus?: AttendanceFocus) {
  const match = /^(\d{4})-(\d{2})$/.exec(focus?.month ?? "");
  if (!match) return null;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? { year: Number(match[1]), month } : null;
}

export function AttendanceManager({
  sites,
  contracts,
  legends,
  columns,
  jobTitles,
  focus,
  loadError,
}: {
  sites: readonly SiteOpt[];
  contracts: AttendanceContract[];
  legends: LegendRow[];
  columns: AttendanceColumn[];
  jobTitles: string[];
  focus?: AttendanceFocus;
  loadError?: string;
}) {
  const now = new Date();
  const [initial] = useState(() => {
    const person = focusPerson(buildPeople(contracts), focus);
    return { person, period: focusMonth(focus) };
  });
  const [mode, setMode] = useState<SearchMode>(initial.person ? "employee" : "site");
  const [siteId, setSiteId] = useState(
    initial.person?.site_id ?? focus?.siteId ?? sites[0]?.id ?? "",
  );
  const [year, setYear] = useState(initial.period?.year ?? now.getFullYear());
  const [month, setMonth] = useState(initial.period?.month ?? now.getMonth() + 1);
  const [cells, setCells] = useState<AttendanceCell[]>([]);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [periodStatus, setPeriodStatus] = useState<PayrollRunStatus | null>(null);
  const [dirty, setDirty] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [empQuery, setEmpQuery] = useState(
    initial.person
      ? `${initial.person.matricule} · ${initial.person.last_name} ${initial.person.first_name}`
      : "",
  );
  const [pickedEmployee, setPickedEmployee] = useState<Person | null>(initial.person);
  const [monthCard, setMonthCard] = useState<MonthCard | null>(null);
  const [cardDrag, setCardDrag] = useState<number | null>(null);
  const [showExtra, setShowExtra] = useState(true);
  const [access, setAccess] = useState<AttendanceColumnAccess | null>(null);
  const [rowValues, setRowValues] = useState<RowValues>({});
  const [carriedPoste, setCarriedPoste] = useState<Record<string, string>>({});
  const [rowDrafts, setRowDrafts] = useState<RowValues>({});
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const shownColumns = useMemo(
    () => (access ? visibleColumns(columns, access) : []),
    [columns, access],
  );
  const canEditDays = Boolean(access?.DAYS?.edit);
  const editableValues = useMemo(
    () => (access ? editableRowValueCodes(columns, access) : new Set<string>()),
    [columns, access],
  );
  const rowsDirty = Object.keys(rowDrafts).length > 0;

  const days = useMemo(() => new Date(year, month, 0).getDate(), [year, month]);
  const activeLegends = useMemo(
    () => legends.filter((l) => l.is_active),
    [legends],
  );
  const allowedCodes = useMemo(
    () => new Set(activeLegends.map((l) => l.code.toUpperCase())),
    [activeLegends],
  );
  const totauxCode =
    activeLegends.find((l) => l.code === "MS")?.code ??
    activeLegends.find((l) => l.counts_as_presence)?.code ??
    activeLegends[0]?.code ??
    "";

  const allPeople = useMemo(() => buildPeople(contracts), [contracts]);

  const empMatches = useMemo(() => {
    const q = empQuery.trim().toLowerCase();
    if (q.length < 1) return [];
    return allPeople
      .filter((p) => {
        const full = `${p.last_name} ${p.first_name}`.toLowerCase();
        const rev = `${p.first_name} ${p.last_name}`.toLowerCase();
        return (
          p.matricule.toLowerCase().includes(q) ||
          full.includes(q) ||
          rev.includes(q)
        );
      })
      .slice(0, 12);
  }, [allPeople, empQuery]);

  const people = useMemo(() => {
    if (mode === "employee") {
      return pickedEmployee ? [pickedEmployee] : [];
    }
    return allPeople.filter((p) => p.site_id === siteId);
  }, [mode, pickedEmployee, allPeople, siteId]);

  const grid = useMemo(() => {
    const m = new Map<string, AttendanceCell>();
    for (const c of cells) m.set(`${c.employee_id}|${c.work_date}`, c);
    return m;
  }, [cells]);

  const legendMap = useMemo(
    () => new Map(legends.map((l) => [l.code.toUpperCase(), l])),
    [legends],
  );

  function iso(day: number) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function weekday(day: number) {
    return WEEK[new Date(year, month - 1, day).getDay()];
  }

  function cellKey(employeeId: string, day: number) {
    return `${employeeId}|${iso(day)}`;
  }

  function paintRange(employeeId: string, startDay: number, endDay: number, code: string) {
    const from = Math.min(startDay, endDay);
    const to = Math.max(startDay, endDay);
    const normalized = code.trim().toUpperCase();
    const dates = Array.from({ length: to - from + 1 }, (_, i) => iso(from + i));
    setCells((prev) =>
      paintAttendanceCells(prev, { employeeId, siteId, dates, code: normalized }),
    );
    setDirty(true);
    setDrafts((prev) => {
      const copy = { ...prev };
      for (let d = from; d <= to; d += 1) {
        const key = cellKey(employeeId, d);
        if (!normalized) delete copy[key];
        else copy[key] = normalized;
      }
      return copy;
    });
  }

  function applyCellCode(employeeId: string, day: number, raw: string) {
    const key = cellKey(employeeId, day);
    const code = raw.trim().toUpperCase();
    if (code === (grid.get(key)?.legend_code ?? "").toUpperCase()) {
      setDrafts((prev) => ({ ...prev, [key]: code }));
      return true;
    }
    if (!code) {
      paintRange(employeeId, day, day, "");
      setError(null);
      return true;
    }
    if (!allowedCodes.has(code)) {
      setError(`Code non autorisé : ${code}. Codes : ${[...allowedCodes].join(" · ")}`);
      const current = grid.get(key)?.legend_code ?? "";
      setDrafts((prev) => ({ ...prev, [key]: current }));
      return false;
    }
    paintRange(employeeId, day, day, code);
    setError(null);
    return true;
  }

  function applySheetRows(rows: AttendanceSheetRow[]) {
    const values: RowValues = {};
    const carried: Record<string, string> = {};
    for (const row of rows) {
      values[row.employee_id] = row.values;
      if (row.carried_poste) carried[row.employee_id] = row.carried_poste;
    }
    setRowValues(values);
    setCarriedPoste(carried);
    setRowDrafts({});
  }

  function storedRowValue(employeeId: string, code: string) {
    return rowValues[employeeId]?.[code] ?? "";
  }

  function rowValue(employeeId: string, code: string) {
    return rowDrafts[employeeId]?.[code] ?? storedRowValue(employeeId, code);
  }

  function editRowValue(employeeId: string, code: string, value: string) {
    setRowDrafts((prev) => {
      const mine = { ...(prev[employeeId] ?? {}) };
      if (value === storedRowValue(employeeId, code)) delete mine[code];
      else mine[code] = value;
      const next = { ...prev };
      if (Object.keys(mine).length) next[employeeId] = mine;
      else delete next[employeeId];
      return next;
    });
  }

  function posteFor(p: Person) {
    return rowValue(p.id, POSTE_EFFECTIF) || carriedPoste[p.id] || p.poste;
  }

  function loadMonth(y = year, m = month, sid = siteId, message?: string) {
    if (!sid) return;
    start(async () => {
      setError(null);
      const r = await loadAttendanceSheet({ site_id: sid, year: y, month: m });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setCells(r.data.cells);
      setLoadedAt(r.data.loaded_at);
      setPeriodStatus(r.data.period_status);
      setAccess(r.data.access);
      applySheetRows(r.data.rows);
      setDirty(false);
      const nextDrafts: Record<string, string> = {};
      for (const cell of r.data.cells) {
        nextDrafts[`${cell.employee_id}|${cell.work_date}`] = cell.legend_code;
      }
      setDrafts(nextDrafts);
      setInfo(message ?? `${MONTHS[m - 1]} ${y} · ${sites.find((s) => s.id === sid)?.name_fr ?? ""}`);
    });
  }

  useEffect(() => {
    loadMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, year, month]);

  const frozenMessage = attendanceFrozenMessage(periodStatus);

  function save() {
    setError(null);
    start(async () => {
      const messages: string[] = [];
      if (rowsDirty) {
        const visible = new Set(people.map((p) => p.id));
        const rows = Object.entries(rowDrafts)
          .filter(([employeeId]) => visible.has(employeeId))
          .map(([employeeId, values]) => ({ employee_id: employeeId, values }));
        const saved = await saveAttendanceSheetRows({ site_id: siteId, year, month, rows });
        if (!saved.ok) {
          setError(saved.error);
          return;
        }
        messages.push(`${saved.data.count} ligne(s) mise(s) à jour`);
      }
      if (canEditDays) {
        const scoped =
          mode === "employee" && pickedEmployee
            ? cells.filter((c) => c.employee_id === pickedEmployee.id)
            : cells;
        const r = await saveAttendanceMonth({
          site_id: siteId,
          year,
          month,
          employee_id: mode === "employee" ? pickedEmployee?.id : undefined,
          loaded_at: loadedAt ?? undefined,
          cells: scoped.map((c) => ({
            employee_id: c.employee_id,
            site_id: c.site_id,
            work_date: c.work_date,
            legend_code: c.legend_code,
            source_code: c.source_code,
            correspondence_id: c.correspondence_id,
          })),
        });
        if (!r.ok) {
          setError(r.error);
          return;
        }
        messages.push(`${r.data.count} valeurs validées`);
        if (r.data.refreshed_slips > 0) {
          messages.push(`${r.data.refreshed_slips} bulletin(s) mis à jour`);
        }
      }
      loadMonth(year, month, siteId, `${messages.join(" · ")}. · تم اعتماد القيم.`);
    });
  }

  function nextMonth() {
    const next = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    setMonth(next);
    setYear(nextYear);
    setCells([]);
    setDirty(false);
    setDrafts({});
    setInfo(`${MONTHS[next - 1]} ${nextYear}`);
  }

  function pickEmployee(person: Person) {
    setPickedEmployee(person);
    setEmpQuery(`${person.matricule} · ${person.last_name} ${person.first_name}`);
    setSiteId(person.site_id);
    setError(null);
    setInfo(`${person.last_name} ${person.first_name} · ${person.site_name}`);
  }

  function countCode(employeeId: string, code: string) {
    let n = 0;
    for (let d = 1; d <= days; d += 1) {
      if (grid.get(`${employeeId}|${iso(d)}`)?.legend_code === code) n += 1;
    }
    return n;
  }

  function coefSum(employeeId: string) {
    let n = 0;
    for (let d = 1; d <= days; d += 1) {
      const code = grid.get(`${employeeId}|${iso(d)}`)?.legend_code;
      const legend = code ? legendMap.get(code.toUpperCase()) : undefined;
      n += Number(legend?.coefficient ?? 0);
    }
    return n;
  }

  function dayTotaux(day: number) {
    const date = iso(day);
    return people.filter(
      (p) => grid.get(`${p.id}|${date}`)?.legend_code === totauxCode,
    ).length;
  }

  const visibleIds = new Set(people.map((p) => p.id));
  const pendingCounts = countPending(cells.filter((c) => visibleIds.has(c.employee_id)));
  const extraCodes = activeLegends.map((l) => l.code);
  const cardPerson = monthCard
    ? people.find((p) => p.id === monthCard.employeeId)
    : null;

  const tableColumns = shownColumns.filter(
    (c) => showExtra || (c.kind !== "CODE_COUNTS" && c.kind !== "TOTAL"),
  );
  const colCount = tableColumns.reduce(
    (n, c) => n + (c.kind === "DAYS" ? days : c.kind === "CODE_COUNTS" ? extraCodes.length : 1),
    0,
  );
  const STICKY = "sticky left-0 z-10";

  function renderHeader(col: AttendanceColumn): ReactNode {
    if (col.kind === "DAYS") {
      return Array.from({ length: days }, (_, i) => (
        <th
          key={i}
          className="min-w-[42px] border border-slate-300 px-0 py-1 text-center leading-tight"
        >
          <div>{i + 1}</div>
          <div className="text-[9px] font-normal uppercase">{weekday(i + 1)}</div>
        </th>
      ));
    }
    if (col.kind === "CODE_COUNTS") {
      return extraCodes.map((code) => (
        <th key={code} className="min-w-[36px] border border-slate-300 bg-orange-50 px-1 py-1">
          {code}
        </th>
      ));
    }
    const sticky = col.source === "LAST_NAME" ? `${STICKY} z-20 bg-slate-100` : "";
    const tone = col.kind === "TOTAL" ? "min-w-[36px] bg-orange-100 px-1" : "px-2 text-left";
    return (
      <th
        className={`whitespace-nowrap border border-slate-300 py-1 ${tone} ${sticky}`}
        title={col.label_ar ?? undefined}
      >
        {col.label_fr}
      </th>
    );
  }

  function renderDayCells(p: Person): ReactNode {
    return Array.from({ length: days }, (_, i) => {
      const key = cellKey(p.id, i + 1);
      const cell = grid.get(key);
      const stored = cell?.legend_code ?? "";
      const value = drafts[key] ?? stored;
      const legend = value ? legendMap.get(value.toUpperCase()) : undefined;
      const proposed = isAutoProposed(cell) && value === stored;
      const origin = value === stored ? cellOriginLabel(cell) : "";
      return (
        <td key={i} className="border border-slate-200 p-0">
          <input
            readOnly={!canEditDays}
            className={`h-7 w-full min-w-[42px] border-0 bg-transparent text-center text-[10px] font-bold uppercase outline-none ${
              proposed ? "italic" : ""
            } ${canEditDays ? "" : "cursor-default"}`}
            style={
              proposed
                ? PROPOSED_STYLE
                : {
                    background: legend?.color_bg ?? "#ffffff",
                    color: legend?.color_fg ?? "#111",
                    boxShadow:
                      value === stored && cell?.source_code === "OM"
                        ? "inset 0 -2px 0 rgba(15, 23, 42, 0.45)"
                        : undefined,
                  }
            }
            value={value}
            title={
              legend
                ? `${legend.code} · ${legend.label_fr}${origin ? `\n${origin}` : ""}`
                : "رمز الحضور"
            }
            onClick={() => {
              if (!canEditDays) return;
              const snapshot = {
                employeeId: p.id,
                start: i + 1,
                end: i + 1,
                code: value || totauxCode || activeLegends[0]?.code || "",
                pick: "start" as const,
              };
              if (cardTimer) window.clearTimeout(cardTimer);
              cardTimer = window.setTimeout(() => setMonthCard(snapshot), 280);
            }}
            onChange={(e) => {
              if (!canEditDays) return;
              if (cardTimer) {
                window.clearTimeout(cardTimer);
                cardTimer = null;
              }
              setMonthCard(null);
              setDrafts((prev) => ({
                ...prev,
                [key]: e.target.value.toUpperCase(),
              }));
            }}
            onBlur={(e) => {
              if (canEditDays) applyCellCode(p.id, i + 1, e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
          />
        </td>
      );
    });
  }

  function renderValueInput(col: AttendanceColumn, p: Person, placeholder?: string) {
    const edited = rowDrafts[p.id]?.[col.code] !== undefined;
    return (
      <td className="border border-slate-200 p-0">
        <input
          className={`h-7 w-full min-w-[120px] border-0 px-2 text-[11px] outline-none focus:bg-sky-50 ${
            edited ? "bg-amber-50" : "bg-transparent"
          }`}
          type={col.value_type === "number" ? "number" : col.value_type === "date" ? "date" : "text"}
          list={col.catalog_kind === "job_title" ? "attendance-job-titles" : undefined}
          value={rowValue(p.id, col.code)}
          placeholder={placeholder}
          title={col.label_ar ?? col.label_fr}
          onChange={(e) => editRowValue(p.id, col.code, e.target.value)}
        />
      </td>
    );
  }

  function renderCell(col: AttendanceColumn, p: Person, index: number): ReactNode {
    const td = "whitespace-nowrap border border-slate-200 px-2";
    const editable = Boolean(access?.[col.code]?.edit);
    switch (col.kind) {
      case "DAYS":
        return renderDayCells(p);
      case "CODE_COUNTS":
        return extraCodes.map((code) => (
          <td key={code} className="border border-slate-200 bg-orange-50/60 px-1 text-center">
            {countCode(p.id, code) || ""}
          </td>
        ));
      case "TOTAL":
        return (
          <td className="border border-slate-200 bg-orange-50 px-1 text-center">
            {col.source === "NJ" ? days : col.source === "COEF" ? coefSum(p.id) || "" : ""}
          </td>
        );
      case "INPUT":
        return editable ? (
          renderValueInput(col, p)
        ) : (
          <td className={td}>{rowValue(p.id, col.code)}</td>
        );
      case "IDENTITY":
        switch (col.source) {
          case "ROW_NO":
            return <td className="border border-slate-200 px-1 text-center">{index + 1}</td>;
          case "MATRICULE":
            return <td className={`${td} font-mono`}>{p.matricule}</td>;
          case "LAST_NAME":
            return <td className={`${td} ${STICKY} bg-white font-semibold`}>{p.last_name}</td>;
          case "FIRST_NAME":
            return <td className={td}>{p.first_name}</td>;
          case POSTE_EFFECTIF:
            return editable ? (
              renderValueInput(col, p, carriedPoste[p.id] || p.poste)
            ) : (
              <td className={td}>{posteFor(p)}</td>
            );
          case "AFFECTATION":
            return <td className={td}>{p.affectation}</td>;
          case "CONTRACT_START":
            return <td className={td}>{p.start_date}</td>;
          default:
            return <td className={td} />;
        }
    }
    return null;
  }

  const totalsLabelCode =
    tableColumns.find((c) => c.source === "LAST_NAME")?.code ?? tableColumns[0]?.code;

  function renderFooter(col: AttendanceColumn, labelHere: boolean): ReactNode {
    const td = "border border-slate-300";
    if (col.kind === "DAYS") {
      return Array.from({ length: days }, (_, i) => (
        <td key={i} className={`${td} py-1 text-center`}>
          {dayTotaux(i + 1) || ""}
        </td>
      ));
    }
    if (col.kind === "CODE_COUNTS") {
      return extraCodes.map((code) => (
        <td key={code} className={`${td} text-center`}>
          {people.reduce((n, p) => n + countCode(p.id, code), 0) || ""}
        </td>
      ));
    }
    if (col.kind === "TOTAL") {
      return (
        <td className={`${td} text-center`}>
          {col.source === "NJ"
            ? days
            : col.source === "COEF"
              ? people.reduce((n, p) => n + coefSum(p.id), 0) || ""
              : ""}
        </td>
      );
    }
    const sticky = col.source === "LAST_NAME" ? `${STICKY} bg-yellow-300` : "";
    return <td className={`${td} px-2 ${sticky}`}>{labelHere ? "TOTAUX" : ""}</td>;
  }

  return (
    <div className="-mx-2 space-y-3 sm:-mx-4 print:mx-0">
      <div className="print:hidden">
        <RhPageHeader
          eyebrow="Pointage"
          title={`${MONTHS[month - 1]} ${year}`}
          actions={
            <RhTabs
              items={[
                { id: "site", label: "Par chantier" },
                { id: "employee", label: "Par employé" },
              ]}
              value={mode}
              onChange={(id) => {
                if (id === "site") {
                  setMode("site");
                  setPickedEmployee(null);
                  setEmpQuery("");
                } else {
                  setMode("employee");
                }
              }}
            />
          }
        />
      </div>

      <div className="flex flex-wrap items-end gap-2 print:hidden">
        <label className="text-xs">
          Année
          <input
            className="mt-1 block h-8 w-24 rounded border border-border px-2 text-sm"
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        </label>
        <label className="text-xs">
          Mois
          <select
            className="mt-1 block h-8 rounded border border-border bg-white px-2 text-sm"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {MONTHS.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {mode === "site" ? (
          <label className="text-xs">
            Chantier
            <select
              className="mt-1 block h-8 min-w-[200px] rounded border border-border bg-white px-2 text-sm"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name_fr}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="relative min-w-[280px] flex-1 text-xs">
            Matricule ou nom / prénom
            <input
              className="mt-1 block h-8 w-full rounded border border-border px-2 text-sm"
              value={empQuery}
              placeholder="09/26 ou NOM PRENOM"
              onChange={(e) => {
                setEmpQuery(e.target.value);
                setPickedEmployee(null);
              }}
            />
            {mode === "employee" && !pickedEmployee && empMatches.length > 0 ? (
              <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded border border-border bg-white shadow">
                {empMatches.map((p) => (
                  <button
                    type="button"
                    key={`${p.id}-${p.site_id}`}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-brand/10"
                    onClick={() => pickEmployee(p)}
                  >
                    <span className="font-mono text-brand">{p.matricule}</span>
                    {" · "}
                    {p.last_name} {p.first_name}
                    <span className="block text-[11px] text-foreground/55">
                      {p.site_name} · {p.poste}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </label>
        )}
        <ToolbarBtn className="bg-slate-600" href="/rh/parametres">
          Administration
        </ToolbarBtn>
        <ToolbarBtn className="bg-orange-500" href="/rh/employes">
          Fiche Employé
        </ToolbarBtn>
        <ToolbarBtn className="bg-emerald-600" href="/rh/documents?nouveau=om">
          N° Ordre de Mission
        </ToolbarBtn>
        <ToolbarBtn className="bg-green-700" onClick={() => setInfo("Totaux recalculés.")}>
          Recalculer Totaux
        </ToolbarBtn>
        <ToolbarBtn className="bg-sky-600" onClick={nextMonth} disabled={pending}>
          Mois Suivant
        </ToolbarBtn>
        <ToolbarBtn className="bg-violet-600" onClick={() => window.print()}>
          Archiver Mois
        </ToolbarBtn>
        <ToolbarBtn className="bg-slate-800" onClick={() => setShowExtra((v) => !v)}>
          Totaux & colonnes
        </ToolbarBtn>
      </div>

      {(error || info) && (
        <div className="print:hidden">
          <RhAlert tone={error ? "danger" : "success"}>{error || info}</RhAlert>
        </div>
      )}

      {frozenMessage ? (
        <div className="print:hidden">
          <RhAlert tone="warning">{frozenMessage}</RhAlert>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1 print:hidden">
        {activeLegends.map((l) => (
          <span
            key={l.id}
            className="rounded px-2 py-1 text-[11px] font-bold"
            style={{
              background: l.color_bg ?? "#e2e8f0",
              color: l.color_fg ?? "#111",
            }}
            title={l.label_fr}
          >
            {l.code}
          </span>
        ))}
        <span
          className="rounded px-2 py-1 text-[11px] font-bold italic"
          style={PROPOSED_STYLE}
          title="Valeur proposée par un ordre de mission, non validée"
        >
          MS · proposé par OM (non validé) — مقترح من أمر المهمة
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 print:hidden">
        <p className="text-[12px] text-amber-900">
          {pendingCounts.proposed > 0 || pendingCounts.edited > 0 || dirty || rowsDirty ? (
            <>
              <strong>Valeurs non validées — قيم غير معتمدة :</strong>{" "}
              {pendingCounts.proposed} proposée(s) par ordre de mission
              {pendingCounts.edited > 0 ? ` · ${pendingCounts.edited} saisie(s) manuelle(s)` : ""}
              {dirty || rowsDirty ? " · modifications en cours" : ""}
            </>
          ) : access && !canEditDays && editableValues.size === 0 ? (
            "Consultation seule pour votre rôle. · اطلاع فقط حسب دورك."
          ) : (
            "Toutes les valeurs affichées sont validées. · جميع القيم المعروضة معتمدة."
          )}
        </p>
        <Button
          className="h-9 px-4 text-[12px] font-bold"
          disabled={
            pending ||
            !siteId ||
            people.length === 0 ||
            Boolean(frozenMessage) ||
            (!canEditDays && !(editableValues.size > 0 && rowsDirty))
          }
          onClick={save}
        >
          اعتماد القيم المعبأة — Valider les valeurs renseignées
        </Button>
      </div>

      <RhTableWrap>
        <table className="min-w-max border-collapse text-[11px]">
          <thead>
            <tr className="bg-slate-100">
              {tableColumns.map((col) => (
                <Fragment key={col.code}>{renderHeader(col)}</Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {!access ? (
              <tr>
                <td className="px-3 py-6 text-foreground/55" colSpan={Math.max(colCount, 1)}>
                  Chargement… · جارٍ التحميل…
                </td>
              </tr>
            ) : tableColumns.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-foreground/55">
                  Aucune colonne autorisée pour votre rôle sur ce chantier. · لا توجد أعمدة مسموحة لدورك.
                </td>
              </tr>
            ) : people.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-foreground/55" colSpan={colCount}>
                  {mode === "employee"
                    ? "Recherchez par matricule ou nom / prénom, puis sélectionnez l’employé."
                    : "Aucun contrat sur ce chantier."}
                </td>
              </tr>
            ) : (
              people.map((p, index) => (
                <tr key={`${p.id}-${p.site_id}`} className="bg-white">
                  {tableColumns.map((col) => (
                    <Fragment key={col.code}>{renderCell(col, p, index)}</Fragment>
                  ))}
                </tr>
              ))
            )}
            {access && people.length > 0 && tableColumns.length > 0 ? (
              <tr className="bg-yellow-300 font-bold">
                {tableColumns.map((col) => (
                  <Fragment key={col.code}>
                    {renderFooter(col, col.code === totalsLabelCode)}
                  </Fragment>
                ))}
              </tr>
            ) : null}
          </tbody>
        </table>
        {jobTitles.length ? (
          <datalist id="attendance-job-titles">
            {jobTitles.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        ) : null}
      </RhTableWrap>
      <p className="text-[11px] text-foreground/55 print:hidden">
        Saisissez le code dans la cellule (codes du référentiel uniquement). Un clic ouvre la fiche du mois pour définir début, fin et code.
        Les « MS » grisés viennent d&apos;un ordre de mission : modifiables, ils ne comptent qu&apos;après « Valider les valeurs renseignées ».
      </p>

      {monthCard && cardPerson ? (
        <div
          onMouseUp={() => setCardDrag(null)}
          onMouseLeave={() => setCardDrag(null)}
        >
          <RhModal
            title="Fiche du mois"
            subtitle={`${cardPerson.last_name} ${cardPerson.first_name} · ${MONTHS[month - 1]} ${year}`}
            onClose={() => setMonthCard(null)}
            footer={
              <>
                <Button variant="ghost" onClick={() => setMonthCard(null)}>
                  Annuler
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    paintRange(monthCard.employeeId, monthCard.start, monthCard.end, "");
                    setMonthCard(null);
                    setInfo("Période effacée.");
                  }}
                >
                  Effacer la période
                </Button>
                <Button
                  onClick={() => {
                    const code = monthCard.code.trim().toUpperCase();
                    if (!allowedCodes.has(code)) {
                      setError("Choisissez un code du référentiel uniquement.");
                      return;
                    }
                    if (
                      monthCard.start < 1 ||
                      monthCard.end < 1 ||
                      monthCard.start > days ||
                      monthCard.end > days
                    ) {
                      setError("Jours invalides.");
                      return;
                    }
                    paintRange(
                      monthCard.employeeId,
                      monthCard.start,
                      monthCard.end,
                      code,
                    );
                    setMonthCard(null);
                    setInfo(
                      `${code} du ${Math.min(monthCard.start, monthCard.end)} au ${Math.max(monthCard.start, monthCard.end)}.`,
                    );
                  }}
                >
                  Appliquer
                </Button>
              </>
            }
          >
            <div
              className="select-none"
              onMouseUp={() => setCardDrag(null)}
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-xs">
                  Code
                  <select
                    className={`${rhInput} mt-1`}
                    value={monthCard.code}
                    onChange={(e) =>
                      setMonthCard({ ...monthCard, code: e.target.value.toUpperCase() })
                    }
                  >
                    {activeLegends.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.code} — {l.label_fr}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  Du jour
                  <button
                    type="button"
                    className={`mt-1 flex h-10 w-full items-center justify-center rounded-xl border px-2 text-sm font-semibold ${
                      monthCard.pick === "start"
                        ? "border-brand ring-2 ring-brand/30"
                        : "border-border"
                    }`}
                    onClick={() => setMonthCard({ ...monthCard, pick: "start" })}
                  >
                    {monthCard.start}
                  </button>
                </label>
                <label className="text-xs">
                  Au jour
                  <button
                    type="button"
                    className={`mt-1 flex h-10 w-full items-center justify-center rounded-xl border px-2 text-sm font-semibold ${
                      monthCard.pick === "end"
                        ? "border-brand ring-2 ring-brand/30"
                        : "border-border"
                    }`}
                    onClick={() => setMonthCard({ ...monthCard, pick: "end" })}
                  >
                    {monthCard.end}
                  </button>
                </label>
              </div>
              <p className="mt-2 text-[11px] text-foreground/55">
                {monthCard.pick === "start"
                  ? "Début actif : cliquez le jour de début puis glissez jusqu’au jour de fin."
                  : "Fin active : cliquez le jour de fin sur la grille."}
              </p>
              <div className="mt-3 grid grid-cols-7 gap-1">
                {Array.from({ length: days }, (_, i) => {
                  const day = i + 1;
                  const from = Math.min(monthCard.start, monthCard.end);
                  const to = Math.max(monthCard.start, monthCard.end);
                  const inRange = day >= from && day <= to;
                  const isStart = day === monthCard.start;
                  const isEnd = day === monthCard.end;
                  return (
                    <button
                      key={day}
                      type="button"
                      className={`h-9 rounded-lg text-[11px] font-semibold ${
                        isStart || isEnd
                          ? "bg-brand text-white"
                          : inRange
                            ? "bg-brand/25 text-brand"
                            : "bg-slate-100"
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setCardDrag(day);
                        if (monthCard.pick === "end") {
                          setMonthCard({ ...monthCard, end: day });
                        } else {
                          setMonthCard({ ...monthCard, start: day, end: day });
                        }
                      }}
                      onMouseEnter={() => {
                        if (cardDrag == null) return;
                        if (monthCard.pick === "end") {
                          setMonthCard({ ...monthCard, end: day });
                        } else {
                          setMonthCard({ ...monthCard, start: cardDrag, end: day });
                        }
                      }}
                    >
                      {day}
                      <span className="block text-[8px] font-normal">{weekday(day)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </RhModal>
        </div>
      ) : null}
    </div>
  );
}
