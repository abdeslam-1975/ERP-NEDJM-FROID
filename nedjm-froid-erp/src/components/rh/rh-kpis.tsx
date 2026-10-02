"use client";

import { Plane, TreePalm, UserCheck, UserX, type LucideIcon } from "lucide-react";
import type { AttendanceSnapshot } from "@/lib/hr/dashboard-stats";
import { IconTile, useCountUp } from "@/components/rh/rh-hub";
import { RH_CARD } from "@/components/rh/rh-ui";
import { cn } from "@/lib/utils";

function Kpi({ icon, color, label, value }: { icon: LucideIcon; color: string; label: string; value: number }) {
  const shown = useCountUp(value);
  return (
    <div className={cn(RH_CARD, "ui-lift flex items-center gap-4 p-5")}>
      <IconTile icon={icon} className="h-11 w-11 rounded-2xl" style={{ background: `${color}17`, color }} />
      <div>
        <p className="text-sm text-foreground/50">{label}</p>
        <p className="text-2xl font-semibold tabular-nums text-foreground">{shown}</p>
      </div>
    </div>
  );
}

/** Present / absent / on leave / on mission on the latest pointage day. */
export function AttendanceKpis({ snapshot }: { snapshot: AttendanceSnapshot }) {
  const day = snapshot.date
    ? new Date(`${snapshot.date}T00:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
    : null;
  return (
    <div className="space-y-2">
      <div className="ui-stagger grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi icon={UserCheck} color="#22c55e" label="Présents" value={snapshot.present} />
        <Kpi icon={UserX} color="#ef4444" label="Absents" value={snapshot.absent} />
        <Kpi icon={TreePalm} color="#f59e0b" label="En congé" value={snapshot.leave} />
        <Kpi icon={Plane} color="#3b6ef5" label="En mission" value={snapshot.mission} />
      </div>
      <p className="text-xs text-foreground/45 first-letter:uppercase">
        {day ? `Dernier jour pointé : ${day}` : "Aucun pointage enregistré ces 30 derniers jours"}
      </p>
    </div>
  );
}
