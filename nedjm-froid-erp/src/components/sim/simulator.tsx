"use client";

import { useCallback, useDeferredValue, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatDa } from "@/components/rh/bulletin-print";
import { RhAlert } from "@/components/rh/rh-ui";
import { simSelectClass } from "@/components/sim/sim-fields";
import { DocFrame } from "@/components/sim/doc-frame";
import { DocEditor } from "@/components/doc/doc-editor";
import { VarCard, formatSimValue, type SimZone } from "@/components/sim/var-card";
import { VarPicker } from "@/components/sim/var-picker";
import type { SimEmployeeOption } from "@/lib/hr/payroll-simulator-load";
import {
  foldSearch,
  influenceOf,
  type SimFigure,
  type SimOverrides,
  type SimValue,
  type SimVarDef,
} from "@/lib/sim/core";
import { SIM_TARGETS, simTargetMeta, type SimRefOption, type SimTargetId } from "@/lib/sim/targets-meta";
import { runSimulation, simVariables, type SimTargetData } from "@/lib/sim/targets";

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

type Nav = { target: SimTargetId | null; employeeId: string | null; year: number; month: number; ref: string | null };

export function Simulator({
  nav,
  data,
  refs,
  notice,
  employees,
  startEditing = false,
}: {
  nav: Nav;
  data: SimTargetData | null;
  refs: SimRefOption[];
  notice: string | null;
  employees: SimEmployeeOption[];
  startEditing?: boolean;
}) {
  const router = useRouter();
  const go = (patch: Partial<Nav>) => {
    const next = { ...nav, ...patch };
    if (patch.target !== undefined || patch.employeeId !== undefined) next.ref = patch.ref ?? null;
    const qs = new URLSearchParams();
    if (next.target) qs.set("cible", next.target);
    if (next.employeeId) qs.set("employe", next.employeeId);
    qs.set("annee", String(next.year));
    qs.set("mois", String(next.month));
    if (next.ref) qs.set("ref", next.ref);
    router.push(`/simulateur?${qs.toString()}`);
  };
  const meta = simTargetMeta(nav.target);

  return (
    <div className="rh-scope space-y-3">
      <Toolbar nav={nav} refs={refs} employees={employees} go={go} />
      {notice ? <RhAlert tone={data ? "info" : "warning"}>{notice}</RhAlert> : null}
      {!meta ? (
        <TargetGallery onPick={(target) => go({ target })} />
      ) : data ? (
        <Workspace key={`${meta.id}-${nav.employeeId}-${nav.year}-${nav.month}-${nav.ref}`} data={data} startEditing={startEditing} />
      ) : null}
    </div>
  );
}

