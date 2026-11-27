"use client";

import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import { saveAttendanceMonth, type AttendanceCell, type AttendanceLine } from "@/lib/actions/hr-ops";
import { useScreenFilter } from "@/components/rh/screen-filter-bar";
import type { FilterRow } from "@/lib/hr/screen-filter";
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
  pointageColumns,
  POSTE_EFFECTIF,
  visibleColumns,
  withSonatrachColumn,
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
import {
  pointageNet,
  pointageNetFormula,
  pointageNetFormulaAr,
  pointageNetRuleMap,
  unknownPointageCodes,
  type PointageNet,
  type PointageNetRule,
} from "@/lib/hr/pointage-net";
import { attendanceSnapshot } from "@/lib/hr/dashboard-stats";
import { AttendanceKpis } from "@/components/rh/rh-kpis";
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

type NetRate = { net_ref: number; net_recup: number | null };

const NET_MONEY = new Intl.NumberFormat("fr-DZ", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function netMoney(amount: number) {
  return NET_MONEY.format(amount);
}

function netTitle(result: PointageNet, formula: string) {
  const lines = [
    formula,
    `P/MS ${netMoney(result.dailyPms)} × ${result.paidDays} j · CRP ${netMoney(result.dailyCrp)} × ${result.crpDays} j · Sonatrach ${netMoney(result.sanction)} × ${result.anDays} j`,
  ];
  if (result.unknown.length) {
    lines.push(`Hors formule : ${result.unknown.join(", ")} · خارج المعادلة`);
  }
  if (result.amount == null) lines.push("Salaire net mensuel manquant · الراتب الشهري غير موجود");
  return lines.join("\n");
}

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

function describePerson(person: Person): FilterRow {
  const facets: FilterRow["facets"] = [];
  if (person.site_name) facets.push({ field: "chantier", value: person.site_name, label: `Chantier : ${person.site_name}` });
  if (person.poste) facets.push({ field: "poste", value: person.poste, label: `Poste : ${person.poste}` });
  return {
    text: [person.matricule, person.last_name, person.first_name, person.poste, person.site_name].filter(Boolean).join(" "),
    matricule: person.matricule,
    facets,
  };
}

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

/** Stored validation is free text; these marks count as approved. */
function isSheetValidated(value: string) {
  return ["OK", "OUI", "YES", "1", "TRUE", "X"].includes(value.trim().toUpperCase());
}

/** Short, quiet labels. The stored label stays on the tooltip. */
function sheetHeader(col: { code: string; label_fr: string }) {
  switch (col.code) {
    case "MAT":
      return "Mat.";
    case "NOM":
      return "Nom";
    case "PRENOM":
      return "Prénom";
    case "POSTE_EFFECTIF":
      return "Poste";
    case "AFFECTATION":
      return "Affectation";
    case "COMMENTAIRE":
      return "Commentaire";
    case "SANCTION_SONATRACH":
      return "Sanction Sonatrach";
    case "NET_A_PAYER":
      return "Net à payer";
    case "VALIDATION":
      return "Validation";
    default:
      return col.label_fr;
  }
}
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

/** Nearby catalogue colours share one group; pale greys stay together at the end. */
function legendColorKey(color: string | null): number {
  const match = color?.trim().match(/^#([0-9a-f]{6})$/i);
  if (!match) return 1000;
  const n = Number.parseInt(match[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta < 0.12) return 1000;
  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  if (hue < 20 || hue >= 345) return 0;
  if (hue < 75) return 50;
  if (hue < 175) return 140;
  if (hue < 220) return 200;
  if (hue < 255) return 240;
  return 280;
}

function legendColorGroups<T extends { code: string; color_bg: string | null }>(items: T[]) {
  const groups = new Map<number, T[]>();
  for (const item of items) {
    const key = legendColorKey(item.color_bg);
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([key, list]) => ({
      key,
      color: list.find((item) => item.color_bg)?.color_bg ?? "var(--border)",
      items: list.slice().sort((a, b) => a.code.localeCompare(b.code)),
    }));
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

function linePersonId(employeeId: string, linePoste: string) {
  return linePoste ? `${employeeId}#${encodeURIComponent(linePoste)}` : employeeId;
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
  const sheetRef = useRef<HTMLTableElement>(null);
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
  const [lines, setLines] = useState<AttendanceLine[]>([]);
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
  const [rates, setRates] = useState<Record<string, NetRate>>({});
  const [netRules, setNetRules] = useState<PointageNetRule[] | null>(null);
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const shownColumns = useMemo(() => {
    if (!access) return [];
    const sheet = withSonatrachColumn(columns, access);
    return pointageColumns(visibleColumns(sheet.columns, sheet.access));
  }, [columns, access]);
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

  const allPeople = useMemo(() => {
    const base = buildPeople(contracts, year, month);
    const seen = new Set(base.map((person) => person.id));
    const extras: Person[] = [];
    for (const line of lines) {
      if (!line.line_poste || line.site_id !== siteId) continue;
      const id = linePersonId(line.employee_id, line.line_poste);
      if (seen.has(id)) continue;
      seen.add(id);
      const host = base.find((person) => person.id === line.employee_id);
      const siteName = sites.find((site) => site.id === line.site_id)?.name_fr ?? host?.site_name ?? "";
      const sameSite = !host || host.site_id === line.site_id;
      const posted = sameSite ? line.line_poste : line.line_poste.split(" · ").slice(1).join(" · ") || host?.poste || "";
      extras.push({
        id,
        last_name: (host?.last_name || line.last_name || "").toUpperCase(),
        first_name: host?.first_name || line.first_name,
        matricule: host?.matricule || line.matricule,
        poste: posted,
        affectation: sameSite
          ? host?.affectation || siteName
          : [siteName, host?.start_date ? `CONTRAT ${host.start_date}` : ""].filter(Boolean).join(" · "),
        start_date: host?.start_date || "",
        site_id: line.site_id,
        site_name: siteName,
      });
    }
    return [...base, ...extras];
  }, [contracts, year, month, lines, siteId, sites]);

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
    if (mode === "employee") return pickedEmployee ? [pickedEmployee] : [];
    return allPeople.filter((p) => p.site_id === siteId);
  }, [mode, pickedEmployee, allPeople, siteId]);
  const presenceFilter = useScreenFilter({
    screen: "rh.presence",
    rows: mode === "site" ? people : [],
    describe: describePerson,
  });
  const shownPeople = mode === "site" ? presenceFilter.rows : people;

  const grid = useMemo(() => {
    const m = new Map<string, AttendanceCell>();
    for (const c of cells) m.set(`${c.employee_id}|${c.work_date}`, c);
    return m;
  }, [cells]);

  const lineKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const line of lines) {
      keys.add(`${linePersonId(line.employee_id, line.line_poste)}|${line.work_date}`);
    }
    return keys;
  }, [lines]);

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
    const openFrom = allPeople.find((person) => person.id === employeeId)?.start_date.slice(0, 10) ?? "";
    const normalized = code.trim().toUpperCase();
    const dates = Array.from({ length: to - from + 1 }, (_, i) => iso(from + i)).filter(
      (date) => !openFrom || date >= openFrom,
    );
    if (dates.length === 0) return;
    setCells((prev) =>
      paintAttendanceCells(prev, { employeeId, siteId, dates, code: normalized }),
    );
    setDirty(true);
    setDrafts((prev) => {
      const copy = { ...prev };
      for (let d = from; d <= to; d += 1) {
        if (openFrom && iso(d) < openFrom) continue;
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
      setLines(r.data.lines);
      setLoadedAt(r.data.loaded_at);
      setPeriodStatus(r.data.period_status);
      setAccess(r.data.access);
      applySheetRows(r.data.rows);
      setRates(r.data.rates);
      setNetRules(r.data.rules);
      setDirty(false);
      const nextDrafts: Record<string, string> = {};
      for (const cell of r.data.cells) {
        nextDrafts[`${cell.employee_id}|${cell.work_date}`] = cell.legend_code;
      }
      for (const line of r.data.lines) {
        nextDrafts[`${linePersonId(line.employee_id, line.line_poste)}|${line.work_date}`] = line.legend_code;
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

  function monthCodes(employeeId: string) {
    const openFrom = allPeople.find((person) => person.id === employeeId)?.start_date.slice(0, 10) ?? "";
    const codes: string[] = [];
    for (let d = 1; d <= days; d += 1) {
      const date = iso(d);
      if (openFrom.length === 10 && date < openFrom) continue;
      const key = cellKey(employeeId, d);
      const code = (drafts[key] ?? grid.get(key)?.legend_code ?? "").trim().toUpperCase();
      if (code && code !== "0") codes.push(code);
    }
    return codes;
  }

  function netFor(employeeId: string): PointageNet {
    const rate = rates[employeeId.split("#")[0]];
    return pointageNet({
      codes: monthCodes(employeeId),
      calendarDays: days,
      netRefMonthly: rate ? rate.net_ref : null,
      netRecupMonthly: rate ? rate.net_recup : null,
      rules: netRules,
    });
  }

  function workerMonthStats(employeeId: string, startDate: string) {
    const openFrom = startDate.slice(0, 10);
    const counts = new Map<string, number>();
    let empty = 0;
    let before = 0;
    for (let d = 1; d <= days; d += 1) {
      const date = iso(d);
      if (openFrom.length === 10 && date < openFrom) {
        before += 1;
        continue;
      }
      const code = (drafts[cellKey(employeeId, d)] ?? grid.get(cellKey(employeeId, d))?.legend_code ?? "")
        .trim()
        .toUpperCase();
      if (!code || code === "0") {
        empty += 1;
        continue;
      }
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    const coded = [...counts.values()].reduce((sum, n) => sum + n, 0);
    return {
      counts: [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      empty,
      before,
      sum: coded + empty + before,
    };
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
    return shownPeople.filter((p) => {
      const start = p.start_date.slice(0, 10);
      if (start.length === 10 && date < start) return false;
      return grid.get(`${p.id}|${date}`)?.legend_code === totauxCode;
    }).length;
  }

  const visibleIds = new Set(shownPeople.map((p) => p.id));
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
  const showMonthStats = tableColumns.some((c) => c.code === "NJ");
  const colCount =
    tableColumns.reduce(
      (n, c) => n + (c.kind === "DAYS" ? days : c.kind === "CODE_COUNTS" ? extraCodes.length : 1),
      0,
    ) + (showMonthStats ? 1 : 0);

  const daysAt = tableColumns.findIndex((c) => c.kind === "DAYS");
  const edgeCode = daysAt > 0 ? tableColumns[daysAt - 1]?.code : undefined;
  const TH = "px-3.5 py-2 text-left whitespace-nowrap";
  const TD = "px-3.5 py-2.5";
  const TF = "px-1 py-2.5 text-center text-[12px] tabular-nums";
  const TAIL = new Set(["NJ", "COMMENTAIRE", "SANCTION_SONATRACH", "NET_A_PAYER", "VALIDATION"]);
  const PINNED = ["ROW_NO", "MATRICULE", "LAST_NAME", "FIRST_NAME", POSTE_EFFECTIF];
  const pinnedSources = tableColumns
    .map((col) => col.source)
    .filter((source): source is string => Boolean(source && PINNED.includes(source)));

  function pinIndex(col: AttendanceColumn) {
    return col.source ? pinnedSources.indexOf(col.source) : -1;
  }

  useLayoutEffect(() => {
    const table = sheetRef.current;
    if (!table) return;
    const measure = () => {
      const gap = Number.parseFloat(getComputedStyle(table).borderSpacing) || 0;
      const heads = [...table.querySelectorAll<HTMLElement>("thead [data-pin]")].sort(
        (a, b) => Number(a.dataset.pin) - Number(b.dataset.pin),
      );
      let left = 0;
      for (const el of heads) {
        table.style.setProperty(`--pin-${el.dataset.pin}`, `${left}px`);
        left += el.getBoundingClientRect().width + gap;
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(table);
    return () => observer.disconnect();
  }, [pinnedSources.join("|"), shownPeople.length]);

  function dayMarks(day: number) {
    return {
      "data-weekend": isWeekend(day) ? "" : undefined,
      "data-today": day === todayDay ? "" : undefined,
      "data-week-start": dayOfWeek(day) === 0 ? "" : undefined,
    };
  }

  function columnMarks(col: AttendanceColumn) {
    const pin = pinIndex(col);
    return {
      "data-edge": col.code === edgeCode ? "" : undefined,
      "data-summary": col.kind === "TOTAL" ? "" : undefined,
      "data-identity": col.kind === "IDENTITY" ? "" : undefined,
      "data-tail": TAIL.has(col.code) ? "" : undefined,
      "data-tail-start": col.code === "NJ" ? "" : undefined,
      "data-pin": pin >= 0 ? String(pin) : undefined,
      "data-pin-end": pin >= 0 && pin === pinnedSources.length - 1 ? "" : undefined,
      "data-total-end": footerMerge.at(-1)?.code === col.code ? "" : undefined,
    };
  }

  function renderSanction(col: AttendanceColumn, p: Person) {
    const result = netFor(p.id);
    const text =
      result.penalty == null ? (result.anDays > 0 ? "—" : "") : result.penalty > 0 ? netMoney(result.penalty) : "";
    return (
      <td
        {...columnMarks(col)}
        className={`${TD} min-w-[7rem] px-2 text-right text-[13px] font-semibold tabular-nums`}
        title={
          result.penalty == null
            ? "Salaire net mensuel manquant · الراتب الشهري غير موجود"
            : `AN × ${netMoney(result.sanction)} × ${result.anDays} j · عقوبة سوناطراك`
        }
      >
        {text}
      </td>
    );
  }

  function renderNet(col: AttendanceColumn, p: Person) {
    const result = netFor(p.id);
    return (
      <td
        {...columnMarks(col)}
        className={`${TD} min-w-[7.5rem] px-2 text-right text-[13px] font-semibold tabular-nums`}
        title={netTitle(result, pointageNetFormula(netRules))}
      >
        {result.amount == null ? "—" : netMoney(result.amount)}
      </td>
    );
  }

  function renderMonthStats(p: Person) {
    const stats = workerMonthStats(p.id, p.start_date);
    const balanced = stats.sum === days;
    return (
      <td data-tail="" className="attendance-stats-cell">
        <div className="attendance-stats-line">
          {stats.counts.map(([code, n]) => {
            const legend = legendMap.get(code);
            return (
              <span key={code} className="attendance-stat" title={legend?.label_fr ?? code}>
                <span className="attendance-legend-code" style={softTone(legend?.color_bg) ?? undefined}>
                  {code}
                </span>
                <b>{n}</b>
              </span>
            );
          })}
          {stats.empty > 0 ? (
            <span className="attendance-stat" title="Jours sans code">
              <span className="attendance-legend-code">Vide</span>
              <b>{stats.empty}</b>
            </span>
          ) : null}
          {stats.before > 0 ? (
            <span className="attendance-stat" title="Jours avant le début du contrat">
              <span className="attendance-legend-code">Hors contrat</span>
              <b>{stats.before}</b>
            </span>
          ) : null}
          <span className={`attendance-stat-total${balanced ? " is-ok" : ""}`}>
            {stats.sum}/{days}
          </span>
        </div>
      </td>
    );
  }

  function renderHeader(col: AttendanceColumn): ReactNode {
    if (col.kind === "DAYS") {
      return Array.from({ length: days }, (_, i) => {
        const day = i + 1;
        return (
          <th key={day} {...dayMarks(day)} className="attendance-day-head w-[40px] min-w-[40px] max-w-[40px] px-0 text-center">
            <div className="flex flex-col items-center leading-none">
              <span className="attendance-day-num">{day}</span>
              <span className="attendance-weekday">{weekday(day)}</span>
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
    const align = col.kind === "TOTAL" || col.code === "VALIDATION" ? "min-w-12 px-2 text-center" : TH;
    return (
      <th
        {...columnMarks(col)}
        className={align}
        title={
          col.code === "SANCTION_SONATRACH"
            ? `${[...pointageNetRuleMap(netRules).entries()].flatMap(([code, effect]) => (effect === "SANCTION" ? [code] : [])).join(" + ") || "—"} × salaire journalier P/MS\nعقوبة سوناطراك = أيام الرموز المصنّفة عقوبة × أجر يوم الحضور`
            : col.code === "NET_A_PAYER"
            ? `${pointageNetFormula(netRules)}\n${pointageNetFormulaAr(netRules)}`
            : col.label_ar
              ? `${col.label_fr} · ${col.label_ar}`
              : col.label_fr
        }
      >
        {sheetHeader(col)}
      </th>
    );
  }

  function renderDayCells(p: Person): ReactNode {
    const openFrom = p.start_date.slice(0, 10);
    return Array.from({ length: days }, (_, i) => {
      const day = i + 1;
      const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const key = cellKey(p.id, day);
      const beforeContract = openFrom.length === 10 && iso < openFrom;
      const lockedDay = beforeContract || lineKeys.has(key);
      const cell = grid.get(key);
      const stored = cell?.legend_code ?? "";
      const value = beforeContract ? "0" : (drafts[key] ?? stored);
      const legend = value ? legendMap.get(value.toUpperCase()) : undefined;
      const proposed = isAutoProposed(cell) && value === stored;
      const origin = value === stored ? cellOriginLabel(cell) : "";
      const tone = proposed ? undefined : softTone(legend?.color_bg);
      const omMark = !proposed && value === stored && cell?.source_code === "OM";
      return (
        <td key={day} {...dayMarks(day)} className="attendance-day w-[40px] min-w-[40px] max-w-[40px] p-0 text-center">
          <input
            readOnly={!canEditDays || lockedDay}
            className={`attendance-day-input outline-none ${proposed ? PROPOSED_CLS : ""} ${
              canEditDays && !lockedDay ? "cursor-pointer" : "cursor-default"
            }`}
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
              if (!canEditDays || lockedDay) return;
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
              if (!canEditDays || lockedDay) return;
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
              if (canEditDays && !lockedDay) applyCellCode(p.id, day, e.target.value);
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

  function renderValidation(col: AttendanceColumn, p: Person) {
    const editable = Boolean(access?.[col.code]?.edit);
    const on = isSheetValidated(rowValue(p.id, col.code));
    return (
      <td {...columnMarks(col)} className={`${TD} text-center`}>
        <button
          type="button"
          role="checkbox"
          aria-checked={on}
          aria-label={`Valider ${p.last_name} ${p.first_name}`}
          disabled={!editable}
          className={`attendance-check${on ? " is-on" : ""}`}
          onClick={() => editRowValue(p.id, col.code, on ? "" : "OK")}
        >
          <Icon d={ICONS.check} className="h-3 w-3" />
        </button>
      </td>
    );
  }

  function renderValueInput(col: AttendanceColumn, p: Person, placeholder?: string) {
    const edited = rowDrafts[p.id]?.[col.code] !== undefined;
    return (
      <td {...columnMarks(col)} className={`${TD} p-0.5`}>
        <input
          className={`attendance-value-input h-8 w-full rounded-lg border-0 px-2.5 text-[13px] outline-none transition ${
            col.catalog_kind === "job_title" ? "min-w-[12.5rem] placeholder:text-foreground" : "min-w-[9rem] placeholder:text-foreground/35"
          } ${edited ? "bg-amber-50 dark:bg-amber-950/30" : "bg-transparent"}`}
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
    const td = `${TD} whitespace-nowrap text-[13px] text-foreground`;
    const marks = columnMarks(col);
    const editable = Boolean(access?.[col.code]?.edit);
    switch (col.kind) {
      case "DAYS":
        return renderDayCells(p);
      case "CODE_COUNTS":
        return extraCodes.map((code) => (
          <td key={code} className={`${TD} px-1 text-center text-[12px] font-medium tabular-nums text-foreground/80`}>
            {countCode(p.id, code) || ""}
          </td>
        ));
      case "TOTAL":
        return (
          <td {...marks} className={`${TD} min-w-12 px-2 text-center text-[12px] font-semibold tabular-nums`}>
            {col.source === "NJ" ? days : col.source === "COEF" ? coefSum(p.id) || "" : ""}
          </td>
        );
      case "INPUT":
        if (col.code === "SANCTION_SONATRACH") return renderSanction(col, p);
        if (col.code === "NET_A_PAYER") return renderNet(col, p);
        if (col.code === "VALIDATION") return renderValidation(col, p);
        return editable ? (
          renderValueInput(col, p)
        ) : (
          <td {...marks} className={td}>
            {rowValue(p.id, col.code)}
          </td>
        );
      case "IDENTITY":
        switch (col.source) {
          case "ROW_NO":
            return (
              <td {...marks} className={`${TD} px-2 text-center text-[12px] font-semibold tabular-nums text-foreground/70`}>
                {index + 1}
              </td>
            );
          case "MATRICULE":
            return (
              <td {...marks} className={`${td} font-mono text-[12px] font-semibold text-foreground`}>
                {p.matricule}
              </td>
            );
          case "LAST_NAME":
            return (
              <td {...marks} className={`${td} attendance-name text-[14px] font-bold text-foreground`}>
                {p.last_name}
              </td>
            );
          case "FIRST_NAME":
            return (
              <td {...marks} className={`${td} font-semibold`}>
                {p.first_name}
              </td>
            );
          case POSTE_EFFECTIF:
            return editable ? (
              renderValueInput(col, p, carriedPoste[p.id] || p.poste)
            ) : (
              <td {...marks} className={`${td} text-[13px] text-foreground`} title={posteFor(p)}>
                {posteFor(p)}
              </td>
            );
          case "AFFECTATION":
            return (
              <td {...marks} className={`${td} text-[13px] text-foreground`} title={p.affectation}>
                {p.affectation}
              </td>
            );
          case "CONTRACT_START":
            return (
              <td {...marks} className={`${td} tabular-nums text-foreground`}>
                {p.start_date}
              </td>
            );
          default:
            return (
              <td {...marks} className={td} />
            );
        }
    }
    return null;
  }

  const FOOTER_MERGE_SOURCES = new Set([
    "ROW_NO",
    "MATRICULE",
    "LAST_NAME",
    "FIRST_NAME",
    POSTE_EFFECTIF,
    "AFFECTATION",
  ]);
  const footerMerge: AttendanceColumn[] = [];
  for (const col of tableColumns) {
    if (col.source && FOOTER_MERGE_SOURCES.has(col.source)) footerMerge.push(col);
    else if (footerMerge.length) break;
  }
  const footerMergeCodes = new Set(footerMerge.map((col) => col.code));

  useLayoutEffect(() => {
    const table = sheetRef.current;
    const scroller = table?.closest<HTMLElement>(".attendance-scroll");
    if (!table || !scroller) return;
    const clip = () => {
      const total = table.querySelector<HTMLElement>(".attendance-total-merge");
      const pin0 = table.querySelector<HTMLElement>('thead [data-pin="0"]');
      const pinEnd = table.querySelector<HTMLElement>("thead [data-pin-end]");
      const end = table.querySelector<HTMLElement>("thead [data-total-end]");
      if (!total || !pin0 || !pinEnd || !end) {
        total?.style.removeProperty("clip-path");
        return;
      }
      const frozen = pinEnd.getBoundingClientRect().right - pin0.getBoundingClientRect().left;
      const span = total.offsetWidth;
      const natural = end.getBoundingClientRect().right - pin0.getBoundingClientRect().left;
      const visible = Math.max(frozen, Math.min(span, natural));
      const clipRight = Math.max(0, span - visible);
      total.style.clipPath = clipRight > 0.5 ? `inset(0 ${clipRight}px 0 0)` : "none";
    };
    clip();
    scroller.addEventListener("scroll", clip, { passive: true });
    const observer = new ResizeObserver(clip);
    observer.observe(table);
    return () => {
      scroller.removeEventListener("scroll", clip);
      observer.disconnect();
    };
  }, [footerMerge.length, shownPeople.length, days]);

  const totalsLabelCode =
    tableColumns.find((c) => c.source === "LAST_NAME")?.code ?? tableColumns[0]?.code;

  function renderFooter(col: AttendanceColumn, labelHere: boolean): ReactNode {
    if (col.kind === "DAYS") {
      return Array.from({ length: days }, (_, i) => {
        const day = i + 1;
        return (
          <td key={day} {...dayMarks(day)} className={TF}>
            {dayTotaux(day) || ""}
          </td>
        );
      });
    }
    if (col.kind === "CODE_COUNTS") {
      return extraCodes.map((code) => (
        <td key={code} className={TF}>
          {codeTotals.get(code) || ""}
        </td>
      ));
    }
    if (col.kind === "TOTAL") {
      return (
        <td {...columnMarks(col)} className={`${TF} min-w-12`}>
          {col.source === "NJ"
            ? days
            : col.source === "COEF"
              ? shownPeople.reduce((n, p) => n + coefSum(p.id), 0) || ""
              : ""}
        </td>
      );
    }
    if (col.code === "SANCTION_SONATRACH") {
      const amounts = shownPeople.map((p) => netFor(p.id).penalty);
      const known = amounts.filter((amount): amount is number => amount != null && amount > 0);
      const total = Math.round((known.reduce((sum, amount) => sum + amount, 0) + Number.EPSILON) * 100) / 100;
      return (
        <td {...columnMarks(col)} className={`${TF} px-2 text-right font-bold`}>
          {known.length ? netMoney(total) : ""}
        </td>
      );
    }
    if (col.code === "NET_A_PAYER") {
      const amounts = shownPeople.map((p) => netFor(p.id).amount);
      const known = amounts.filter((amount): amount is number => amount != null);
      const total = Math.round((known.reduce((sum, amount) => sum + amount, 0) + Number.EPSILON) * 100) / 100;
      return (
        <td {...columnMarks(col)} className={`${TF} px-2 text-right font-bold`}>
          {known.length ? netMoney(total) : ""}
        </td>
      );
    }
    if (col.code === "VALIDATION") {
      const approved = shownPeople.filter((p) => isSheetValidated(rowValue(p.id, col.code))).length;
      return (
        <td {...columnMarks(col)} className={TF}>
          {approved || ""}
        </td>
      );
    }
    return (
      <td {...columnMarks(col)} className={`${TF} px-3 text-left text-[13px] font-bold text-foreground`}>
        {labelHere ? "Total" : ""}
      </td>
    );
  }

  const workshopSnapshot = useMemo(() => {
    const prefix = `${year}-${String(month).padStart(2, "0")}-`;
    const marks: { employee_id: string; work_date: string; legend_code: string }[] = [];
    for (const [key, raw] of Object.entries(drafts)) {
      const split = key.lastIndexOf("|");
      if (split < 0) continue;
      const workDate = key.slice(split + 1);
      if (!workDate.startsWith(prefix)) continue;
      const code = raw.trim().toUpperCase();
      if (!code || code === "0") continue;
      marks.push({
        employee_id: key.slice(0, split).split("#")[0],
        work_date: workDate,
        legend_code: code,
      });
    }
    return attendanceSnapshot(
      marks,
      legends.map((legend) => ({
        code: legend.code,
        label_fr: legend.label_fr,
        counts_as_presence: legend.counts_as_presence,
      })),
    );
  }, [drafts, legends, month, year]);

  const siteName = sites.find((s) => s.id === siteId)?.name_fr ?? "";
  const formulaUnknown = access?.NET_A_PAYER?.view
    ? unknownPointageCodes(
        shownPeople.flatMap((p) => monthCodes(p.id)),
        netRules,
      )
    : [];

  return (
    <div className="-mx-2 space-y-3 sm:-mx-4 print:mx-0">
      <div className="print:hidden">
        <AttendanceKpis
          snapshot={workshopSnapshot}
          emptyLabel={loadedAt ? "Aucun pointage sur ce mois" : "Chargement du mois…"}
        />
      </div>
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
                <Link className={MENU_ITEM} href="/parametres/rh/listes" onClick={close}>
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

      {formulaUnknown.length ? (
        <div className="print:hidden">
          <RhAlert tone="warning">
            <>
              {`Codes hors formule du net : ${formulaUnknown.join(", ")}. Ils ne changent pas le montant. `}
              <Link href="/parametres/rh/presence" className="underline">
                Classez-les dans Feuille de présence
              </Link>
              {" · رموز خارج المعادلة لا تدخل في المبلغ. صنّفها من الإعدادات ← ورقة الحضور."}
            </>
          </RhAlert>
        </div>
      ) : null}

      {mode === "site" ? <div className="print:hidden">{presenceFilter.bar}</div> : null}

      <div
        className={`attendance-scroll relative max-h-[calc(100dvh-14rem)] overflow-auto rounded-2xl border border-border/70 bg-surface shadow-[var(--card-shadow)] transition-opacity print:max-h-none print:overflow-visible print:shadow-none ${
          pending && access ? "opacity-70" : ""
        }`}
      >
        <table ref={sheetRef} className="attendance-sheet min-w-max text-[13px]">
          <thead>
            <tr>
              {tableColumns.map((col) => (
                <Fragment key={col.code}>
                  {renderHeader(col)}
                  {col.code === "NJ" ? (
                    <th data-tail="" className={`${TH} text-left`} title="Répartition des codes · المجموع يساوي أيام الشهر">
                      Codes
                    </th>
                  ) : null}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {!access ? (
              <tr>
                <td className="p-0" colSpan={Math.max(colCount, 1)}>
                  <div className="attendance-empty text-sm text-foreground/45">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
                      Chargement…
                    </span>
                  </div>
                </td>
              </tr>
            ) : tableColumns.length === 0 ? (
              <tr>
                <td className="p-0">
                  <div className="attendance-empty text-sm text-foreground/45">
                    Aucune colonne autorisée pour votre rôle sur ce chantier.
                  </div>
                </td>
              </tr>
            ) : shownPeople.length === 0 ? (
              <tr>
                <td className="p-0" colSpan={colCount}>
                  <div className="attendance-empty text-sm text-foreground/45">
                    {mode === "employee"
                      ? "Recherchez un employé par matricule ou par nom."
                      : presenceFilter.emptyHint ?? "Aucun contrat sur ce chantier pour ce mois."}
                  </div>
                </td>
              </tr>
            ) : (
              shownPeople.map((p, index) => (
                <tr key={`${p.id}-${p.site_id}`}>
                  {tableColumns.map((col) => (
                    <Fragment key={col.code}>
                      {renderCell(col, p, index)}
                      {col.code === "NJ" ? renderMonthStats(p) : null}
                    </Fragment>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {access && shownPeople.length > 0 && tableColumns.length > 0 ? (
            <tfoot>
              <tr>
                {(() => {
                  let merged = false;
                  return tableColumns.map((col) => {
                    if (footerMergeCodes.has(col.code)) {
                      if (merged) return null;
                      merged = true;
                      return (
                        <td key="total" colSpan={footerMerge.length} className="attendance-total-merge">
                          Total
                        </td>
                      );
                    }
                    return (
                      <Fragment key={col.code}>
                        {renderFooter(col, footerMerge.length === 0 && col.code === totalsLabelCode)}
                        {col.code === "NJ" ? <td data-tail="" /> : null}
                      </Fragment>
                    );
                  });
                })()}
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

      {activeLegends.length > 0 ? (
        <section className="attendance-legend print:break-inside-avoid" aria-label="Légende des codes">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3>Légende des codes</h3>
            <span>{activeLegends.length}</span>
          </div>
          <div className="attendance-legend-groups">
            {legendColorGroups(activeLegends).map((group) => (
              <div key={group.key} className="attendance-legend-group">
                <span className="attendance-legend-swatch" style={{ background: group.color }} />
                <ul>
                  {group.items.map((legend) => (
                    <li key={legend.id} title={legend.label_ar ?? legend.label_fr}>
                      <span className="attendance-legend-code" style={softTone(legend.color_bg) ?? undefined}>
                        {legend.code}
                      </span>
                      <span className="attendance-legend-label">{legend.label_fr}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

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
