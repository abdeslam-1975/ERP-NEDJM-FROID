"use client";

import { useId, useMemo, useState } from "react";
import { Command } from "cmdk";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ComboboxOption = { value: string; label: string; hint?: string; keywords?: string };

/**
 * Searchable list for long choices (employees, clients, sites). Same contract as a native select:
 * a string value and onChange(value); "" means nothing chosen.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Choisir…",
  searchPlaceholder = "Rechercher…",
  emptyText = "Aucun résultat",
  allowEmpty = true,
  disabled,
  className,
  id,
}: {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  allowEmpty?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  function choose(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          disabled={disabled}
          className={cn(
            "mt-1.5 flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-border/80 bg-surface px-3.5 text-left text-sm text-foreground outline-none transition focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-brand/10 disabled:opacity-50",
            className,
          )}
        >
          <span className={cn("truncate", !selected && "text-foreground/40")}>{selected?.label ?? (value || placeholder)}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-foreground/40" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent id={listId} className="w-(--radix-popover-trigger-width) min-w-64 p-0">
        <Command
          filter={(itemValue, search) => (itemValue.toLocaleLowerCase("fr").includes(search.toLocaleLowerCase("fr")) ? 1 : 0)}
        >
          <div className="flex items-center gap-2 border-b border-border/60 px-3">
            <Search className="size-4 text-foreground/40" aria-hidden />
            <Command.Input
              placeholder={searchPlaceholder}
              className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-foreground/40"
            />
          </div>
          <Command.List className="max-h-72 overflow-y-auto p-1">
            <Command.Empty className="px-3 py-6 text-center text-sm text-foreground/50">{emptyText}</Command.Empty>
            {allowEmpty ? (
              <Command.Item
                value="—"
                onSelect={() => choose("")}
                className="flex cursor-default items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground/50 data-[selected=true]:bg-brand-muted"
              >
                —
              </Command.Item>
            ) : null}
            {options.map((o) => (
              <Command.Item
                key={o.value}
                value={`${o.label} ${o.hint ?? ""} ${o.keywords ?? ""} ${o.value}`}
                onSelect={() => choose(o.value)}
                className="flex cursor-default items-center gap-2 rounded-lg px-2.5 py-2 text-sm data-[selected=true]:bg-brand-muted"
              >
                <Check className={cn("size-4 shrink-0 text-brand", o.value === value ? "opacity-100" : "opacity-0")} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.hint ? <span className="shrink-0 text-xs text-foreground/45">{o.hint}</span> : null}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
