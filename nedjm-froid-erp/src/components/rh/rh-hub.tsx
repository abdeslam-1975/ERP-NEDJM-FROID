"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Activity,
  Banknote,
  BellRing,
  CalendarClock,
  CalendarPlus,
  ChartPie,
  ChevronRight,
  CircleCheck,
  Clock,
  Plane,
  FileClock,
  FilePenLine,
  HandCoins,
  FolderOpen,
  TrendingDown,
  TrendingUp,
  TreePalm,
  UserCheck,
  UserPlus,
  UserRoundPlus,
  UserX,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { HrDashboardStats } from "@/lib/actions/hr-lookups";
import type { ContractAlert } from "@/lib/hr/dashboard-stats";
import { useAnimationsEnabled } from "@/components/layout/app-providers";
import { useUiLayout } from "@/components/layout/ui-layout-context";
import { RH_CARD, RhAlert, RhPage } from "@/components/rh/rh-ui";
import { isPathBlocked } from "@/lib/ui/resolve";
import { cn } from "@/lib/utils";

function pctChange(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function formatDa(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} M DA`;
  }
  return `${Math.round(value).toLocaleString("fr-FR")} DA`;
}

export function useCountUp(target: number, duration = 1000) {
  const animate = useAnimationsEnabled();
  const [value, setValue] = useState(animate ? 0 : target);
  useEffect(() => {
    const instant = !animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = instant ? 1 : Math.min(1, (now - start) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate, target, duration]);
  return value;
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Monotone cubic curve through the points (never overshoots, so a flat stretch stays flat). */
function smoothPath(points: [number, number][]) {
  const n = points.length;
  if (!n) return "";
  if (n < 3) return points.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
  const slopes = points.slice(0, -1).map(([x, y], i) => (points[i + 1][1] - y) / (points[i + 1][0] - x));
  const tangents = points.map((_, i) => {
    if (i === 0) return slopes[0];
    if (i === n - 1) return slopes[n - 2];
    const a = slopes[i - 1];
    const b = slopes[i];
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  });
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < n - 1; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const dx = (x1 - x0) / 3;
    d += ` C${x0 + dx},${y0 + dx * tangents[i]} ${x1 - dx},${y1 - dx * tangents[i + 1]} ${x1},${y1}`;
  }
  return d;
}

export function IconTile({ icon: Icon, className, style }: { icon: LucideIcon; className?: string; style?: CSSProperties }) {
  return (
    <span
      className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.8rem] bg-brand-muted text-brand", className)}
      style={style}
    >
      <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />
    </span>
  );
}

export function CardTitle({ icon, title, right, color }: { icon: LucideIcon; title: string; right?: ReactNode; color?: string }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <IconTile
          icon={icon}
          className="h-9 w-9 rounded-xl [&_svg]:h-[17px] [&_svg]:w-[17px]"
          style={color ? { background: `${color}22`, color } : undefined}
        />
        <h3 className="font-semibold text-foreground">{title}</h3>
      </div>
      {right}
    </div>
  );
}

function DeltaChip({ change }: { change: number }) {
  if (change === 0) {
    return <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-foreground/55">= 0 %</span>;
  }
  const up = change > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        up
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
          : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {up ? "+" : "−"}
      {Math.abs(change).toLocaleString("fr-FR")} %
    </span>
  );
}

function Sparkline({ values, color = "var(--color-brand)" }: { values: number[]; color?: string }) {
  const gradientId = useId();
  if (values.length < 2) return null;
  const w = 200;
  const h = 70;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map(
    (v, i) => [(i * w) / (values.length - 1), max === min ? h / 2 : h - 6 - ((v - min) / span) * (h - 12)] as [number, number],
  );
  const line = smoothPath(points);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[70px] w-[180px] shrink-0 sm:w-[200px]" aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#${gradientId})`} className="ui-fade" />
      <path d={line} pathLength={1} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" className="ui-draw" />
    </svg>
  );
}

