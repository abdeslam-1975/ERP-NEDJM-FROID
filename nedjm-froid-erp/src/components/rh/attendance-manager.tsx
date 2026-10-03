"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import { saveAttendanceMonth, type AttendanceCell } from "@/lib/actions/hr-ops";
import { parseAttendanceImport } from "@/lib/actions/hr-attendance-import";
import { attendanceFrozenMessage, type PayrollRunStatus } from "@/lib/hr/payroll-run-status";
import { payrollSignalNotice } from "@/lib/decisions/catalog";
import {
  loadAttendanceSheet,
  saveAttendanceSheetRows,
} from "@/lib/actions/hr-attendance-sheet";
import type { LegendRow } from "@/lib/actions/hr-catalogs";
import { legendCoefficientAt } from "@/lib/hr/legend-coefficient";
import {
  contractsForMonth,
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
import { RhAlert, RhTabs } from "@/components/rh/rh-ui";

type SiteOpt = { id: string; name_fr: string };
type SearchMode = "site" | "employee";

const MONTHS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];
const MONTHS_SHORT = [
  "Janv.",
  "Févr.",
  "Mars",
  "Avr.",
  "Mai",
  "Juin",
  "Juil.",
  "Août",
  "Sept.",
  "Oct.",
  "Nov.",
  "Déc.",
];
const WEEK = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
/** Algerian weekend: Friday and Saturday. */
const WEEKEND = new Set([5, 6]);

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

const PROPOSED_CLS =
  "italic bg-slate-100 text-slate-400 dark:bg-slate-800/60 dark:text-slate-500";
const SELECT_CLS =
  "h-9 rounded-xl border border-border/80 bg-surface px-3 text-sm text-foreground outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10";
const GHOST_BTN =
  "inline-flex h-9 items-center gap-2 rounded-xl border border-border/80 bg-surface px-3 text-sm font-medium text-foreground/80 transition hover:bg-surface-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50";

/** Legend colours from the catalogue are saturated; grid cells use a soft tint of them. */
function softTone(bg?: string | null): CSSProperties | undefined {
  if (!bg) return undefined;
  return {
    background: `color-mix(in oklab, ${bg} 26%, var(--surface))`,
    color: `color-mix(in oklab, ${bg} 50%, var(--foreground))`,
  };
}

function Icon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  left: "M15 18l-6-6 6-6",
  right: "M9 18l6-6-6-6",
  calendar: "M8 3v3m8-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  upload: "M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
  download: "M12 4v12m0 0-4-4m4 4 4-4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
  print: "M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v6H7z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  check: "M5 12.5l4.5 4.5L19 7.5",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4-4",
  swatch: "M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5 0-1.2-1-1.5-1-2.5s.8-1.5 2-1.5H17a4 4 0 0 0 4-4c0-4.7-4-8.5-9-8.5ZM7.5 12h.01M10 7.5h.01M15 7.5h.01",
  close: "M6 6l12 12M18 6 6 18",
  columns: "M4 5h16v14H4zM10 5v14M16 5v14",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0",
  file: "M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4Zm0 0v4h4",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z",
  inbox: "M4 13h4l1.5 3h5L16 13h4M5 5h14l1 8v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6l1-8Z",
} as const;

