"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { HrDashboardStats } from "@/lib/actions/hr-lookups";
import { RhAlert, RhPage, bi } from "@/components/rh/rh-ui";

function pctChange(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function DonutChart({
  parts,
}: {
  parts: { label: string; value: number; color: string }[];
}) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const r = 54;
  const c = 2 * Math.PI * r;
  const arcs = parts.reduce<{ part: (typeof parts)[number]; len: number; offset: number }[]>(
    (acc, part) => {
      const prev = acc.at(-1);
      acc.push({ part, len: (part.value / total) * c, offset: prev ? prev.offset + prev.len : 0 });
      return acc;
    },
    [],
  );
  return (
    <div className="flex flex-col items-center gap-4">
      <svg width="160" height="160" viewBox="0 0 140 140" className="-rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#eef2f7" strokeWidth="18" />
        {arcs.map(({ part: p, len, offset }) => (
          <circle
            key={p.label}
            cx="70"
            cy="70"
            r={r}
            fill="none"
            stroke={p.color}
            strokeWidth="18"
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
          />
        ))}
      </svg>
      <ul className="w-full space-y-2 text-sm">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-foreground/70">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
              {p.label}
            </span>
            <span className="font-semibold tabular-nums text-foreground">
              {Math.round((p.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AreaChart({ points }: { points: { label: string; count: number }[] }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  const w = 520;
  const h = 180;
  const padX = 28;
  const padY = 24;
  const coords = points.map((p, i) => {
    const x = padX + (i * (w - padX * 2)) / Math.max(1, points.length - 1);
    const y = h - padY - (p.count / max) * (h - padY * 2);
    return { x, y, ...p };
  });
  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");
  const area = `${line} L${coords[coords.length - 1]?.x ?? padX},${h - padY} L${padX},${h - padY} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-48 w-full">
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = h - padY - t * (h - padY * 2);
        return (
          <line
            key={t}
            x1={padX}
            x2={w - padX}
            y1={y}
            y2={y}
            stroke="#e8ecf3"
            strokeWidth="1"
          />
        );
      })}
      <path d={area} fill="url(#hireFill)" opacity="0.9" />
      <path d={line} fill="none" stroke="#3b6ef5" strokeWidth="3" strokeLinecap="round" />
      {coords.map((c) => (
        <circle key={c.label} cx={c.x} cy={c.y} r="4" fill="#fff" stroke="#3b6ef5" strokeWidth="2" />
      ))}
      {coords.map((c) => (
        <text
          key={`${c.label}-t`}
          x={c.x}
          y={h - 6}
          textAnchor="middle"
          className="fill-foreground/45 text-[11px]"
        >
          {c.label}
        </text>
      ))}
      <defs>
        <linearGradient id="hireFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b6ef5" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#3b6ef5" stopOpacity="0.02" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function KpiCard({
  title,
  badge,
  value,
  change,
  compareLabel,
  footerLabel,
  footerValue,
}: {
  title: string;
  badge: string;
  value: string;
  change: number;
  compareLabel: string;
  footerLabel: string;
  footerValue: string;
}) {
  const up = change >= 0;
  return (
    <div className="rounded-2xl border border-border/80 bg-surface p-5 shadow-[var(--card-shadow)]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-[11px] font-semibold text-foreground/55">
          {badge}
        </span>
      </div>
      <p className="mt-3 font-display text-3xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
      <p className={`mt-2 inline-flex items-center gap-1 text-sm font-semibold ${up ? "text-alert-success" : "text-alert-critical"}`}>
        <span aria-hidden>{up ? "▲" : "▼"}</span>
        {Math.abs(change)}%
      </p>
      <p className="mt-1 text-xs text-foreground/45">{compareLabel}</p>
      <div className="mt-4 border-t border-border/70 pt-3 text-xs text-foreground/55">
        <span>{footerLabel}</span>
        <span className="mt-0.5 block font-semibold text-foreground">{footerValue}</span>
      </div>
    </div>
  );
}

function statusTone(status: string): "success" | "brand" | "danger" | "warning" {
  if (status === "ACTIVE") return "success";
  if (status === "INVITED") return "warning";
  if (status === "SUSPENDED" || status === "DISABLED") return "danger";
  return "brand";
}

const statusDot: Record<string, string> = {
  success: "bg-alert-success",
  brand: "bg-brand",
  danger: "bg-alert-critical",
  warning: "bg-alert-warning",
};

export function RhHub({ stats }: { stats: HrDashboardStats }) {
  const [siteId, setSiteId] = useState("");
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const empChange = pctChange(stats.employeesActive, stats.employeesActivePrev);
  const contractChange = pctChange(stats.contractsActive, stats.contractsActivePrev);

  const donutParts = useMemo(() => {
    if (!stats.statusBreakdown.length) {
      return [{ label: bi("Aucun", "لا يوجد"), value: 1, color: "#e2e8f0" }];
    }
    return stats.statusBreakdown.map((s) => ({
      label: `${s.labelFr} · ${s.labelAr}`,
      value: s.count,
      color: s.color,
    }));
  }, [stats.statusBreakdown]);

  const [periodYear, periodMonth] = period.split("-");
  const presenceHref = siteId
    ? `/rh/presence?site=${siteId}&mois=${period}`
    : `/rh/presence?mois=${period}`;
  const paieHref = `/rh/paie?year=${periodYear}&month=${Number(periodMonth)}`;

  return (
    <RhPage>
      {stats.error ? <RhAlert tone="danger">{stats.error}</RhAlert> : null}

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.35fr]">
        {/* Left: Today's statistics */}
        <section className="space-y-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">
              {bi("Statistiques du jour", "إحصائيات اليوم")}
            </h2>
            <p className="mt-0.5 text-xs text-foreground/45">
              {new Date().toLocaleString("fr-DZ", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>

          <KpiCard
            title={bi("Effectif actif", "العمال النشطون")}
            badge={bi("Aujourd'hui", "اليوم")}
            value={String(stats.employeesActive)}
            change={empChange}
            compareLabel={bi(
              `Comparé à ${stats.employeesActivePrev} le mois précédent`,
              `مقارنة بـ ${stats.employeesActivePrev} الشهر السابق`,
            )}
            footerLabel={bi("Total enregistré", "الإجمالي المسجّل")}
            footerValue={String(stats.employeesTotal)}
          />

          <KpiCard
            title={bi("Contrats ouverts", "العقود المفتوحة")}
            badge={bi("Aujourd'hui", "اليوم")}
            value={String(stats.contractsActive)}
            change={contractChange}
            compareLabel={bi(
              `Comparé à ${stats.contractsActivePrev} le mois précédent`,
              `مقارنة بـ ${stats.contractsActivePrev} الشهر السابق`,
            )}
            footerLabel={bi("Documents RH", "مستندات الموارد")}
            footerValue={String(stats.documentsTotal)}
          />

          <div className="rounded-2xl border border-border/80 bg-surface p-5 shadow-[var(--card-shadow)]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                {bi("Répartition effectif", "توزيع العمال")}
              </h3>
              <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-[11px] font-semibold text-foreground/55">
                {bi("Aujourd'hui", "اليوم")}
              </span>
            </div>
            <DonutChart parts={donutParts} />
          </div>
        </section>

        {/* Right: filters + live list + chart */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-3 py-2 shadow-[var(--card-shadow)]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-foreground/35" aria-hidden>
                <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
                <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
              <input
                className="w-40 bg-transparent text-sm outline-none placeholder:text-foreground/35 sm:w-52"
                placeholder={bi("Rechercher…", "بحث…")}
                readOnly
              />
            </div>
            <button
              type="button"
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-surface shadow-[var(--card-shadow)]"
              aria-label="Notifications"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />
                <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.7" />
              </svg>
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-alert-critical" />
            </button>
          </div>

          <div className="rounded-2xl border border-border/80 bg-surface p-5 shadow-[var(--card-shadow)]">
            <h3 className="text-sm font-semibold text-foreground">
              {bi("Disponibilité chantier", "جاهزية الورشة")}
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <select
                className="h-11 rounded-xl border border-border bg-surface-muted/40 px-3 text-sm outline-none focus:border-brand"
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
              >
                <option value="">{bi("Chantier", "الورشة")}</option>
                {stats.sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <input
                type="month"
                className="h-11 rounded-xl border border-border bg-surface-muted/40 px-3 text-sm outline-none focus:border-brand"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
              <div className="flex gap-2">
                <Link
                  href={presenceHref}
                  className="inline-flex h-11 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-white"
                >
                  {bi("Présence", "حضور")}
                </Link>
                <Link
                  href={paieHref}
                  className="inline-flex h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold"
                >
                  {bi("Paie", "أجر")}
                </Link>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/80 bg-surface p-5 shadow-[var(--card-shadow)]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                {bi("Statut live des employés", "حالة العمال المباشرة")}
              </h3>
              <Link href="/rh/employes" className="text-xs font-semibold text-brand">
                {bi("Voir tout", "عرض الكل")}
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-foreground/40">
                    <th className="pb-2 pr-3">No.</th>
                    <th className="pb-2 pr-3">{bi("Matricule", "الرقم")}</th>
                    <th className="pb-2 pr-3">{bi("Employé", "العامل")}</th>
                    <th className="pb-2">{bi("Statut", "الحالة")}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-foreground/45">
                        {bi("Aucun employé", "لا يوجد عمال")}
                      </td>
                    </tr>
                  ) : (
                    stats.recentEmployees.map((e, i) => {
                      const tone = statusTone(e.status);
                      return (
                        <tr key={e.id} className="border-t border-border/60">
                          <td className="py-3 pr-3 text-foreground/45">{i + 1}</td>
                          <td className="py-3 pr-3 font-mono text-xs">{e.matricule}</td>
                          <td className="py-3 pr-3">
                            <div className="flex items-center gap-2">
                              {e.photo_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={e.photo_url}
                                  alt=""
                                  className="h-8 w-8 rounded-full object-cover"
                                />
                              ) : (
                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-muted text-[11px] font-bold text-brand">
                                  {e.name.slice(0, 1) || "E"}
                                </span>
                              )}
                              <span className="font-medium text-foreground">{e.name}</span>
                            </div>
                          </td>
                          <td className="py-3">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/70">
                              <span className={`h-2 w-2 rounded-full ${statusDot[tone]}`} />
                              {e.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-border/80 bg-surface p-5 shadow-[var(--card-shadow)]">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                {bi("Résumé des embauches", "ملخص التوظيف")}
              </h3>
              <span className="rounded-full border border-border px-3 py-1 text-[11px] font-semibold text-foreground/55">
                {stats.hiringByMonth[0]?.label} – {stats.hiringByMonth.at(-1)?.label}
              </span>
            </div>
            <AreaChart points={stats.hiringByMonth} />
          </div>
        </section>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { href: "/rh/employes", label: "Employés" },
          { href: "/rh/contrats", label: "Contrats" },
          { href: "/rh/postes", label: "Postes & grille salariale" },
          { href: "/rh/presence", label: "Présence" },
          { href: "/rh/conges", label: "Congés & absences" },
          { href: "/rh/paie", label: "Paie" },
          { href: "/rh/sorties", label: "Sorties & STC" },
          { href: "/rh/couts", label: "Coûts par chantier / contrat" },
          { href: "/rh/documents", label: "Documents" },
          { href: "/rh/attestations", label: "Attestations & courriers" },
          { href: "/rh/legal", label: "Cotisations" },
          { href: "/rh/paie/exceptions", label: "Exceptions" },
          { href: "/rh/paie/avances", label: "Avances & prêts" },
          { href: "/rh/parametres", label: "Paramètres" },
        ].map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="rounded-2xl border border-border/80 bg-surface px-4 py-4 shadow-[var(--card-shadow)] transition hover:border-brand/40"
          >
            <p className="font-display text-lg font-semibold">{m.label}</p>
          </Link>
        ))}
      </div>
    </RhPage>
  );
}
