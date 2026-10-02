"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Activity,
  CalendarClock,
  CalendarPlus,
  ChartPie,
  ChevronRight,
  FileBadge,
  FilePenLine,
  FileText,
  HandCoins,
  LayoutDashboard,
  MapPin,
  Receipt,
  TrendingDown,
  TrendingUp,
  UserPlus,
  UserRound,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { HrDashboardStats } from "@/lib/actions/hr-lookups";
import { useAnimationsEnabled } from "@/components/layout/app-providers";
import { useUiLayout } from "@/components/layout/ui-layout-context";
import { RhAlert, RhPage, bi } from "@/components/rh/rh-ui";
import { RH_SECTION_ICONS } from "@/components/rh/rh-module-nav";
import { resolveRhSections } from "@/lib/ui/resolve";
import { cn } from "@/lib/utils";

const CARD =
  "rounded-[calc(var(--radius-2xl)+0.5rem)] border border-border/70 bg-[var(--card-bg,var(--surface))] shadow-[var(--card-shadow)]";

function pctChange(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function useCountUp(target: number, duration = 1000) {
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

/** Monotone cubic curve through the points (never overshoots, so a zero month stays on the baseline). */
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

function IconTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.8rem] bg-brand-muted text-brand", className)}>
      <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />
    </span>
  );
}

function CardTitle({ icon, title, right }: { icon: LucideIcon; title: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <IconTile icon={icon} className="h-9 w-9 rounded-xl [&_svg]:h-[17px] [&_svg]:w-[17px]" />
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

function Sparkline({ values }: { values: number[] }) {
  const gradientId = useId();
  if (values.length < 2) return null;
  const w = 200;
  const h = 70;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => [(i * w) / (values.length - 1), h - 6 - ((v - min) / span) * (h - 12)] as [number, number]);
  const line = smoothPath(points);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[70px] w-[180px] shrink-0 sm:w-[200px]" aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#${gradientId})`} className="ui-fade" />
      <path d={line} pathLength={1} fill="none" stroke="var(--color-brand)" strokeWidth="2.5" strokeLinecap="round" className="ui-draw" />
    </svg>
  );
}