function TargetGallery({ onPick }: { onPick: (id: SimTargetId) => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/80 bg-surface/60 p-6">
      <p className="text-sm font-semibold">Quel élément voulez-vous tester ?</p>
      <p className="mt-1 text-xs text-foreground/55">
        Cherchez-le dans la barre ci-dessus ou choisissez-le ici, puis ajoutez les variables qui vous intéressent.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {SIM_TARGETS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t.id)}
            className="rounded-xl border border-border/70 bg-surface px-3 py-2.5 text-left transition hover:border-brand/50 hover:bg-brand-muted/30"
          >
            <span className="block text-sm font-medium">{t.label}</span>
            <span className="block text-xs text-foreground/50">
              {t.module} · {t.labelAr}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Toolbar({
  nav,
  refs,
  employees,
  go,
}: {
  nav: Nav;
  refs: SimRefOption[];
  employees: SimEmployeeOption[];
  go: (patch: Partial<Nav>) => void;
}) {
  const meta = simTargetMeta(nav.target);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [employeeQuery, setEmployeeQuery] = useState("");
  const current = employees.find((e) => e.id === nav.employeeId);
  const years = Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - 4 + i);

  const targets = useMemo(() => {
    const tokens = foldSearch(query).split(/\s+/).filter(Boolean);
    return SIM_TARGETS.filter((t) => {
      const text = foldSearch(`${t.label} ${t.labelAr} ${t.module} ${t.keywords}`);
      return tokens.every((tok) => text.includes(tok));
    });
  }, [query]);

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-border/60 bg-surface/80 p-2.5">
      <div className="relative min-w-64 flex-[1.2] text-xs text-foreground/60">
        Élément à tester
        <input
          className={`${simSelectClass} mt-1`}
          placeholder={meta ? `${meta.label} · ${meta.labelAr}` : "Fiche de paie, pointage, congé, mission…"}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          aria-label="Élément à tester"
        />
        {open ? (
          <ul className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border/70 bg-surface p-1 shadow-xl">
            {targets.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setQuery("");
                    setOpen(false);
                    go({ target: t.id });
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-surface-muted ${
                    t.id === nav.target ? "bg-brand-muted/40" : ""
                  }`}
                >
                  <span>
                    {t.label} <span className="text-foreground/45">· {t.labelAr}</span>
                  </span>
                  <span className="text-[11px] text-foreground/45">{t.module}</span>
                </button>
              </li>
            ))}
            {!targets.length ? <li className="px-3 py-3 text-center text-xs text-foreground/50">Aucun élément.</li> : null}
          </ul>
        ) : null}
      </div>
      {meta ? (
        <label className="min-w-56 flex-1 text-xs text-foreground/60">
          Salarié{meta.employee === "optional" ? " (vide = scénario libre)" : ""}
          <input
            list="sim-employees"
            className={`${simSelectClass} mt-1`}
            placeholder={current ? `${current.matricule} · ${current.name}` : "Matricule ou nom…"}
            value={employeeQuery}
            onChange={(e) => {
              setEmployeeQuery(e.target.value);
              const match = employees.find((emp) => `${emp.matricule} · ${emp.name}` === e.target.value);
              if (match) go({ employeeId: match.id });
            }}
          />
          <datalist id="sim-employees">
            {employees.map((e) => (
              <option key={e.id} value={`${e.matricule} · ${e.name}`} />
            ))}
          </datalist>
        </label>
      ) : null}
      {meta?.employee === "optional" && nav.employeeId ? (
        <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => go({ employeeId: null })}>
          Scénario libre
        </Button>
      ) : null}
      {meta?.period ? (
        <>
          <label className="text-xs text-foreground/60">
            Mois
            <select className={`${simSelectClass} mt-1 w-32`} value={nav.month} onChange={(e) => go({ month: Number(e.target.value) })}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-foreground/60">
            Année
            <select className={`${simSelectClass} mt-1 w-24`} value={nav.year} onChange={(e) => go({ year: Number(e.target.value) })}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}
      {meta?.ref && nav.employeeId ? (
        <label className="min-w-56 flex-1 text-xs text-foreground/60">
          {meta.ref}
          <select
            className={`${simSelectClass} mt-1`}
            value={nav.ref ?? ""}
            onChange={(e) => go({ ref: e.target.value || null })}
          >
            {meta.id !== "contrat_travail" ? <option value="">Nouveau (simulé)</option> : null}
            {refs.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

type Layout = Record<SimZone, string[]>;
const EMPTY_LAYOUT: Layout = { left: [], right: [], bottom: [] };
const LAYOUT_EVENT = "nf-sim-layout";

function subscribeLayout(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(LAYOUT_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(LAYOUT_EVENT, callback);
  };
}

function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parseLayout(raw: string | null): Layout {
  if (!raw) return EMPTY_LAYOUT;
  try {
    const v = JSON.parse(raw) as Partial<Layout>;
    const list = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is string => typeof i === "string") : []);
    return { left: list(v.left), right: list(v.right), bottom: list(v.bottom) };
  } catch {
    return EMPTY_LAYOUT;
  }
}

/** Panels chosen by the user, kept per element in this browser. */
function useStoredLayout(key: string): [Layout, (next: Layout) => void] {
  const raw = useSyncExternalStore(subscribeLayout, () => readStorage(key), () => null);
  const layout = useMemo(() => parseLayout(raw), [raw]);
  const save = useCallback(
    (next: Layout) => {
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // storage unavailable: the layout lasts until the next render only
      }
      window.dispatchEvent(new Event(LAYOUT_EVENT));
    },
    [key],
  );
  return [layout, save];
}

function figureRecord(figures: SimFigure[]) {
  return Object.fromEntries(figures.map((f) => [f.key, f.value]));
}

function sameValue(a: SimValue | undefined, b: SimValue | undefined) {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-9;
  return a === b;
}

function Workspace({ data, startEditing }: { data: SimTargetData; startEditing: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(startEditing);
  const env = useMemo(() => ({ origin: typeof window === "undefined" ? "" : window.location.origin }), []);
  const defs = useMemo(() => simVariables(data, env), [data, env]);
  const defMap = useMemo(() => new Map(defs.map((d) => [d.id, d])), [defs]);
  const [overrides, setOverrides] = useState<SimOverrides>({});
  const deferred = useDeferredValue(overrides);
  const run = useMemo(() => runSimulation(data, defMap, deferred, env), [data, defMap, deferred, env]);
  const initialFigures = useMemo(
    () => figureRecord(runSimulation(data, defMap, {}, env).output.figures),
    [data, defMap, env],
  );
  const [reference, setReference] = useState<Record<string, number>>(initialFigures);
  const [layout, setLayout] = useStoredLayout(`nf.sim.layout.${data.target}`);
  const [picker, setPicker] = useState<SimZone | null>(null);

  const placed = useMemo(
    () => new Set([...layout.left, ...layout.right, ...layout.bottom].filter((id) => defMap.has(id))),
    [layout, defMap],
  );
  const influence = useCallback(
    (id: string) => {
      const inf = influenceOf(run.ctx.reads, id);
      return { kind: inf.kind, via: inf.via.map((v) => defMap.get(v)?.label ?? v) };
    },
    [run, defMap],
  );

  const valueOf = (def: SimVarDef): SimValue =>
    Object.hasOwn(overrides, def.id)
      ? overrides[def.id]
      : def.derived
        ? (run.ctx.derivedValues.get(def.id) ?? def.base)
        : def.base;

  const setValue = (def: SimVarDef, value: SimValue) =>
    setOverrides((prev) => {
      const next = { ...prev };
      if (!def.derived && sameValue(value, def.base)) delete next[def.id];
      else next[def.id] = value;
      return next;
    });
  const resetValue = (id: string) =>
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  const without = (l: Layout, ids: ReadonlySet<string>): Layout => ({
    left: l.left.filter((x) => !ids.has(x)),
    right: l.right.filter((x) => !ids.has(x)),
    bottom: l.bottom.filter((x) => !ids.has(x)),
  });
  const addTo = (zone: SimZone, ids: string[]) => {
    const fresh = ids.filter((id) => !placed.has(id));
    const base = without(layout, new Set(fresh));
    setLayout({ ...base, [zone]: [...base[zone], ...fresh] });
  };
  const moveTo = (id: string, zone: SimZone) => {
    const base = without(layout, new Set([id]));
    setLayout({ ...base, [zone]: [...base[zone], id] });
  };
  const remove = (id: string) => setLayout(without(layout, new Set([id])));

  const changedIds = Object.keys(overrides).filter((id) => defMap.has(id));
  const hidden = changedIds.filter((id) => !placed.has(id));
  const unofficial = changedIds.some((id) => defMap.get(id)?.official);
  const output = run.output;

  const zone = (z: SimZone, title: string) => {
    const ids = layout[z].filter((id) => defMap.has(id));
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 px-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground/45">
            {title} · {ids.length}
          </p>
          <button type="button" onClick={() => setPicker(z)} className="text-xs font-medium text-brand hover:underline">
            + Variable
          </button>
        </div>
        {ids.length ? (
          <div className={z === "bottom" ? "grid gap-2 sm:grid-cols-2 xl:grid-cols-4" : "space-y-2"}>
            {ids.map((id) => {
              const def = defMap.get(id)!;
              const forced = Object.hasOwn(overrides, id);
              return (
                <VarCard
                  key={id}
                  def={def}
                  zone={z}
                  value={valueOf(def)}
                  changed={forced}
                  forced={forced}
                  influence={influence(id)}
                  onChange={(v) => setValue(def, v)}
                  onReset={() => resetValue(id)}
                  onMove={(to) => moveTo(id, to)}
                  onRemove={() => remove(id)}
                />
              );
            })}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPicker(z)}
            className="flex w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/80 px-3 py-6 text-center text-xs text-foreground/50 hover:border-brand/50 hover:text-brand"
          >
            <span className="text-lg leading-none">＋</span>
            Chercher et ajouter une variable
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FiguresStrip figures={output.figures} reference={reference} />
        <div className="flex gap-2">
          {output.doc && !editing ? (
            <Button variant="secondary" className="h-8 px-3 text-xs" onClick={() => setEditing(true)}>
              Éditer la mise en page
            </Button>
          ) : null}
          <Button variant="secondary" className="h-8 px-3 text-xs" onClick={() => setReference(figureRecord(output.figures))}>
            Figer comme référence
          </Button>
          <Button
            variant="ghost"
            className="h-8 px-3 text-xs"
            disabled={!changedIds.length}
            onClick={() => {
              setOverrides({});
              setReference(initialFigures);
            }}
          >
            Tout rétablir
          </Button>
        </div>
      </div>

      {unofficial ? (
        <RhAlert tone="warning">
          Valeurs légales modifiées dans cette simulation (valeurs non officielles). Rien n&apos;est enregistré.
        </RhAlert>
      ) : null}
      {hidden.length ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
          <span className="font-medium">Modifiées hors panneaux :</span>
          {hidden.map((id) => {
            const def = defMap.get(id)!;
            return (
              <span key={id} className="inline-flex items-center gap-1 rounded-md bg-white/70 px-1.5 py-0.5 dark:bg-black/20">
                {def.label} = {formatSimValue(def, overrides[id])}
                <button type="button" className="text-brand hover:underline" onClick={() => addTo("bottom", [id])}>
                  afficher
                </button>
                <button type="button" className="text-foreground/60 hover:text-red-600" onClick={() => resetValue(id)} aria-label="Rétablir">
                  ↺
                </button>
              </span>
            );
          })}
        </div>
      ) : null}

      {editing && output.doc ? (
        <div className="grid gap-3 xl:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="space-y-4 xl:max-h-[calc(100dvh-12rem)] xl:overflow-y-auto xl:pr-1">
            {zone("left", "Gauche")}
            {zone("right", "Droite")}
          </aside>
          <section className="flex min-h-[calc(100dvh-12rem)] flex-col gap-2">
            <DocEditor
              docType={output.doc.type}
              data={output.doc.data}
              pageWidth={output.pageWidth}
              onClose={() => setEditing(false)}
              onApproved={() => router.refresh()}
            />
          </section>
        </div>
      ) : (
      <div className="grid gap-3 xl:h-[calc(100dvh-19rem)] xl:min-h-[36rem] xl:grid-cols-[20rem_minmax(0,1fr)_20rem]">
        <aside className="xl:overflow-y-auto xl:pr-1">{zone("left", "Gauche")}</aside>
        <section className="flex min-h-[36rem] flex-col gap-2 xl:min-h-0">
          {output.html ? (
            <DocFrame html={output.html} pageWidth={output.pageWidth} title={simTargetMeta(data.target)?.label ?? "Document"} />
          ) : null}
          {output.warnings.length ? (
            <ul className="max-h-24 shrink-0 space-y-0.5 overflow-y-auto rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
              {output.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
        </section>
        <aside className="xl:overflow-y-auto xl:pr-1">{zone("right", "Droite")}</aside>
      </div>
      )}
      {zone("bottom", "Bas")}

      {picker ? (
        <VarPicker
          zone={picker}
          defs={defs}
          placed={placed}
          influence={influence}
          onAdd={(ids) => {
            addTo(picker, ids);
            if (ids.length > 1) setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </div>
  );
}

function formatFigure(f: SimFigure, value: number) {
  if (f.format === "money") return formatDa(value);
  if (f.format === "days") return `${Math.round(value * 100) / 100} j`;
  return String(Math.round(value * 100) / 100);
}

function FiguresStrip({ figures, reference }: { figures: SimFigure[]; reference: Record<string, number> }) {
  if (!figures.length) return <div />;
  return (
    <div className="flex flex-1 flex-wrap gap-2">
      {figures.map((f) => {
        const delta = f.value - (reference[f.key] ?? f.value);
        const moved = Math.abs(delta) >= 0.005;
        const tone = !moved
          ? "text-foreground/40"
          : f.goodWhenUp
            ? delta > 0
              ? "text-emerald-600"
              : "text-red-600"
            : "text-foreground/70";
        const sign = !moved ? "±0" : `${delta > 0 ? "+" : "−"}${formatFigure(f, Math.abs(delta))}`;
        return (
          <div
            key={f.key}
            className={`min-w-[8.5rem] flex-1 rounded-xl border px-3 py-2 transition-colors ${
              moved ? "border-brand/40 bg-brand-muted/40" : "border-border/60 bg-surface"
            }`}
          >
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground/50">{f.label}</p>
            <p className={`font-display tabular-nums ${f.emphasis ? "text-lg font-semibold" : "text-base font-medium"}`}>
              {formatFigure(f, f.value)}
            </p>
            <p className={`text-[11px] tabular-nums ${tone}`}>{sign} vs réf.</p>
          </div>
        );
      })}
    </div>
  );
}
