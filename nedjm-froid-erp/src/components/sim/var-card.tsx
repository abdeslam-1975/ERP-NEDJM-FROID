"use client";

import { formatDa } from "@/components/rh/bulletin-print";
import { NumInput, ResetButton, simSelectClass } from "@/components/sim/sim-fields";
import type { SimInfluenceKind, SimValue, SimVarDef } from "@/lib/sim/core";

export type SimZone = "left" | "right" | "bottom";

function frDate(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso || "—";
}

export function formatSimValue(def: SimVarDef, value: SimValue | undefined): string {
  if (value === undefined || value === "") return "—";
  switch (def.kind) {
    case "money":
      return `${formatDa(Number(value))} DA`;
    case "percent":
      return `${Math.round(Number(value) * 1_000_000) / 10_000} %`;
    case "days":
      return `${value} j`;
    case "hours":
      return `${value} h`;
    case "toggle":
      return value === true ? "Oui" : "Non";
    case "date":
      return frDate(String(value));
    case "select":
      return def.options?.find((o) => o.value === String(value))?.label ?? String(value);
    case "longtext": {
      const s = String(value);
      return s.length > 60 ? `${s.slice(0, 60)}…` : s;
    }
    default:
      return String(value);
  }
}

export function InfluenceBadge({ kind, via }: { kind: SimInfluenceKind; via: string[] }) {
  if (kind === "direct") {
    return (
      <span className="shrink-0 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
        Direct
      </span>
    );
  }
  if (kind === "via") {
    return (
      <span
        className="max-w-[9rem] shrink-0 truncate rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300"
        title={`Agit via : ${via.join(", ")}`}
      >
        via {via[0]}
        {via.length > 1 ? ` +${via.length - 1}` : ""}
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-md bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground/45">
      Sans effet
    </span>
  );
}

function ValueEditor({
  def,
  value,
  onChange,
}: {
  def: SimVarDef;
  value: SimValue;
  onChange: (value: SimValue) => void;
}) {
  const label = def.label;
  switch (def.kind) {
    case "money":
    case "number":
    case "days":
    case "hours": {
      const suffix = { money: "DA", number: "", days: "j", hours: "h" }[def.kind];
      return (
        <div className="flex items-center gap-1">
          <NumInput value={Number(value) || 0} onChange={onChange} ariaLabel={label} />
          {suffix ? <span className="w-6 shrink-0 text-[11px] text-foreground/50">{suffix}</span> : null}
        </div>
      );
    }
    case "percent": {
      const pct = Math.round((Number(value) || 0) * 1_000_000) / 10_000;
      return (
        <div className="flex items-center gap-1">
          <NumInput
            value={pct}
            decimals={4}
            onChange={(v) => onChange(Math.round(v * 10_000) / 1_000_000)}
            ariaLabel={label}
          />
          <span className="w-6 shrink-0 text-[11px] text-foreground/50">%</span>
        </div>
      );
    }
    case "toggle":
      return (
        <label className="flex h-8 items-center justify-end gap-2 text-xs text-foreground/70">
          {value === true ? "Oui" : "Non"}
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 accent-brand"
            aria-label={label}
          />
        </label>
      );
    case "date":
      return (
        <input
          type="date"
          aria-label={label}
          className={simSelectClass}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "select": {
      const options = def.options ?? [];
      const current = String(value ?? "");
      return (
        <select aria-label={label} className={simSelectClass} value={current} onChange={(e) => onChange(e.target.value)}>
          {!options.some((o) => o.value === current) ? <option value={current}>{current || "—"}</option> : null}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    case "longtext":
      return (
        <textarea
          aria-label={label}
          rows={4}
          dir="auto"
          className="w-full rounded-lg border border-border/80 bg-surface px-2.5 py-1.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    default:
      return (
        <input
          aria-label={label}
          dir="auto"
          className={simSelectClass}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

const MOVES: { zone: SimZone; icon: string; title: string }[] = [
  { zone: "left", icon: "⇤", title: "Déplacer à gauche" },
  { zone: "bottom", icon: "⤓", title: "Déplacer en bas" },
  { zone: "right", icon: "⇥", title: "Déplacer à droite" },
];

export function VarCard({
  def,
  zone,
  value,
  changed,
  forced,
  influence,
  onChange,
  onReset,
  onMove,
  onRemove,
}: {
  def: SimVarDef;
  zone: SimZone;
  value: SimValue;
  changed: boolean;
  forced: boolean;
  influence: { kind: SimInfluenceKind; via: string[] };
  onChange: (value: SimValue) => void;
  onReset: () => void;
  onMove: (zone: SimZone) => void;
  onRemove: () => void;
}) {
  const wide = def.kind === "longtext";
  return (
    <div
      className={`group rounded-xl border bg-surface px-3 py-2 transition-colors ${
        changed ? "border-amber-300/80 dark:border-amber-700/60" : "border-border/70"
      }`}
    >
      <div className="flex items-start gap-1.5">
        {changed ? <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-label="modifiée" /> : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground/85" title={def.label}>
            {def.label}
          </p>
          <p className="truncate text-[10.5px] text-foreground/45" title={def.hint ?? def.group}>
            {def.group}
            {def.hint ? ` · ${def.hint}` : ""}
          </p>
        </div>
        <InfluenceBadge kind={influence.kind} via={influence.via} />
        {changed ? <ResetButton label={def.label} onClick={onReset} /> : null}
        <div className="hidden items-center group-hover:flex group-focus-within:flex">
          {MOVES.filter((m) => m.zone !== zone).map((m) => (
            <button
              key={m.zone}
              type="button"
              title={m.title}
              aria-label={m.title}
              onClick={() => onMove(m.zone)}
              className="inline-flex h-5 w-5 items-center justify-center rounded-md text-[12px] text-foreground/45 hover:bg-surface-muted hover:text-foreground"
            >
              {m.icon}
            </button>
          ))}
        </div>
        <button
          type="button"
          title="Retirer du panneau"
          aria-label={`Retirer ${def.label}`}
          onClick={onRemove}
          className="inline-flex h-5 w-5 items-center justify-center rounded-md text-[11px] text-foreground/35 hover:bg-red-50 hover:text-red-600"
        >
          ✕
        </button>
      </div>
      <div className={`mt-1.5 ${wide ? "" : "grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-2"}`}>
        {wide ? null : (
          <p className="truncate text-[10.5px] text-foreground/45">
            {def.derived ? (forced ? "valeur forcée · " : "calculée · ") : ""}ERP : {formatSimValue(def, def.base)}
          </p>
        )}
        <ValueEditor def={def} value={value} onChange={onChange} />
        {wide ? (
          <p className="mt-1 truncate text-[10.5px] text-foreground/45">ERP : {formatSimValue(def, def.base)}</p>
        ) : null}
      </div>
    </div>
  );
}