/** Trigger + floating panel closed by outside click or Escape. */
function Popover({
  trigger,
  title,
  align = "end",
  buttonClass = GHOST_BTN,
  children,
}: {
  trigger: ReactNode;
  title?: string;
  align?: "start" | "end";
  buttonClass?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={buttonClass}
        title={title}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
      </button>
      {open ? (
        <div
          className={`absolute top-full z-40 mt-2 min-w-[14rem] rounded-2xl border border-border/70 bg-surface p-1.5 shadow-[0_18px_48px_-16px_rgba(15,23,42,0.35)] ring-1 ring-black/5 ${
            align === "end" ? "right-0" : "left-0"
          }`}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

const MENU_ITEM =
  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-foreground/80 transition hover:bg-surface-muted hover:text-foreground";

function StatusChip({
  tone,
  children,
}: {
  tone: "neutral" | "warning" | "success" | "info";
  children: ReactNode;
}) {
  const map = {
    neutral: "bg-surface-muted text-foreground/65",
    warning: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200",
    info: "bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
  }[tone];
  return (
    <span className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ${map}`}>
      {children}
    </span>
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

function buildPeople(contracts: AttendanceContract[], year: number, month: number) {
  return contractsForMonth(contracts, year, month).map(personFromContract);
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
    const period = focusMonth(focus);
    const person = focusPerson(
      buildPeople(contracts, period?.year ?? now.getFullYear(), period?.month ?? now.getMonth() + 1),
      focus,
    );
    return { person, period };
  });
  const [mode, setMode] = useState<SearchMode>(initial.person ? "employee" : "site");
  const [siteId, setSiteId] = useState(
    initial.person?.site_id ?? focus?.siteId ?? sites[0]?.id ?? "",
  );
  const [year, setYear] = useState(initial.period?.year ?? now.getFullYear());
  const [month, setMonth] = useState(initial.period?.month ?? now.getMonth() + 1);
  const [pickerYear, setPickerYear] = useState(year);
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

  const allPeople = useMemo(() => buildPeople(contracts, year, month), [contracts, year, month]);

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

  useEffect(() => {
    if (!info) return;
    const t = window.setTimeout(() => setInfo(null), 4500);
    return () => window.clearTimeout(t);
  }, [info]);

  const cardOpen = monthCard !== null;
  useEffect(() => {
    if (!cardOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMonthCard(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cardOpen]);

  function iso(day: number) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function dayOfWeek(day: number) {
    return new Date(year, month - 1, day).getDay();
  }

  function weekday(day: number) {
    return WEEK[dayOfWeek(day)];
  }

  function isWeekend(day: number) {
    return WEEKEND.has(dayOfWeek(day));
  }

  const todayDay =
    now.getFullYear() === year && now.getMonth() + 1 === month ? now.getDate() : null;

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
      if (message) setInfo(message);
    });
  }

  useEffect(() => {
    loadMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, year, month]);

  const frozenMessage = attendanceFrozenMessage(periodStatus);
  const hasUnsaved = dirty || rowsDirty;

  useEffect(() => {
    if (!hasUnsaved) return;
    const message = "Des modifications non validées seront perdues. Continuer ?";
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = message;
    }
    function onLinkClick(e: MouseEvent) {
      const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!link || link.getAttribute("target") === "_blank") return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onLinkClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onLinkClick, true);
    };
  }, [hasUnsaved]);

  function confirmDiscard() {
    return (
      !hasUnsaved ||
      window.confirm("Des modifications non validées seront perdues. Continuer ?")
    );
  }

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
        const payrollNotice = payrollSignalNotice(r.data.payroll);
        if (payrollNotice) messages.push(payrollNotice);
      }
      loadMonth(year, month, siteId, messages.join(" · "));
    });
  }

  function importExcel(file: File) {
    const fd = new FormData();
    fd.set("file", file);
    fd.set("site_id", siteId);
    fd.set("year", String(year));
    fd.set("month", String(month));
    setError(null);
    start(async () => {
      const r = await parseAttendanceImport(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const { cells: imported, hours, errors, rows } = r.data;
      let applied = 0;
      if (imported.length && canEditDays) {
        setCells((prev) =>
          imported.reduce(
            (acc, c) =>
              paintAttendanceCells(acc, {
                employeeId: c.employee_id,
                siteId,
                dates: [c.work_date],
                code: c.legend_code,
              }),
            prev,
          ),
        );
        setDrafts((prev) => {
          const copy = { ...prev };
          for (const c of imported) copy[`${c.employee_id}|${c.work_date}`] = c.legend_code;
          return copy;
        });
        setDirty(true);
        applied = imported.length;
      }
      let hoursApplied = 0;
      for (const [employeeId, values] of Object.entries(hours)) {
        for (const [code, value] of Object.entries(values)) {
          if (!editableValues.has(code)) continue;
          editRowValue(employeeId, code, value);
          hoursApplied += 1;
        }
      }
      setInfo(
        `Import : ${rows} employé(s), ${applied} jour(s)${hoursApplied ? `, ${hoursApplied} valeur(s) d'heures` : ""}. Vérifiez puis validez.`,
      );
      if (errors.length) setError(`${errors.length} anomalie(s) : ${errors.join(" · ")}`);
    });
  }

  function goToMonth(y: number, m: number) {
    if ((y === year && m === month) || !confirmDiscard()) return false;
    setYear(y);
    setMonth(m);
    setCells([]);
    setDirty(false);
    setDrafts({});
    return true;
  }

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    goToMonth(d.getFullYear(), d.getMonth() + 1);
  }

  function changeSite(id: string) {
    if (id === siteId || !confirmDiscard()) return;
    setSiteId(id);
  }

  function pickEmployee(person: Person) {
    if (person.site_id !== siteId && !confirmDiscard()) return;
    setPickedEmployee(person);
    setEmpQuery(`${person.matricule} · ${person.last_name} ${person.first_name}`);
    setSiteId(person.site_id);
    setError(null);
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
      if (legend) n += legendCoefficientAt(legend.coefficient_versions, iso(d), Number(legend.coefficient));
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
  const monthPrefix = iso(1).slice(0, 8);
  const codeTotals = new Map<string, number>();
  for (const c of cells) {
    if (!visibleIds.has(c.employee_id) || !c.work_date.startsWith(monthPrefix)) continue;
    codeTotals.set(c.legend_code, (codeTotals.get(c.legend_code) ?? 0) + 1);
  }
  const extraCodes = activeLegends
    .map((l) => l.code)
    .filter((code) => (codeTotals.get(code) ?? 0) > 0);
  const cardPerson = monthCard
    ? people.find((p) => p.id === monthCard.employeeId)
    : null;
  const readOnly = Boolean(access) && !canEditDays && editableValues.size === 0;
  const importDisabled = pending || !siteId || Boolean(frozenMessage) || (!canEditDays && editableValues.size === 0);
  const saveDisabled =
    pending ||
    !siteId ||
    people.length === 0 ||
    Boolean(frozenMessage) ||
    (!canEditDays && !(editableValues.size > 0 && rowsDirty));

  const tableColumns = shownColumns.filter(
    (c) => showExtra || (c.kind !== "CODE_COUNTS" && c.kind !== "TOTAL"),
  );
  const colCount = tableColumns.reduce(
    (n, c) => n + (c.kind === "DAYS" ? days : c.kind === "CODE_COUNTS" ? extraCodes.length : 1),
    0,
  );

  const STICKY = "sticky left-0";
  const TH =
    "sticky top-0 z-10 border-b-2 border-[color-mix(in_oklab,var(--border)_70%,var(--foreground))] bg-[color-mix(in_oklab,var(--surface-muted)_80%,var(--border))] py-1.5 text-[12px] font-bold text-foreground";
  const TH_WEEKEND = "bg-[color-mix(in_oklab,var(--border)_90%,var(--foreground)_10%)]";
  const TD = "border-b border-border/60";
  const TF =
    "sticky bottom-0 z-10 border-t-2 border-[color-mix(in_oklab,var(--border)_70%,var(--foreground))] bg-[color-mix(in_oklab,var(--surface-muted)_80%,var(--border))] py-1.5 text-[12px] font-bold tabular-nums text-foreground";

  function renderHeader(col: AttendanceColumn): ReactNode {
    if (col.kind === "DAYS") {
      return Array.from({ length: days }, (_, i) => {
        const day = i + 1;
        const today = day === todayDay;
        return (
          <th
            key={i}
            className={`${TH} w-[28px] min-w-[28px] px-px text-center ${isWeekend(day) ? TH_WEEKEND : ""}`}
          >
            <div
              className={`mx-auto flex w-6 flex-col items-center rounded-md py-0.5 leading-tight ${
                today ? "bg-brand text-white shadow-sm shadow-brand/30" : ""
              }`}
            >
              <span className="text-[12px] font-bold tabular-nums">{day}</span>
              <span className={`text-[9px] font-semibold ${today ? "text-white/85" : "text-foreground/60"}`}>
                {weekday(day)}
              </span>
            </div>
          </th>
        );
      });
    }
    if (col.kind === "CODE_COUNTS") {
      return extraCodes.map((code) => {
        const legend = legendMap.get(code.toUpperCase());
        return (
          <th key={code} className={`${TH} min-w-[34px] px-0.5 text-center`} title={legend?.label_fr}>
            <span
              className="inline-flex h-5 min-w-[1.75rem] items-center justify-center rounded-md px-1.5 text-[11px] font-bold"
              style={softTone(legend?.color_bg) ?? { background: "var(--surface)" }}
            >
              {code}
            </span>
          </th>
        );
      });
    }
    const sticky = col.source === "LAST_NAME" ? `${STICKY} z-30` : "";
    const align = col.kind === "TOTAL" ? "min-w-[42px] px-1 text-center" : "px-3 text-left";
    return (
      <th
        className={`${TH} whitespace-nowrap uppercase tracking-[0.06em] ${align} ${sticky}`}
        title={col.label_ar ?? undefined}
      >
        {col.label_fr}
      </th>
    );
  }

  function renderDayCells(p: Person): ReactNode {
    return Array.from({ length: days }, (_, i) => {
      const day = i + 1;
      const key = cellKey(p.id, day);
      const cell = grid.get(key);
      const stored = cell?.legend_code ?? "";
      const value = drafts[key] ?? stored;
      const legend = value ? legendMap.get(value.toUpperCase()) : undefined;
      const proposed = isAutoProposed(cell) && value === stored;
      const origin = value === stored ? cellOriginLabel(cell) : "";
      const tone = proposed ? undefined : softTone(legend?.color_bg);
      const fallback = isWeekend(day) ? "bg-surface-muted/70" : "bg-transparent";
      const omMark = !proposed && value === stored && cell?.source_code === "OM";
      return (
        <td key={i} className={`${TD} border-r border-r-border/30 p-px`}>
          <input
            readOnly={!canEditDays}
            className={`h-6 w-full min-w-[26px] rounded border-0 px-0 text-center text-[10px] font-semibold uppercase outline-none transition focus:ring-2 focus:ring-brand ${
              proposed ? PROPOSED_CLS : tone ? "" : fallback
            } ${canEditDays ? "cursor-pointer hover:ring-1 hover:ring-brand/40" : "cursor-default"}`}
            style={
              omMark
                ? { ...tone, boxShadow: "inset 0 -2px 0 rgba(15, 23, 42, 0.4)" }
                : tone
            }
            value={value}
            title={
              legend
                ? `${legend.code} · ${legend.label_fr}${origin ? `\n${origin}` : ""}`
                : `${day} ${MONTHS[month - 1]}`
            }
            onClick={() => {
              if (!canEditDays) return;
              const snapshot = {
                employeeId: p.id,
                start: day,
                end: day,
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
              if (canEditDays) applyCellCode(p.id, day, e.target.value);
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
      <td className={`${TD} p-px`}>
        <input
          className={`h-6 w-full min-w-[120px] rounded border-0 px-2 text-[12px] outline-none transition placeholder:text-foreground/30 focus:ring-2 focus:ring-brand ${
            edited ? "bg-amber-50 dark:bg-amber-950/30" : "bg-transparent hover:bg-surface-muted/60"
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
    const td = `${TD} whitespace-nowrap px-3 text-[12px] text-foreground/90`;
    const editable = Boolean(access?.[col.code]?.edit);
    switch (col.kind) {
      case "DAYS":
        return renderDayCells(p);
      case "CODE_COUNTS":
        return extraCodes.map((code) => (
          <td key={code} className={`${TD} px-1 text-center text-[12px] font-medium tabular-nums text-foreground/85`}>
            {countCode(p.id, code) || ""}
          </td>
        ));
      case "TOTAL":
        return (
          <td className={`${TD} bg-surface-muted/50 px-1 text-center text-[12px] font-semibold tabular-nums`}>
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
            return (
              <td className={`${TD} px-2 text-center text-[11px] tabular-nums text-foreground/60`}>
                {index + 1}
              </td>
            );
          case "MATRICULE":
            return <td className={`${td} font-mono text-[11px] text-foreground/70`}>{p.matricule}</td>;
          case "LAST_NAME":
            return (
              <td
                className={`${td} ${STICKY} z-20 bg-surface font-semibold text-foreground shadow-[1px_0_0_var(--border)] group-hover:bg-[color-mix(in_oklab,var(--color-brand-muted)_45%,var(--surface))]`}
              >
                {p.last_name}
              </td>
            );
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
            return <td className={`${td} tabular-nums`}>{p.start_date}</td>;
          default:
            return <td className={td} />;
        }
    }
    return null;
  }

  const totalsLabelCode =
    tableColumns.find((c) => c.source === "LAST_NAME")?.code ?? tableColumns[0]?.code;

  function renderFooter(col: AttendanceColumn, labelHere: boolean): ReactNode {
    if (col.kind === "DAYS") {
      return Array.from({ length: days }, (_, i) => (
        <td key={i} className={`${TF} text-center`}>
          {dayTotaux(i + 1) || ""}
        </td>
      ));
    }
    if (col.kind === "CODE_COUNTS") {
      return extraCodes.map((code) => (
        <td key={code} className={`${TF} text-center`}>
          {codeTotals.get(code) || ""}
        </td>
      ));
    }
    if (col.kind === "TOTAL") {
      return (
        <td className={`${TF} text-center`}>
          {col.source === "NJ"
            ? days
            : col.source === "COEF"
              ? people.reduce((n, p) => n + coefSum(p.id), 0) || ""
              : ""}
        </td>
      );
    }
    const sticky = col.source === "LAST_NAME" ? `${STICKY} z-20 shadow-[1px_0_0_var(--border)]` : "";
    return (
      <td className={`${TF} px-3 uppercase tracking-[0.06em] ${sticky}`}>
        {labelHere ? "Total" : ""}
      </td>
    );
  }

  const siteName = sites.find((s) => s.id === siteId)?.name_fr ?? "";

  return (
    <div className="-mx-2 space-y-3 sm:-mx-4 print:mx-0">
      <div className="hidden print:block">
        <h2 className="text-lg font-semibold">
          Pointage · {MONTHS[month - 1]} {year} · {siteName}
        </h2>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-surface p-2 shadow-[var(--card-shadow)] print:hidden">
        <RhTabs
          uiKey="hr_attendance"
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

        <div className="flex items-center rounded-xl border border-border/80 bg-surface">
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-l-xl text-foreground/60 transition hover:bg-surface-muted hover:text-foreground disabled:opacity-40"
            onClick={() => shiftMonth(-1)}
            disabled={pending}
            aria-label="Mois précédent"
          >
            <Icon d={ICONS.left} />
          </button>
          <Popover
            align="start"
            title="Choisir le mois"
            buttonClass="inline-flex h-9 min-w-[9.5rem] items-center justify-center gap-2 border-x border-border/80 px-3 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
            trigger={
              <span className="inline-flex items-center gap-2" onClick={() => setPickerYear(year)}>
                <Icon d={ICONS.calendar} className="h-4 w-4 text-brand" />
                {MONTHS[month - 1]} {year}
              </span>
            }
          >
            {(close) => (
              <div className="w-64 p-1.5">
                <div className="mb-2 flex items-center justify-between">
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-foreground/60 hover:bg-surface-muted"
                    onClick={() => setPickerYear((y) => y - 1)}
                    aria-label="Année précédente"
                  >
                    <Icon d={ICONS.left} />
                  </button>
                  <span className="text-sm font-semibold tabular-nums">{pickerYear}</span>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-foreground/60 hover:bg-surface-muted"
                    onClick={() => setPickerYear((y) => y + 1)}
                    aria-label="Année suivante"
                  >
                    <Icon d={ICONS.right} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {MONTHS_SHORT.map((label, i) => {
                    const active = pickerYear === year && i + 1 === month;
                    const current = pickerYear === now.getFullYear() && i === now.getMonth();
                    return (
                      <button
                        key={label}
                        type="button"
                        className={`h-9 rounded-lg text-sm transition ${
                          active
                            ? "bg-brand font-semibold text-white"
                            : current
                              ? "font-semibold text-brand ring-1 ring-brand/40 hover:bg-brand-muted"
                              : "text-foreground/75 hover:bg-surface-muted"
                        }`}
                        onClick={() => {
                          if (goToMonth(pickerYear, i + 1)) close();
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </Popover>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-r-xl text-foreground/60 transition hover:bg-surface-muted hover:text-foreground disabled:opacity-40"
            onClick={() => shiftMonth(1)}
            disabled={pending}
            aria-label="Mois suivant"
          >
            <Icon d={ICONS.right} />
          </button>
        </div>

        {mode === "site" ? (
          <select
            className={`${SELECT_CLS} min-w-[220px]`}
            value={siteId}
            onChange={(e) => changeSite(e.target.value)}
            aria-label="Chantier"
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name_fr}
              </option>
            ))}
          </select>
        ) : (
          <div className="relative min-w-[280px] flex-1 sm:max-w-md">
            <Icon
              d={ICONS.search}
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40"
            />
            <input
              className={`${SELECT_CLS} w-full pl-9`}
              value={empQuery}
              placeholder="Matricule ou nom de l'employé"
              aria-label="Rechercher un employé"
              onChange={(e) => {
                setEmpQuery(e.target.value);
                setPickedEmployee(null);
              }}
            />
            {!pickedEmployee && empMatches.length > 0 ? (
              <div className="absolute z-40 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-border/70 bg-surface p-1.5 shadow-[0_18px_48px_-16px_rgba(15,23,42,0.35)]">
                {empMatches.map((p) => (
                  <button
                    type="button"
                    key={`${p.id}-${p.site_id}`}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-surface-muted"
                    onClick={() => pickEmployee(p)}
                  >
                    <span className="rounded-md bg-brand-muted px-1.5 py-0.5 font-mono text-[11px] text-brand">
                      {p.matricule}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {p.last_name} {p.first_name}
                      </span>
                      <span className="block truncate text-[11px] text-foreground/50">
                        {[p.site_name, p.poste].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {pendingCounts.proposed > 0 ? (
            <StatusChip tone="neutral">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
              {pendingCounts.proposed} proposé(s) OM
            </StatusChip>
          ) : null}
          {pendingCounts.edited > 0 ? (
            <StatusChip tone="warning">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {pendingCounts.edited} à valider
            </StatusChip>
          ) : null}
          {pendingCounts.imported > 0 ? (
            <Link href="/rh/presence/imports?vue=validation">
              <StatusChip tone="info">
                <Icon d={ICONS.inbox} className="h-3.5 w-3.5" />
                {pendingCounts.imported} importée(s)
              </StatusChip>
            </Link>
          ) : null}
          {readOnly ? <StatusChip tone="neutral">Lecture seule</StatusChip> : null}
          {access &&
          !readOnly &&
          !hasUnsaved &&
          pendingCounts.proposed + pendingCounts.edited + pendingCounts.imported === 0 &&
          people.length > 0 ? (
            <StatusChip tone="success">
              <Icon d={ICONS.check} className="h-3.5 w-3.5" />
              Tout est validé
            </StatusChip>
          ) : null}

          <label
            className={`${GHOST_BTN} cursor-pointer ${importDisabled ? "pointer-events-none opacity-50" : ""}`}
            title="Classeur Excel : Matricule + jours 1..31 (+ HS50 / HS75 / HS100)"
          >
            <Icon d={ICONS.upload} />
            Importer
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) importExcel(file);
              }}
            />
          </label>

          <Popover
            title="Légende des codes"
            buttonClass={`${GHOST_BTN} w-9 justify-center px-0`}
            trigger={<Icon d={ICONS.swatch} />}
          >
            {() => (
              <div className="max-h-80 w-72 overflow-auto p-1.5">
                <p className="px-1.5 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/45">
                  Légende
                </p>
                <div className="space-y-0.5">
                  {activeLegends.map((l) => (
                    <div key={l.id} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1">
                      <span
                        className="inline-flex h-6 min-w-[2.25rem] items-center justify-center rounded-md px-1.5 text-[11px] font-semibold"
                        style={softTone(l.color_bg) ?? undefined}
                      >
                        {l.code}
                      </span>
                      <span className="truncate text-sm text-foreground/75">{l.label_fr}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1">
                    <span
                      className={`inline-flex h-6 min-w-[2.25rem] items-center justify-center rounded-md px-1.5 text-[11px] font-semibold ${PROPOSED_CLS}`}
                    >
                      {totauxCode || "MS"}
                    </span>
                    <span className="text-sm text-foreground/75">Proposé par ordre de mission</span>
                  </div>
                </div>
              </div>
            )}
          </Popover>

          <Popover
            title="Plus d'actions"
            buttonClass={`${GHOST_BTN} w-9 justify-center px-0`}
            trigger={<Icon d={ICONS.more} />}
          >
            {(close) => (
              <div className="w-60">
                {siteId ? (
                  <a
                    className={MENU_ITEM}
                    href={`/api/rh/presence/modele?site=${siteId}&year=${year}&month=${month}`}
                    download
                    onClick={close}
                  >
                    <Icon d={ICONS.download} className="h-4 w-4 text-foreground/50" />
                    Modèle Excel
                  </a>
                ) : null}
                <button
                  type="button"
                  className={MENU_ITEM}
                  onClick={() => {
                    close();
                    window.print();
                  }}
                >
                  <Icon d={ICONS.print} className="h-4 w-4 text-foreground/50" />
                  Imprimer / archiver le mois
                </button>
                <button
                  type="button"
                  className={MENU_ITEM}
                  onClick={() => setShowExtra((v) => !v)}
                >
                  <Icon d={ICONS.columns} className="h-4 w-4 text-foreground/50" />
                  <span className="flex-1">Totaux par code</span>
                  <span
                    className={`relative h-5 w-9 rounded-full transition ${showExtra ? "bg-brand" : "bg-border"}`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                        showExtra ? "left-[1.125rem]" : "left-0.5"
                      }`}
                    />
                  </span>
                </button>
                <div className="my-1.5 h-px bg-border/70" />
                <Link className={MENU_ITEM} href="/rh/employes" onClick={close}>
                  <Icon d={ICONS.user} className="h-4 w-4 text-foreground/50" />
                  Fiche employé
                </Link>
                <Link className={MENU_ITEM} href="/rh/presence/imports" onClick={close}>
                  <Icon d={ICONS.inbox} className="h-4 w-4 text-foreground/50" />
                  Imports d&apos;archives
                </Link>
                <Link className={MENU_ITEM} href="/rh/parametres" onClick={close}>
                  <Icon d={ICONS.settings} className="h-4 w-4 text-foreground/50" />
                  Paramètres
                </Link>
              </div>
            )}
          </Popover>

          <Button
            className="h-9 gap-2 px-4"
            disabled={saveDisabled}
            onClick={save}
            title="Valider les valeurs renseignées"
          >
            <Icon d={ICONS.check} />
            Valider
            {hasUnsaved ? <span className="h-2 w-2 rounded-full bg-amber-300" /> : null}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="print:hidden">
          <RhAlert tone="danger">
            <div className="flex items-start gap-3">
              <span className="flex-1">{error}</span>
              <button
                type="button"
                className="shrink-0 rounded-md p-0.5 opacity-60 transition hover:opacity-100"
                onClick={() => setError(null)}
                aria-label="Fermer"
              >
                <Icon d={ICONS.close} />
              </button>
            </div>
          </RhAlert>
        </div>
      ) : null}

      {frozenMessage ? (
        <div className="print:hidden">
          <RhAlert tone="warning">{frozenMessage}</RhAlert>
        </div>
      ) : null}

      <div
        className={`relative max-h-[calc(100dvh-14rem)] overflow-auto rounded-2xl border border-border/70 bg-surface shadow-[var(--card-shadow)] transition-opacity print:max-h-none print:overflow-visible print:shadow-none ${
          pending && access ? "opacity-70" : ""
        }`}
      >
        <table className="min-w-max border-separate border-spacing-0 text-[12px]">
          <thead>
            <tr>
              {tableColumns.map((col) => (
                <Fragment key={col.code}>{renderHeader(col)}</Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {!access ? (
              <tr>
                <td className="px-4 py-16 text-center text-sm text-foreground/45" colSpan={Math.max(colCount, 1)}>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
                    Chargement…
                  </span>
                </td>
              </tr>
            ) : tableColumns.length === 0 ? (
              <tr>
                <td className="px-4 py-16 text-center text-sm text-foreground/45">
                  Aucune colonne autorisée pour votre rôle sur ce chantier.
                </td>
              </tr>
            ) : people.length === 0 ? (
              <tr>
                <td className="px-4 py-16 text-center text-sm text-foreground/45" colSpan={colCount}>
                  {mode === "employee"
                    ? "Recherchez un employé par matricule ou par nom."
                    : "Aucun contrat sur ce chantier pour ce mois."}
                </td>
              </tr>
            ) : (
              people.map((p, index) => (
                <tr
                  key={`${p.id}-${p.site_id}`}
                  className="group transition-colors hover:bg-[color-mix(in_oklab,var(--color-brand-muted)_45%,transparent)]"
                >
                  {tableColumns.map((col) => (
                    <Fragment key={col.code}>{renderCell(col, p, index)}</Fragment>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {access && people.length > 0 && tableColumns.length > 0 ? (
            <tfoot>
              <tr>
                {tableColumns.map((col) => (
                  <Fragment key={col.code}>
                    {renderFooter(col, col.code === totalsLabelCode)}
                  </Fragment>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
        {jobTitles.length ? (
          <datalist id="attendance-job-titles">
            {jobTitles.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        ) : null}
      </div>

      {info ? (
        <div className="pointer-events-none fixed bottom-5 right-5 z-50 print:hidden">
          <div className="pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl border border-emerald-200/70 bg-surface px-4 py-3 text-sm text-foreground shadow-[0_18px_48px_-16px_rgba(15,23,42,0.35)] dark:border-emerald-900/50">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Icon d={ICONS.check} className="h-3.5 w-3.5" />
            </span>
            <span className="flex-1 leading-relaxed">{info}</span>
            <button
              type="button"
              className="shrink-0 text-foreground/40 transition hover:text-foreground"
              onClick={() => setInfo(null)}
              aria-label="Fermer"
            >
              <Icon d={ICONS.close} />
            </button>
          </div>
        </div>
      ) : null}

      {monthCard && cardPerson ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setMonthCard(null);
          }}
          onMouseUp={() => setCardDrag(null)}
          onMouseLeave={() => setCardDrag(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md select-none rounded-3xl border border-border/60 bg-surface p-5 shadow-[0_24px_80px_-20px_rgba(15,23,42,0.45)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-display text-base font-semibold text-foreground">
                  {cardPerson.last_name} {cardPerson.first_name}
                </h3>
                <p className="text-sm text-foreground/50">
                  {MONTHS[month - 1]} {year}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-foreground/50 transition hover:bg-surface-muted hover:text-foreground"
                onClick={() => setMonthCard(null)}
                aria-label="Fermer"
              >
                <Icon d={ICONS.close} />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {activeLegends.map((l) => {
                const active = monthCard.code === l.code;
                return (
                  <button
                    key={l.code}
                    type="button"
                    title={l.label_fr}
                    className={`h-8 min-w-[2.75rem] rounded-lg px-2 text-xs font-semibold transition ${
                      active ? "ring-2 ring-brand ring-offset-2 ring-offset-surface" : "opacity-80 hover:opacity-100"
                    }`}
                    style={softTone(l.color_bg) ?? { background: "var(--surface-muted)" }}
                    onClick={() => setMonthCard({ ...monthCard, code: l.code })}
                  >
                    {l.code}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-foreground/50">
              {legendMap.get(monthCard.code.toUpperCase())?.label_fr ?? ""}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-surface-muted p-1">
              {(["start", "end"] as const).map((pick) => (
                <button
                  key={pick}
                  type="button"
                  className={`flex h-9 items-center justify-center gap-2 rounded-lg text-sm transition ${
                    monthCard.pick === pick
                      ? "bg-surface font-semibold text-foreground shadow-sm"
                      : "text-foreground/55 hover:text-foreground"
                  }`}
                  onClick={() => setMonthCard({ ...monthCard, pick })}
                >
                  {pick === "start" ? "Du" : "Au"}
                  <span className="tabular-nums text-brand">
                    {pick === "start" ? monthCard.start : monthCard.end}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-7 gap-1 text-center">
              {WEEK.map((w) => (
                <span key={w} className="py-1 text-[10px] font-medium uppercase text-foreground/40">
                  {w}
                </span>
              ))}
              {Array.from({ length: dayOfWeek(1) }, (_, i) => (
                <span key={`pad-${i}`} />
              ))}
              {Array.from({ length: days }, (_, i) => {
                const day = i + 1;
                const from = Math.min(monthCard.start, monthCard.end);
                const to = Math.max(monthCard.start, monthCard.end);
                const inRange = day >= from && day <= to;
                const isEdge = day === monthCard.start || day === monthCard.end;
                return (
                  <button
                    key={day}
                    type="button"
                    className={`h-9 rounded-lg text-[13px] tabular-nums transition ${
                      isEdge
                        ? "bg-brand font-semibold text-white"
                        : inRange
                          ? "bg-brand-muted font-medium text-brand"
                          : isWeekend(day)
                            ? "text-foreground/40 hover:bg-surface-muted"
                            : "text-foreground/80 hover:bg-surface-muted"
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
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex items-center gap-2">
              <button
                type="button"
                className="mr-auto rounded-xl px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                onClick={() => {
                  paintRange(monthCard.employeeId, monthCard.start, monthCard.end, "");
                  setMonthCard(null);
                  setInfo("Période effacée.");
                }}
              >
                Effacer
              </button>
              <Button variant="ghost" className="h-9" onClick={() => setMonthCard(null)}>
                Annuler
              </Button>
              <Button
                className="h-9"
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
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
