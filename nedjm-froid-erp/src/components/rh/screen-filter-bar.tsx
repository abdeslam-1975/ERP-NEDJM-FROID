"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { applyScreenFilter, loadScreenFilter, type FilterAction } from "@/lib/actions/screen-filters";
import {
  applyFilter,
  emptyFilterHint,
  filterCountLabel,
  resolveFilter,
  suggestFilters,
  suggestionsAreAmbiguous,
  type FilterChip,
  type FilterRow,
  type FilterSnapshot,
} from "@/lib/hr/screen-filter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const EMPTY: FilterSnapshot = {
  personalChips: [],
  personalAt: null,
  dismissedSharedAt: null,
  sharedChips: null,
  sharedAt: null,
  isSuperAdmin: false,
};

export function useScreenFilter<T>({
  screen,
  rows,
  describe,
  initialText = "",
}: {
  screen: string;
  rows: T[];
  describe: (row: T) => FilterRow;
  initialText?: string;
}) {
  const [snapshot, setSnapshot] = useState<FilterSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [target, setTarget] = useState<"self" | "all">("self");
  const [askNormal, setAskNormal] = useState(false);
  const seeded = useRef(false);
  const listId = useId();
  const described = rows.map((row) => describe(row));
  const view = snapshot ? resolveFilter(snapshot) : { source: "normal" as const, chips: [] as FilterChip[] };
  const filtered = snapshot ? applyFilter(rows, described, view.chips) : rows;
  const suggestions = open ? suggestFilters(draft, described) : [];
  const ambiguous = suggestionsAreAmbiguous(draft, suggestions);

  useEffect(() => {
    let cancelled = false;
    loadScreenFilter(screen).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        setSnapshot(EMPTY);
        return;
      }
      setSnapshot(result.data);
      if (resolveFilter(result.data).source === "shared") setTarget("all");
    });
    return () => {
      cancelled = true;
    };
  }, [screen]);

  useEffect(() => {
    if (!snapshot || seeded.current) return;
    seeded.current = true;
    const text = initialText.trim();
    if (!text || resolveFilter(snapshot).chips.length > 0) return;
    const chip: FilterChip = { id: "recherche", kind: "text", label: text, value: text };
    void commit("personal", [chip]);
    // The landing search is applied once, after the saved filter is known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, initialText]);

  async function commit(action: FilterAction, chips?: FilterChip[]) {
    const previous = snapshot;
    const result = await applyScreenFilter({ screen, action, chips });
    if (!result.ok) {
      setError(result.error);
      if (previous) setSnapshot(previous);
      return;
    }
    setError(null);
    setSnapshot(result.data);
    setAskNormal(false);
  }

  function write(next: FilterChip[]) {
    const audience = target === "all" && snapshot?.isSuperAdmin ? "all" : "self";
    if (audience === "all") {
      void commit(next.length ? "publish" : "clear-shared", next);
      return;
    }
    void commit(next.length ? "personal" : "clear-personal", next);
  }

  function addChip(chip: Omit<FilterChip, "id">) {
    const exists = view.chips.some(
      (item) => item.kind === chip.kind && item.value === chip.value && item.field === chip.field,
    );
    if (exists) {
      setDraft("");
      setOpen(false);
      return;
    }
    write([...view.chips, { ...chip, id: `c${Date.now().toString(36)}` }]);
    setDraft("");
    setOpen(false);
    setHighlight(-1);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((index) => Math.min(suggestions.length - 1, index + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) => Math.max(-1, index - 1));
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      setAskNormal(false);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (highlight >= 0 && suggestions[highlight]) addChip(suggestions[highlight].chip);
      return;
    }
    if (event.key === "Backspace" && draft === "" && view.chips.length) {
      event.preventDefault();
      write(view.chips.slice(0, -1));
    }
  }

  function onNormal() {
    if (view.source === "shared" && snapshot?.isSuperAdmin) {
      setAskNormal(true);
      return;
    }
    void commit(view.source === "shared" ? "dismiss" : "clear-personal");
  }

  function choose(audience: "self" | "all") {
    setTarget(audience);
    if (!view.chips.length) return;
    void commit(audience === "all" ? "publish" : "personal", view.chips);
  }

  const active = view.chips.length > 0;
  const hint = active ? emptyFilterHint(described, view.chips) : null;

  const bar = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start gap-2">
        <div className="relative min-w-64 flex-1 sm:max-w-xl">
          <label className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground/40" aria-hidden />
            <input
              value={draft}
              role="combobox"
              aria-expanded={open && suggestions.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              placeholder="Filtrer ou rechercher…"
              onChange={(event) => {
                setDraft(event.target.value);
                setOpen(true);
                setHighlight(suggestionsAreAmbiguous(event.target.value, suggestFilters(event.target.value, described)) ? -1 : 0);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={onKeyDown}
              className="h-10 w-full rounded-xl border border-border/80 bg-surface pr-3 pl-9 text-sm outline-none transition placeholder:text-foreground/40 focus:border-brand focus:ring-4 focus:ring-brand/10"
            />
          </label>
          {open && suggestions.length > 0 ? (
            <ul
              id={listId}
              role="listbox"
              className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-border/70 bg-surface p-1 shadow-lg"
            >
              {suggestions.map((item, index) => (
                <li key={item.id} role="option" aria-selected={index === highlight}>
                  <button
                    type="button"
                    className={cn(
                      "w-full rounded-lg px-3 py-2 text-left text-sm",
                      index === highlight ? "bg-brand-muted text-foreground" : "hover:bg-surface-muted",
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => addChip(item.chip)}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <p className="pt-2 text-sm text-foreground/60 tabular-nums">{filterCountLabel(filtered.length, rows.length)}</p>
        <Button type="button" variant="secondary" disabled={!active && view.source !== "shared"} onClick={onNormal}>
          État normal
        </Button>
        {snapshot?.isSuperAdmin ? (
          <>
            <Button type="button" variant={target === "self" ? "primary" : "secondary"} onClick={() => choose("self")}>
              Pour mon compte
            </Button>
            <Button type="button" variant={target === "all" ? "primary" : "secondary"} onClick={() => choose("all")}>
              Pour tout le monde
            </Button>
          </>
        ) : null}
      </div>
      {view.chips.length ? (
        <div className="flex flex-wrap gap-1.5">
          {view.chips.map((chip) => (
            <span
              key={chip.id}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium",
                chip.kind === "text" ? "bg-surface-muted text-foreground/80" : "bg-brand-muted text-brand",
              )}
            >
              {chip.label}
              <button
                type="button"
                aria-label={`Retirer ${chip.label}`}
                className="rounded-full p-0.5 hover:bg-black/5"
                onClick={() => write(view.chips.filter((item) => item.id !== chip.id))}
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {view.source === "shared" ? (
        <p className="text-xs text-foreground/55">Filtre appliqué pour tout le monde.</p>
      ) : null}
      {askNormal ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-surface px-3 py-2">
          <p className="text-sm">Revenir à l&apos;état normal</p>
          <Button type="button" variant="secondary" onClick={() => void commit("dismiss")}>
            Pour mon compte
          </Button>
          <Button type="button" variant="secondary" onClick={() => void commit("clear-shared")}>
            Pour tout le monde
          </Button>
        </div>
      ) : null}
      {ambiguous && open ? (
        <p className="text-xs text-foreground/55">Choisissez le sens de {draft.trim()}.</p>
      ) : null}
      {error ? <p className="text-xs font-medium text-alert-critical">{error}</p> : null}
      {hint ? <p className="text-sm text-foreground/60">{hint}</p> : null}
    </div>
  );

  return {
    rows: filtered,
    active,
    emptyHint: hint,
    text: view.chips
      .filter((chip) => chip.kind === "text")
      .map((chip) => chip.value)
      .join(" "),
    signature: view.chips.map((chip) => `${chip.kind}:${chip.field ?? ""}:${chip.value}`).join("|"),
    source: view.source,
    bar,
  };
}
