"use client";

import { useMemo, useState } from "react";
import { InfluenceBadge, formatSimValue, type SimZone } from "@/components/sim/var-card";
import { foldSearch, type SimInfluenceKind, type SimVarDef } from "@/lib/sim/core";

const ZONE_LABELS: Record<SimZone, string> = { left: "à gauche", right: "à droite", bottom: "en bas" };
const RANK: Record<SimInfluenceKind, number> = { direct: 0, via: 1, none: 2 };
const LIMIT = 80;

export function VarPicker({
  zone,
  defs,
  placed,
  influence,
  onAdd,
  onClose,
}: {
  zone: SimZone;
  defs: SimVarDef[];
  placed: ReadonlySet<string>;
  influence: (id: string) => { kind: SimInfluenceKind; via: string[] };
  onAdd: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [onlyEffective, setOnlyEffective] = useState(false);
  const [group, setGroup] = useState("");

  const groups = useMemo(() => [...new Set(defs.map((d) => d.group))], [defs]);
  const matches = useMemo(() => {
    const tokens = foldSearch(query).split(/\s+/).filter(Boolean);
    return defs
      .filter((d) => !placed.has(d.id))
      .filter((d) => !group || d.group === group)
      .map((d) => ({ def: d, inf: influence(d.id) }))
      .filter(({ inf }) => !onlyEffective || inf.kind !== "none")
      .filter(({ def }) => {
        if (!tokens.length) return true;
        const text = foldSearch(`${def.label} ${def.group} ${def.id} ${def.keywords ?? ""} ${def.hint ?? ""}`);
        return tokens.every((t) => text.includes(t));
      })
      .sort((a, b) => RANK[a.inf.kind] - RANK[b.inf.kind]);
  }, [defs, placed, group, onlyEffective, query, influence]);

  const shown = matches.slice(0, LIMIT);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[10vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Ajouter une variable"
    >
      <div className="flex max-h-[75vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border/70 bg-surface shadow-2xl">
        <div className="space-y-2 border-b border-border/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Ajouter une variable {ZONE_LABELS[zone]}</p>
            <button type="button" onClick={onClose} className="text-xs text-foreground/50 hover:text-foreground">
              Fermer (Échap)
            </button>
          </div>
          <input
            autoFocus
            className="h-9 w-full rounded-lg border border-border/80 bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
            placeholder="Chercher : SNMG, panier, IRG, 12/09, date de retour, article…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              className="h-7 rounded-lg border border-border/80 bg-surface px-2"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              aria-label="Groupe"
            >
              <option value="">Tous les groupes</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-foreground/70">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-brand"
                checked={onlyEffective}
                onChange={(e) => setOnlyEffective(e.target.checked)}
              />
              Seulement celles qui ont un effet
            </label>
            <span className="ml-auto text-foreground/45">
              {matches.length} résultat{matches.length > 1 ? "s" : ""}
            </span>
            {matches.length > 1 ? (
              <button
                type="button"
                className="font-medium text-brand hover:underline"
                onClick={() => onAdd(matches.map((m) => m.def.id))}
              >
                Tout ajouter
              </button>
            ) : null}
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {shown.map(({ def, inf }) => (
            <li key={def.id}>
              <button
                type="button"
                onClick={() => onAdd([def.id])}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-surface-muted"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{def.label}</span>
                  <span className="block truncate text-[11px] text-foreground/45">
                    {def.group} · ERP : {formatSimValue(def, def.base)}
                    {def.official ? " · valeur légale" : ""}
                  </span>
                </span>
                <InfluenceBadge kind={inf.kind} via={inf.via} />
                <span className="text-base text-brand">＋</span>
              </button>
            </li>
          ))}
          {!shown.length ? <li className="px-3 py-6 text-center text-xs text-foreground/50">Aucune variable.</li> : null}
          {matches.length > LIMIT ? (
            <li className="px-3 py-2 text-center text-[11px] text-foreground/45">
              {matches.length - LIMIT} autres : affinez la recherche.
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
