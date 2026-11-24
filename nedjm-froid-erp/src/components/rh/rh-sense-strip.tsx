"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Banknote, CircleAlert, CircleCheck, Clock, Plane, TreePalm, UserCheck, UserX, Users, type LucideIcon } from "lucide-react";
import type { HrDashboardStats } from "@/lib/actions/hr-lookups";
import { cn } from "@/lib/utils";

const FILL = {
  violet: "linear-gradient(145deg,#4338ca 0%,#7c3aed 58%,#a78bfa 140%)",
  emerald: "linear-gradient(145deg,#047857 0%,#059669 52%,#34d399 140%)",
  sky: "linear-gradient(145deg,#0369a1 0%,#0284c7 52%,#38bdf8 140%)",
  rose: "linear-gradient(145deg,#be123c 0%,#e11d48 55%,#fb7185 140%)",
  teal: "linear-gradient(145deg,#0f766e,#2dd4bf)",
  red: "linear-gradient(145deg,#7f1d1d,#dc2626)",
  orange: "linear-gradient(145deg,#c2410c,#fb923c)",
  amber: "linear-gradient(145deg,#a16207,#facc15)",
} as const;

function formatDa(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} M DA`;
  }
  return `${Math.round(value).toLocaleString("fr-FR")} DA`;
}

function Card({
  href,
  icon: Icon,
  label,
  value,
  hint,
  fill,
  calm,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  fill?: string;
  calm?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "relative flex min-h-[9.5rem] flex-col overflow-hidden rounded-[1.4rem] p-4 transition hover:-translate-y-0.5",
        calm
          ? "border border-border/70 bg-surface text-foreground shadow-[var(--card-shadow)]"
          : "text-white shadow-[0_18px_34px_-18px_rgba(15,23,42,0.65)]",
      )}
      style={calm ? undefined : { background: fill }}
    >
      {calm ? null : <span className="pointer-events-none absolute -top-10 -right-8 h-28 w-28 rounded-full bg-white/15" aria-hidden />}
      <span
        className={cn(
          "relative flex h-10 w-10 items-center justify-center rounded-xl",
          calm ? "bg-surface-muted text-foreground/55" : "bg-white/18 ring-1 ring-white/30",
        )}
      >
        <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />
      </span>
      <p className={cn("relative mt-4 text-sm font-medium", calm ? "text-foreground/60" : "text-white/80")}>{label}</p>
      <p className="relative mt-1 text-[1.8rem] leading-none font-semibold tracking-tight tabular-nums">{value}</p>
      <p className={cn("relative mt-2 text-xs leading-snug", calm ? "text-foreground/45" : "text-white/75")}>{hint}</p>
    </Link>
  );
}

/** Four live measures, same order on every HR screen: people, money, time, what needs action. */
export function RhSenseStrip({ stats }: { stats: HrDashboardStats }) {
  const pathname = usePathname();
  const att = stats.attendance;
  const marked = att.present + att.absent + att.leave + att.mission;
  const presenceRate = marked ? Math.round(((att.present + att.mission) / marked) * 100) : null;
  const alertCount = stats.alerts.reduce((sum, alert) => sum + alert.count, 0);
  const showDay = pathname === "/rh" || pathname === "/rh/presence";

  return (
    <div className="mb-5 space-y-3">
      {stats.error ? <p className="text-sm text-alert-critical">{stats.error}</p> : null}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card
          href="/rh/employes"
          icon={Users}
          label="Effectif actif"
          value={String(stats.employeesActive)}
          hint={`${stats.employeesTotal} inscrits`}
          fill={FILL.violet}
        />
        <Card
          href="/rh/paie"
          icon={Banknote}
          label="Masse salariale"
          value={formatDa(stats.payrollBase)}
          hint={`Moyenne ${formatDa(stats.averageBase)}`}
          fill={FILL.emerald}
        />
        <Card
          href="/rh/presence"
          icon={Clock}
          label="Présence"
          value={presenceRate === null ? "—" : `${presenceRate} %`}
          hint={att.date ? `${att.present + att.mission} présents` : "Aucun pointage ce mois-ci"}
          fill={FILL.sky}
        />
        <Card
          href="/rh/documents?onglet=contrats"
          icon={alertCount ? CircleAlert : CircleCheck}
          label={alertCount ? "À traiter" : "Rien à traiter"}
          value={alertCount ? String(alertCount) : "0"}
          hint={alertCount ? `${stats.alerts.length} sujet${stats.alerts.length > 1 ? "s" : ""}` : "Contrats et effectifs à jour"}
          fill={FILL.rose}
          calm={!alertCount}
        />
      </div>
      {showDay ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(
            [
              { icon: UserCheck, label: "Présents", value: att.present, fill: FILL.teal },
              { icon: UserX, label: "Absents", value: att.absent, fill: FILL.red },
              { icon: TreePalm, label: "En congé", value: att.leave, fill: FILL.orange },
              { icon: Plane, label: "En mission", value: att.mission, fill: FILL.amber },
            ] as const
          ).map((item) => (
            <Link
              key={item.label}
              href="/rh/presence"
              className="flex items-center gap-3 overflow-hidden rounded-2xl px-4 py-3 text-white shadow-[0_14px_28px_-18px_rgba(15,23,42,0.65)] transition hover:-translate-y-0.5"
              style={{ background: item.fill }}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/18 ring-1 ring-white/25">
                <item.icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />
              </span>
              <span>
                <span className="block text-2xl leading-none font-semibold tabular-nums">{item.value}</span>
                <span className="mt-1 block text-xs text-white/80">{item.label}</span>
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