export function Ring({
  pct,
  size = 92,
  stroke = 9,
  color = "var(--color-brand)",
  track = "currentColor",
}: {
  pct: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} className={track === "currentColor" ? "text-foreground/10" : undefined} strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(100, Math.max(0, pct)) / 100)}
        className="ui-ring"
        style={{ "--ring-length": c } as CSSProperties}
      />
    </svg>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-xl bg-surface-muted p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-[0.6rem] px-3.5 text-[13px] font-medium transition",
            o.value === value
              ? "bg-surface text-foreground shadow-[0_2px_8px_-3px_rgba(15,23,42,0.2)]"
              : "text-foreground/55 hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function HeadcountChart({ points }: { points: { key: string; label: string; count: number }[] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId();
  const w = Math.max(320, width || 640);
  const h = 250;
  const padX = 40;
  const top = 18;
  const bottom = 34;
  const values = points.map((p) => p.count);
  const lo = Math.max(0, Math.floor((Math.min(...values) - 2) / 4) * 4);
  const hi = Math.max(lo + 4, Math.ceil((Math.max(...values) + 1) / 4) * 4);
  const y = (v: number) => top + (1 - (v - lo) / (hi - lo)) * (h - top - bottom);
  const step = points.length > 1 ? (w - padX - 16) / (points.length - 1) : 0;
  const coords = points.map((p, i) => [padX + i * step, y(p.count)] as [number, number]);
  const line = smoothPath(coords);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(lo + t * (hi - lo)));
  const active = hover !== null ? coords[hover] : null;
  const diff = hover !== null && hover > 0 ? points[hover].count - points[hover - 1].count : 0;

  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      {points.length > 1 ? (
        <svg viewBox={`0 0 ${w} ${h}`} className="block h-auto w-full" role="img" aria-label="Évolution des effectifs">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`${gradientId}-line`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#7c3aed" />
              <stop offset="55%" stopColor="#0284c7" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
          </defs>
          {[...new Set(ticks)].map((t) => (
            <g key={t} className="text-foreground/30">
              <line x1={padX} x2={w - 16} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity="0.35" strokeDasharray="3 5" />
              <text x={padX - 10} y={y(t) + 4} textAnchor="end" fontSize="11" fill="currentColor">
                {t}
              </text>
            </g>
          ))}
          <path
            key={`area-${points.length}`}
            d={`${line} L${coords.at(-1)![0]},${h - bottom} L${coords[0][0]},${h - bottom} Z`}
            fill={`url(#${gradientId})`}
            className="ui-fade"
          />
          <path
            key={`line-${points.length}`}
            d={line}
            pathLength={1}
            fill="none"
            stroke={`url(#${gradientId}-line)`}
            strokeWidth="3"
            strokeLinecap="round"
            className="ui-draw"
          />
          {points.map((p, i) => (
            <text key={p.key} x={coords[i][0]} y={h - 10} textAnchor="middle" fontSize="11" className="fill-foreground/45 capitalize">
              {p.label}
            </text>
          ))}
          {active ? (
            <>
              <line x1={active[0]} x2={active[0]} y1={top} y2={h - bottom} stroke="var(--color-brand)" strokeOpacity="0.35" strokeDasharray="4 4" />
              <circle cx={active[0]} cy={active[1]} r="6" fill="var(--surface)" stroke="var(--color-brand)" strokeWidth="3" />
            </>
          ) : null}
          {coords.map((c, i) => (
            <rect key={i} x={c[0] - step / 2} y={0} width={step || w} height={h} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
      ) : null}
      {active && hover !== null ? (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-[130%] rounded-xl bg-slate-900 px-3 py-2 text-xs whitespace-nowrap text-white shadow-lg"
          style={{ left: `${(active[0] / w) * 100}%`, top: `${(active[1] / h) * 100}%` }}
        >
          <div className="text-white/60 capitalize">
            {points[hover].label} {points[hover].key.slice(0, 4)}
          </div>
          <div className="text-sm font-semibold">
            {points[hover].count} {points[hover].count > 1 ? "employés" : "employé"}{" "}
            {hover > 0 ? (
              <span className={cn("font-medium", diff >= 0 ? "text-emerald-300" : "text-rose-300")}>
                {diff >= 0 ? "+" : ""}
                {diff}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ContractDonut({ parts }: { parts: { label: string; count: number; color: string }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = parts.reduce((s, p) => s + p.count, 0);
  const shown = total ? parts : [{ label: "Aucun contrat", count: 1, color: "#e2e8f0" }];
  const sum = shown.reduce((s, p) => s + p.count, 0);
  const r = 70;
  const c = 2 * Math.PI * r;
  const arcs = shown.reduce<{ len: number; offset: number }[]>((acc, p) => {
    const prev = acc.at(-1);
    acc.push({ len: (p.count / sum) * c, offset: prev ? prev.offset + prev.len : 0 });
    return acc;
  }, []);
  const current = hover !== null && total ? shown[hover] : null;
  const pct = (n: number) => Math.round((n / sum) * 100);

  return (
    <div className="flex flex-col items-center gap-5" onMouseLeave={() => setHover(null)}>
      <div className="ui-fade relative">
        <svg width="180" height="180" viewBox="0 0 180 180" aria-hidden>
          {shown.map((p, i) => (
            <circle
              key={p.label}
              cx="90"
              cy="90"
              r={r}
              fill="none"
              stroke={p.color}
              strokeWidth={hover === i ? 28 : 22}
              strokeDasharray={`${Math.max(0, arcs[i].len - (shown.length > 1 ? 3 : 0))} ${c}`}
              strokeDashoffset={-arcs[i].offset}
              transform="rotate(-90 90 90)"
              className="cursor-pointer transition-[stroke-width,opacity] duration-300"
              opacity={hover === null || hover === i ? 1 : 0.45}
              onMouseEnter={() => setHover(i)}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold text-foreground">{current ? `${pct(current.count)}%` : total}</span>
          <span className="text-xs text-foreground/50">{current ? current.label : total > 1 ? "contrats" : "contrat"}</span>
        </div>
      </div>
      {total ? (
        <ul className="grid w-full grid-cols-2 gap-2">
          {shown.map((p, i) => (
            <li
              key={p.label}
              onMouseEnter={() => setHover(i)}
              className={cn(
                "flex items-center justify-between gap-2 rounded-xl bg-surface-muted px-3 py-2 text-sm ring-1 ring-transparent transition",
                hover === i && "ring-brand/35",
              )}
            >
              <span className="flex min-w-0 items-center gap-2 text-foreground/65">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                <span className="truncate">{p.label}</span>
              </span>
              <span className="font-semibold tabular-nums text-foreground">{pct(p.count)}%</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const ALERT_META: Record<ContractAlert["key"], { icon: LucideIcon; color: string; title: string; href: string }> = {
  ending: { icon: FileClock, color: "#f59e0b", title: "Fin de contrat", href: "/rh/documents?onglet=contrats" },
  draft: { icon: FilePenLine, color: "#3b6ef5", title: "Contrats à finaliser", href: "/rh/documents?onglet=contrats" },
  uncovered: { icon: UserX, color: "#ef4444", title: "Employés sans contrat", href: "/rh/documents?onglet=contrats" },
};

const QUICK_ACTIONS: { icon: LucideIcon; label: string; href: string; color: string }[] = [
  { icon: CalendarClock, label: "Pointage", href: "/rh/presence", color: "#0284c7" },
  { icon: UserPlus, label: "Nouvel employé", href: "/rh/employes?nouveau=1", color: "#7c3aed" },
  { icon: CalendarPlus, label: "Congé", href: "/rh/conges", color: "#d97706" },
  { icon: HandCoins, label: "Avance", href: "/rh/paie/avances", color: "#059669" },
  { icon: FolderOpen, label: "Documents", href: "/rh/documents", color: "#e11d48" },
];

const SUMMARY_TONES = {
  violet: "linear-gradient(145deg,#4338ca 0%,#7c3aed 58%,#a78bfa 140%)",
  emerald: "linear-gradient(145deg,#047857 0%,#059669 52%,#34d399 140%)",
  sky: "linear-gradient(145deg,#0369a1 0%,#0284c7 52%,#38bdf8 140%)",
  rose: "linear-gradient(145deg,#be123c 0%,#e11d48 55%,#fb7185 140%)",
} as const;

function SummaryCard({
  href,
  icon: Icon,
  label,
  value,
  hint,
  wash,
  aside,
  children,
}: {
  href?: string;
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint: string;
  wash: string;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  const body = (
    <>
      <span className="pointer-events-none absolute -top-10 -right-8 h-32 w-32 rounded-full bg-white/15 blur-2xl" aria-hidden />
      <span className="pointer-events-none absolute -bottom-12 -left-6 h-28 w-28 rounded-full bg-black/10 blur-2xl" aria-hidden />
      <div className="relative flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/18 ring-1 ring-white/30">
          <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />
        </span>
        {aside}
      </div>
      <p className="relative mt-5 text-sm font-medium text-white/80">{label}</p>
      <p className="relative mt-1 text-[2.35rem] leading-none font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="relative mt-2 text-xs leading-snug text-white/75">{hint}</p>
      {children ? <div className="relative mt-auto">{children}</div> : null}
    </>
  );
  const className =
    "ui-lift relative flex h-full min-h-[11.5rem] flex-col overflow-hidden rounded-[1.5rem] p-5 text-white shadow-[0_18px_36px_-22px_rgba(15,23,42,0.7)]";
  if (!href) {
    return (
      <section className={className} style={{ background: wash }}>
        {body}
      </section>
    );
  }
  return (
    <Link href={href} className={cn(className, "transition hover:-translate-y-0.5")} style={{ background: wash }}>
      {body}
    </Link>
  );
}

export function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || "E"
  );
}

const AVATAR_COLORS = ["#3b6ef5", "#ec4899", "#f59e0b", "#8b5cf6", "#ef4444", "#14b8a6", "#22c55e", "#6366f1", "#0ea5e9", "#d946ef"];

/** Initials on a soft tint picked from the name, or the photo when there is one. */
export function Avatar({ name, photo, size = 40 }: { name: string; photo?: string | null; size?: number }) {
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const color = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34), background: `${color}1c`, color }}
    >
      {initialsOf(name)}
    </span>
  );
}

export function RhHub({ stats }: { stats: HrDashboardStats }) {
  const layout = useUiLayout();
  const [range, setRange] = useState<6 | 12>(12);
  const activeCount = useCountUp(stats.employeesActive);
  const payroll = useCountUp(stats.payrollBase, 1100);
  const att = stats.attendance;
  const marked = att.present + att.absent + att.leave + att.mission;
  const presenceRate = marked ? Math.round(((att.present + att.mission) / marked) * 100) : 0;
  const presence = useCountUp(presenceRate);
  const empChange = pctChange(stats.employeesActive, stats.employeesActivePrev);
  const headcount = useMemo(() => stats.headcount.slice(-range), [stats.headcount, range]);
  const quickActions = useMemo(() => QUICK_ACTIONS.filter((a) => !isPathBlocked(layout, a.href.split("?")[0])), [layout]);
  const attendanceOpen = !isPathBlocked(layout, "/rh/presence");
  const alertCount = stats.alerts.reduce((s, a) => s + a.count, 0);
  const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const month = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const attDay = att.date
    ? new Date(`${att.date}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
    : null;

  return (
    <RhPage>
      {stats.error ? <RhAlert tone="danger">{stats.error}</RhAlert> : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-foreground/55 first-letter:uppercase" suppressHydrationWarning>
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.18)]" aria-hidden />
            {today}
          </p>
          <h2 className="text-[1.9rem] leading-tight font-semibold tracking-tight text-foreground">Résumé du personnel</h2>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/rh/presence"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-medium text-white shadow-[0_10px_22px_-12px_#0284c7] transition hover:-translate-y-px hover:bg-sky-500"
          >
            <CalendarClock className="h-4 w-4" aria-hidden />
            Pointage
          </Link>
          <Link
            href="/rh/employes?nouveau=1"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-medium text-white shadow-[0_10px_22px_-12px_#7c3aed] transition hover:-translate-y-px hover:bg-violet-500"
          >
            <UserPlus className="h-4 w-4" aria-hidden />
            Nouvel employé
          </Link>
        </div>
      </div>

      <div className="ui-stagger grid grid-cols-12 gap-4">
        <div className="col-span-12 sm:col-span-6 xl:col-span-3">
          <SummaryCard
            href="/rh/employes"
            icon={Users}
            label="Effectif actif"
            value={activeCount}
            hint={`${stats.employeesTotal} inscrits · ${stats.contractsOpen} contrat${stats.contractsOpen > 1 ? "s" : ""} ouvert${stats.contractsOpen > 1 ? "s" : ""}`}
            wash={SUMMARY_TONES.violet}
            aside={<DeltaChip change={empChange} />}
          >
            <div className="relative -mb-1 flex justify-end pt-3 [&_svg]:h-12 [&_svg]:w-36">
              <Sparkline values={stats.headcount.map((m) => m.count)} color="#ffffff" />
            </div>
          </SummaryCard>
        </div>

        <div className="col-span-12 sm:col-span-6 xl:col-span-3">
          <SummaryCard
            href="/rh/paie"
            icon={Banknote}
            label="Masse salariale"
            value={<span className="text-[1.65rem] leading-none">{formatDa(payroll)}</span>}
            hint={`Moyenne ${formatDa(stats.averageBase)} · salaires de base`}
            wash={SUMMARY_TONES.emerald}
          >
            <div className="relative mt-4">
              <div className="mb-1.5 flex justify-between text-[11px] text-white/75">
                <span>Couverture</span>
                <span className="font-semibold text-white">{stats.coverage} %</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/25">
                <div className="ui-grow-x h-full rounded-full bg-white" style={{ width: `${stats.coverage}%` }} />
              </div>
            </div>
          </SummaryCard>
        </div>

        <div className="col-span-12 sm:col-span-6 xl:col-span-3">
          <SummaryCard
            href="/rh/presence"
            icon={Clock}
            label="Présence"
            value={marked ? `${presence}%` : "—"}
            hint={attDay ? `${att.present + att.mission} présents · ${attDay}` : "Aucun pointage ce mois-ci"}
            wash={SUMMARY_TONES.sky}
            aside={<Ring pct={presenceRate} size={52} stroke={6} color="#ffffff" track="rgba(255,255,255,0.28)" />}
          />
        </div>

        <div className="col-span-12 sm:col-span-6 xl:col-span-3">
          <SummaryCard
            href="/rh/documents?onglet=contrats"
            icon={alertCount ? BellRing : CircleCheck}
            label={alertCount ? "Points d'attention" : "Situation"}
            value={alertCount || "OK"}
            hint={alertCount ? `${stats.alerts.length} sujet${stats.alerts.length > 1 ? "s" : ""} à traiter` : "Contrats et effectifs à jour"}
            wash={alertCount ? SUMMARY_TONES.rose : SUMMARY_TONES.emerald}
          />
        </div>

        {attendanceOpen ? (
          <div className="col-span-12 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(
              [
                { icon: UserCheck, label: "Présents", value: att.present, wash: "linear-gradient(145deg,#0f766e,#2dd4bf)" },
                { icon: UserX, label: "Absents", value: att.absent, wash: "linear-gradient(145deg,#9d174d,#db2777)" },
                { icon: TreePalm, label: "En congé", value: att.leave, wash: "linear-gradient(145deg,#c2410c,#fb923c)" },
                { icon: Plane, label: "En mission", value: att.mission, wash: "linear-gradient(145deg,#a16207,#facc15)" },
              ] as const
            ).map((s) => (
              <Link
                key={s.label}
                href="/rh/presence"
                className="ui-lift flex items-center gap-3 overflow-hidden rounded-2xl px-4 py-3 text-white shadow-[0_14px_28px_-18px_rgba(15,23,42,0.65)] transition hover:-translate-y-0.5"
                style={{ background: s.wash }}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/18 ring-1 ring-white/25">
                  <s.icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-2xl leading-none font-semibold tabular-nums">{s.value}</span>
                  <span className="mt-1 block text-xs text-white/80">{s.label}</span>
                </span>
              </Link>
            ))}
            <p className="col-span-2 -mt-1 text-xs text-foreground/50 first-letter:uppercase lg:col-span-4" suppressHydrationWarning>
              {month}
              {attDay ? ` · dernier jour pointé : ${attDay}` : " · aucun pointage ce mois-ci"}
            </p>
          </div>
        ) : null}

        <section className={cn(RH_CARD, "col-span-12 p-6 xl:col-span-8")}>
          <CardTitle
            icon={Activity}
            color="#7c3aed"
            title="Évolution des effectifs"
            right={
              <Segmented
                value={range}
                onChange={setRange}
                options={[
                  { value: 6, label: "6 mois" },
                  { value: 12, label: "12 mois" },
                ]}
              />
            }
          />
          <HeadcountChart points={headcount} />
        </section>

        <section className={cn(RH_CARD, "col-span-12 p-6 xl:col-span-4")}>
          <CardTitle icon={ChartPie} color="#0284c7" title="Répartition des contrats" />
          <ContractDonut parts={stats.contractMix} />
        </section>

        <section className={cn(RH_CARD, "col-span-12 p-6 lg:col-span-4")}>
          <CardTitle
            icon={BellRing}
            color="#e11d48"
            title="Alertes"
            right={
              stats.alerts.length ? (
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
                  {stats.alerts.reduce((s, a) => s + a.count, 0)}
                </span>
              ) : null
            }
          />
          {stats.alerts.length ? (
            <ul className="-mx-1 space-y-1">
              {stats.alerts.map((a) => {
                const meta = ALERT_META[a.key];
                return (
                  <li key={a.key}>
                    <Link href={meta.href} className="group flex items-center gap-3 rounded-2xl p-3 transition hover:bg-surface-muted">
                      <IconTile icon={meta.icon} className="rounded-xl" style={{ background: `${meta.color}17`, color: meta.color }} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground">{meta.title}</span>
                        <span className="block truncate text-xs text-foreground/50">{a.detail}</span>
                      </span>
                      <span className="text-xs whitespace-nowrap text-foreground/40">{a.when}</span>
                      <ChevronRight className="h-4 w-4 text-foreground/30 transition group-hover:translate-x-0.5" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex flex-col items-center py-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10">
                <CircleCheck className="h-6 w-6" aria-hidden />
              </span>
              <p className="mt-3 text-sm font-medium text-foreground">Tout est à jour</p>
            </div>
          )}
        </section>

        <section className={cn(RH_CARD, "col-span-12 p-6 lg:col-span-4")}>
          <CardTitle
            icon={UserRoundPlus}
            color="#059669"
            title="Derniers recrutements"
            right={
              <Link href="/rh/employes" className="text-sm font-medium text-brand hover:underline">
                Voir tout
              </Link>
            }
          />
          {stats.recentHires.length ? (
            <ul className="-mx-1 space-y-0.5">
              {stats.recentHires.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/rh/employes?q=${encodeURIComponent(e.matricule)}`}
                    className="flex items-center gap-3 rounded-2xl p-2.5 transition hover:bg-surface-muted"
                  >
                    <Avatar name={e.name} photo={e.photo_url} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{e.name}</span>
                      <span className="block truncate text-xs text-foreground/50">{e.poste ?? e.matricule}</span>
                    </span>
                    {e.hired_at ? (
                      <span className="text-xs text-foreground/40 tabular-nums">
                        {new Date(e.hired_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-foreground/50">Aucun employé</p>
          )}
        </section>

        <section className={cn(RH_CARD, "col-span-12 p-6 lg:col-span-4")}>
          <CardTitle icon={Zap} color="#d97706" title="Actions rapides" />
          <div className="grid grid-cols-3 gap-2.5">
            {quickActions.map(({ icon: Icon, label, href, color }) => (
              <Link
                key={href}
                href={href}
                className="group flex flex-col items-center justify-center gap-2 rounded-2xl py-4 transition duration-300 hover:-translate-y-0.5 hover:brightness-110"
                style={{ background: `${color}18`, color }}
              >
                <Icon className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" aria-hidden />
                <span className="text-center text-xs leading-tight font-medium">{label}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </RhPage>
  );
}
