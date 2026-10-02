"use client";

import { ChevronsUpDown, X } from "lucide-react";
import type { SalaryRubrique } from "@/lib/actions/hr-salary";
import { sortBySalaryClass } from "@/lib/hr/payroll-calc";
import {
  VALUE_MODES,
  applyValueMode,
  valueModeSelectValue,
  valueSuffix,
} from "@/lib/hr/salary-value-mode";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SALARY_CLASSES, type SelectedSalaryLine } from "@/components/rh/contract-salary-fields";
import { rhInput } from "@/components/rh/rh-ui";

const PICKABLE_CLASSES = SALARY_CLASSES.filter((c) => c.id !== "5");

export function ContractRubriquesField({
  rubriques,
  selected,
  onChange,
}: {
  rubriques: SalaryRubrique[];
  selected: Record<string, SelectedSalaryLine>;
  onChange: (next: Record<string, SelectedSalaryLine>) => void;
}) {
  const lines = sortBySalaryClass(rubriques.filter((r) => selected[r.id]));

  function toggle(r: SalaryRubrique, checked: boolean) {
    const next = { ...selected };
    if (checked) next[r.id] = { amount: String(r.default_amount || 0), unit: r.unit };
    else delete next[r.id];
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-border/80 bg-surface px-3.5 text-left text-sm outline-none transition focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-brand/10"
          >
            <span className={lines.length ? "font-medium" : "text-foreground/55"}>
              {lines.length ? `${lines.length} rubrique${lines.length > 1 ? "s" : ""} choisie${lines.length > 1 ? "s" : ""}` : "Choisir les rubriques…"}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-foreground/40" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-64">
          {PICKABLE_CLASSES.map((cls) => {
            const ofClass = sortBySalaryClass(
              rubriques.filter((r) => r.is_active && r.category === cls.id && r.apply_scope !== "site"),
            );
            const count = ofClass.filter((r) => selected[r.id]).length;
            return (
              <DropdownMenuSub key={cls.id}>
                <DropdownMenuSubTrigger>
                  <span className="font-semibold">CLASSE {cls.id}</span>
                  <span className="text-xs text-foreground/65">{cls.fr}</span>
                  {count ? (
                    <span className="rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">{count}</span>
                  ) : null}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
                  {ofClass.length ? (
                    ofClass.map((r) => (
                      <DropdownMenuCheckboxItem
                        key={r.id}
                        checked={Boolean(selected[r.id])}
                        onCheckedChange={(checked) => toggle(r, checked === true)}
                        onSelect={(e) => e.preventDefault()}
                      >
                        <span className="font-mono text-xs text-foreground/70">{r.code}</span>
                        <span className="truncate">{r.label_fr}</span>
                      </DropdownMenuCheckboxItem>
                    ))
                  ) : (
                    <p className="px-2.5 py-2 text-sm text-foreground/50">Aucune rubrique dans cette classe.</p>
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {!lines.length ? (
        <p className="rounded-xl border border-dashed border-border/80 px-4 py-5 text-center text-[13px] text-foreground/60">
          Aucune rubrique choisie. Ouvrez la liste et cochez les rubriques par classe.
        </p>
      ) : null}
      {lines.length ? (
        <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-surface">
          {lines.map((r) => {
            const line = selected[r.id];
            return (
              <div key={r.id} className="grid items-center gap-2 px-3.5 py-2.5 transition-colors hover:bg-surface-muted/40 sm:grid-cols-[1fr_9rem_8rem_auto]">
                <span className="min-w-0 text-sm">
                  <span className="mr-1.5 rounded-md bg-brand-muted px-1.5 py-0.5 text-[11px] font-semibold text-brand">
                    C{r.category}
                  </span>
                  <span className="font-mono text-xs text-foreground/70">{r.code}</span>{" "}
                  <span className="font-medium text-foreground">{r.label_fr}</span>
                </span>
                <select
                  aria-label={`Mode ${r.code}`}
                  className={`${rhInput} mt-0 h-9`}
                  value={valueModeSelectValue(line.unit)}
                  onChange={(e) =>
                    onChange({
                      ...selected,
                      [r.id]: { ...line, unit: applyValueMode(e.target.value as "percent" | "month" | "day", line.unit) },
                    })
                  }
                >
                  {VALUE_MODES.map((m) => (
                    <option key={m.unit} value={m.unit}>
                      {m.fr}
                    </option>
                  ))}
                </select>
                <div className="relative">
                  <input
                    aria-label={`Valeur ${r.code}`}
                    className={`${rhInput} mt-0 h-9 pr-12`}
                    inputMode="decimal"
                    value={line.amount}
                    onChange={(e) => onChange({ ...selected, [r.id]: { ...line, amount: e.target.value } })}
                  />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs font-medium text-foreground/60">
                    {valueSuffix(line.unit)}
                  </span>
                </div>
                <button
                  type="button"
                  title="Retirer"
                  className="justify-self-end rounded-lg p-1.5 text-foreground/45 hover:bg-surface-muted hover:text-alert-critical"
                  onClick={() => toggle(r, false)}
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