function Ring({ pct, size = 92, stroke = 9 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-foreground/10" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-brand)"
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

function HiringChart({ points }: { points: { label: string; count: number }[] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId();
  const w = Math.max(320, width || 640);
  const h = 240;
  const padX = 36;
  const top = 20;
  const bottom = 34;
  const maxCount = Math.max(4, ...points.map((p) => p.count));
  const max = Math.ceil(maxCount / 4) * 4;
  const y = (v: number) => top + (1 - v / max) * (h - top - bottom);
  const step = points.length > 1 ? (w - padX - 16) / (points.length - 1) : 0;
  const coords = points.map((p, i) => [padX + i * step, y(p.count)] as [number, number]);
  const line = smoothPath(coords);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(t * max));
  const active = hover !== null ? coords[hover] : null;

  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      {points.length > 1 ? (
        <svg viewBox={`0 0 ${w} ${h}`} className="block h-auto w-full" role="img" aria-label="Embauches par mois">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t} className="text-foreground/30">
              <line x1={padX} x2={w - 16} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity="0.35" strokeDasharray="3 5" />
              <text x={padX - 10} y={y(t) + 4} textAnchor="end" fontSize="11" fill="currentColor">
                {t}
              </text>
            </g>
          ))}
          <path
            d={`${line} L${coords.at(-1)![0]},${h - bottom} L${coords[0][0]},${h - bottom} Z`}
            fill={`url(#${gradientId})`}
            className="ui-fade"
          />
          <path d={line} pathLength={1} fill="none" stroke="var(--color-brand)" strokeWidth="3" strokeLinecap="round" className="ui-draw" />
          {points.map((p, i) => (
            <text key={p.label + i} x={coords[i][0]} y={h - 10} textAnchor="middle" fontSize="11" className="fill-foreground/45 capitalize">
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
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-[130%] whitespace-nowrap rounded-xl bg-slate-900 px-3 py-2 text-xs text-white shadow-lg"
          style={{ left: `${(active[0] / w) * 100}%`, top: `${(active[1] / h) * 100}%` }}
        >
          <div className="capitalize text-white/60">{points[hover].label}</div>
          <div className="text-sm font-semibold">
            {points[hover].count} {points[hover].count > 1 ? "embauches" : "embauche"}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatusDonut({ parts, total }: { parts: { label: string; value: number; color: string }[]; total: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const sum = parts.reduce((s, p) => s + p.value, 0) || 1;
  const r = 70;
  const c = 2 * Math.PI * r;
  const arcs = parts.reduce<{ len: number; offset: number }[]>((acc, p) => {
    const prev = acc.at(-1);
    acc.push({ len: (p.value / sum) * c, offset: prev ? prev.offset + prev.len : 0 });
    return acc;
  }, []);
  const current = hover !== null ? parts[hover] : null;

  return (
    <div className="flex flex-col items-center gap-5" onMouseLeave={() => setHover(null)}>
      <div className="ui-fade relative">
        <svg width="180" height="180" viewBox="0 0 180 180" aria-hidden>
          {parts.map((p, i) => (
            <circle
              key={p.label}
              cx="90"
              cy="90"
              r={r}
              fill="none"
              stroke={p.color}
              strokeWidth={hover === i ? 28 : 22}
              strokeDasharray={`${Math.max(0, arcs[i].len - (parts.length > 1 ? 3 : 0))} ${c}`}
              strokeDashoffset={-arcs[i].offset}
              transform="rotate(-90 90 90)"
              className="cursor-pointer transition-[stroke-width,opacity] duration-300"
              opacity={hover === null || hover === i ? 1 : 0.4}
              onMouseEnter={() => setHover(i)}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-3xl font-semibold text-foreground">
            {current ? `${Math.round((current.value / sum) * 100)}%` : total}
          </span>
          <span className="text-xs text-foreground/50">{current ? current.label : "employés"}</span>
        </div>
      </div>
      <ul className="grid w-full grid-cols-2 gap-2">
        {parts.map((p, i) => (
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
            <span className="font-semibold tabular-nums text-foreground">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const STATUS_LABEL: Record<string, { label: string; dot: string }> = {
  ACTIVE: { label: "Actif", dot: "bg-alert-success" },
  INVITED: { label: "Invité", dot: "bg-alert-warning" },
  SUSPENDED: { label: "Suspendu", dot: "bg-alert-critical" },
  DISABLED: { label: "Désactivé", dot: "bg-alert-critical" },
  INACTIVE: { label: "Inactif", dot: "bg-foreground/30" },
};

const QUICK_ACTIONS: { icon: LucideIcon; label: string; href: string }[] = [
  { icon: UserPlus, label: "Employés", href: "/rh/employes" },
  { icon: FileBadge, label: "Attestations", href: "/rh/attestations" },
  { icon: CalendarPlus, label: "Congés", href: "/rh/conges" },
  { icon: CalendarClock, label: "Présence", href: "/rh/presence" },
  { icon: HandCoins, label: "Avances", href: "/rh/paie/avances" },
  { icon: Receipt, label: "Bulletins", href: "/rh/paie/bulletins" },
];

const SELECT =
  "h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10";

export function RhHub({ stats }: { stats: HrDashboardStats }) {
  const [siteId, setSiteId] = useState("");
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const activeCount = useCountUp(stats.employeesActive);
  const contractCount = useCountUp(stats.contractsActive);
  const documentCount = useCountUp(stats.documentsTotal);
  const empChange = pctChange(stats.employeesActive, stats.employeesActivePrev);
  const contractChange = pctChange(stats.contractsActive, stats.contractsActivePrev);
  const coverage = stats.employeesActive ? Math.min(100, Math.round((stats.contractsActive / stats.employeesActive) * 100)) : 0;
  const hires = stats.hiringByMonth.reduce((s, m) => s + m.count, 0);

  const donutParts = useMemo(
    () =>
      stats.statusBreakdown.length
        ? stats.statusBreakdown.map((s) => ({ label: s.labelFr, value: s.count, color: s.color }))
        : [{ label: "Aucun", value: 1, color: "#e2e8f0" }],
    [stats.statusBreakdown],
  );

  const [periodYear, periodMonth] = period.split("-");
  const presenceHref = siteId ? `/rh/presence?site=${siteId}&mois=${period}` : `/rh/presence?mois=${period}`;
  const paieHref = `/rh/paie?year=${periodYear}&month=${Number(periodMonth)}`;
  return (
    <RhPage>
      {stats.error ? <RhAlert tone="danger">{stats.error}</RhAlert> : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="font-display text-[1.9rem] leading-tight font-semibold tracking-tight text-foreground">
          {bi("Vue d’ensemble", "نظرة عامة")}
        </h2>
        <Link
          href="/rh/employes"
          className="ui-btn ui-btn-primary inline-flex h-10 items-center gap-2 px-4 text-sm font-semibold transition hover:-translate-y-px"
        >
          <UserPlus className="h-4 w-4" aria-hidden />
          {bi("Gérer le personnel", "إدارة العمال")}
        </Link>
      </div>

      <div className="ui-stagger grid grid-cols-12 gap-5">
        <section className={cn(CARD, "ui-lift col-span-12 p-6 xl:col-span-5")}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <IconTile icon={Users} />
              <span className="font-medium text-foreground">{bi("Effectif actif", "العمال النشطون")}</span>
            </div>
            <DeltaChip change={empChange} />
          </div>
          <div className="mt-6 flex items-end justify-between gap-4">
            <div>
              <p className="font-display text-[3.75rem] leading-none font-semibold tracking-tighter tabular-nums text-foreground">{activeCount}</p>
              <p className="mt-3 text-sm text-foreground/50">
                {stats.employeesTotal} {bi("enregistrés", "مسجّل")} · {stats.employeesActivePrev} {bi("le mois dernier", "الشهر الماضي")}
              </p>
            </div>
            <Sparkline values={stats.hiringByMonth.map((m) => m.count)} />
          </div>
        </section>

        <section className={cn(CARD, "ui-lift col-span-12 flex flex-col p-6 sm:col-span-6 xl:col-span-4")}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <IconTile icon={FilePenLine} />
              <span className="font-medium text-foreground">{bi("Contrats ouverts", "العقود المفتوحة")}</span>
            </div>
            <DeltaChip change={contractChange} />
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="font-display text-[2.6rem] leading-none font-semibold tracking-tight tabular-nums text-foreground">{contractCount}</p>
            <div className="relative">
              <Ring pct={coverage} size={84} stroke={8} />
              <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-foreground">{coverage}%</span>
            </div>
          </div>
          <p className="mt-auto pt-3 text-sm text-foreground/50">{bi("Couverture contractuelle de l’effectif", "تغطية العقود")}</p>
        </section>

        <Link href="/rh/documents" className={cn(CARD, "ui-lift group col-span-12 flex flex-col p-6 sm:col-span-6 xl:col-span-3")}>
          <div className="flex items-center gap-3">
            <IconTile icon={FileText} />
            <span className="font-medium text-foreground">{bi("Documents RH", "وثائق الموارد")}</span>
          </div>
          <p className="mt-6 font-display text-[2.6rem] leading-none font-semibold tracking-tight tabular-nums text-foreground">{documentCount}</p>
          <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-brand">
            {bi("Ouvrir", "فتح")}
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        </Link>

        <section className={cn(CARD, "col-span-12 p-6 xl:col-span-8")}>
          <CardTitle
            icon={Activity}
            title={bi("Résumé des embauches", "ملخص التوظيف")}
            right={
              <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold text-foreground/60">
                {hires} {bi("sur 6 mois", "خلال 6 أشهر")}
              </span>
            }
          />
          <HiringChart points={stats.hiringByMonth} />
        </section>

        <section className={cn(CARD, "col-span-12 p-6 xl:col-span-4")}>
          <CardTitle icon={ChartPie} title={bi("Répartition de l’effectif", "توزيع العمال")} />
          <StatusDonut parts={donutParts} total={stats.employeesTotal} />
        </section>

        <section className={cn(CARD, "col-span-12 p-6 lg:col-span-4")}>
          <CardTitle icon={MapPin} title={bi("Disponibilité chantier", "جاهزية الورشة")} />
          <div className="space-y-3">
            <select className={SELECT} value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">{bi("Tous les chantiers", "كل الورشات")}</option>
              {stats.sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <input type="month" className={SELECT} value={period} onChange={(e) => setPeriod(e.target.value)} />
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Link href={presenceHref} className="ui-btn ui-btn-primary inline-flex h-11 items-center justify-center gap-2 text-sm font-semibold">
                <CalendarClock className="h-4 w-4" aria-hidden />
                {bi("Présence", "حضور")}
              </Link>
              <Link
                href={paieHref}
                className="ui-btn inline-flex h-11 items-center justify-center gap-2 border border-border bg-surface text-sm font-semibold transition hover:border-brand/40 hover:text-brand"
              >
                <Receipt className="h-4 w-4" aria-hidden />
                {bi("Paie", "أجر")}
              </Link>
            </div>
          </div>
        </section>

        <section className={cn(CARD, "col-span-12 p-6 lg:col-span-4")}>
          <CardTitle
            icon={UserRound}
            title={bi("Activité récente", "آخر النشاطات")}
            right={
              <Link href="/rh/employes" className="text-sm font-medium text-brand hover:underline">
                {bi("Voir tout", "عرض الكل")}
              </Link>
            }
          />
          {stats.recentEmployees.length ? (
            <ul className="-mx-2 space-y-0.5">
              {stats.recentEmployees.slice(0, 5).map((e) => {
                const status = STATUS_LABEL[e.status] ?? { label: e.status, dot: "bg-brand" };
                return (
                  <li key={e.id}>
                    <Link
                      href={`/rh/employes?q=${encodeURIComponent(e.matricule)}`}
                      className="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-surface-muted"
                    >
                      {e.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={e.photo_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-muted text-sm font-semibold text-brand">
                          {e.name
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((p) => p[0])
                            .join("")
                            .toUpperCase() || "E"}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{e.name}</span>
                        <span className="block font-mono text-xs text-foreground/45">{e.matricule}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/60">
                        <span className={cn("h-2 w-2 rounded-full", status.dot)} />
                        {status.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-foreground/50">{bi("Aucun employé", "لا يوجد عمال")}</p>
          )}
        </section>

        <section className={cn(CARD, "col-span-12 p-6 lg:col-span-4")}>
          <CardTitle icon={Zap} title={bi("Accès rapide", "وصول سريع")} />
          <div className="grid grid-cols-3 gap-2.5">
            {QUICK_ACTIONS.map(({ icon: Icon, label, href }) => (
              <Link
                key={href}
                href={href}
                className="group flex flex-col items-center justify-center gap-2 rounded-2xl bg-surface-muted py-4 text-foreground/75 transition-all duration-300 hover:bg-brand hover:text-white"
              >
                <Icon className="h-5 w-5 text-brand transition-transform duration-300 group-hover:scale-110 group-hover:text-white" aria-hidden />
                <span className="text-center text-xs leading-tight font-medium">{label}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <RhQuickLinks />
    </RhPage>
  );
}

function RhQuickLinks() {
  const layout = useUiLayout();
  const sections = useMemo(
    () =>
      resolveRhSections(layout)
        .map((s) => ({ ...s, items: s.items.filter((i) => i.href && i.href !== "/rh") }))
        .filter((s) => s.items.length > 0),
    [layout],
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {sections.map((section) => {
        const Icon = RH_SECTION_ICONS[section.key] ?? LayoutDashboard;
        return (
          <div key={section.key} className={cn(CARD, "ui-lift p-5")}>
            <div className="mb-3 flex items-center gap-3">
              <IconTile icon={Icon} className="h-9 w-9 rounded-xl [&_svg]:h-[17px] [&_svg]:w-[17px]" />
              <p className="font-display text-sm font-semibold text-foreground">{section.titleFr}</p>
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href!}
                    className="group flex items-center justify-between rounded-xl px-2.5 py-2 text-sm text-foreground/75 transition hover:bg-surface-muted hover:text-foreground"
                  >
                    {item.label}
                    <ChevronRight
                      className="h-3.5 w-3.5 text-foreground/30 transition group-hover:translate-x-0.5 group-hover:text-brand"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
