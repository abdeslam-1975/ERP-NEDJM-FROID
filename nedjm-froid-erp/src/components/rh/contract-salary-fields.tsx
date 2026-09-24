"use client";

import type { SalaryAssignment, SalaryRubrique } from "@/lib/actions/hr-salary";
import { bi, RhField, rhInput } from "@/components/rh/rh-ui";
import {
  VALUE_MODES,
  applyValueMode,
  valueModeLabel,
  valueModeSelectValue,
  valueSuffix,
  type SalaryUnit,
} from "@/lib/hr/salary-value-mode";

export type SelectedSalaryLine = { amount: string; unit: SalaryUnit };

export const SALARY_CLASSES = [
  { id: "1" as const, fr: "CNAS + IRG", ar: "ضمان + ضريبة" },
  { id: "2" as const, fr: "CNAS seulement", ar: "ضمان فقط" },
  { id: "3" as const, fr: "IRG seulement", ar: "ضريبة فقط" },
  { id: "4" as const, fr: "Ni CNAS ni IRG", ar: "لا ضمان ولا ضريبة" },
];

export function classTitle(id: SalaryRubrique["category"]) {
  const row = SALARY_CLASSES.find((c) => c.id === id);
  return row ? `Classe ${id} · ${row.fr} · ${row.ar}` : id;
}

export function ContractSalaryFields({
  rubriques,
  assignments,
  siteId,
  selected,
  onToggle,
  onChange,
}: {
  rubriques: SalaryRubrique[];
  assignments: SalaryAssignment[];
  siteId: string;
  selected: Record<string, SelectedSalaryLine>;
  onToggle: (rubriqueId: string, line: SelectedSalaryLine, checked: boolean) => void;
  onChange: (rubriqueId: string, line: SelectedSalaryLine) => void;
}) {
  const siteAsg = assignments.filter((a) => a.site_id === siteId && a.is_active);

  return (
    <div className="sm:col-span-2 space-y-3">
      <div>
        <h4 className="text-sm font-semibold">
          {bi("Rubriques du contrat", "بنود الأجر في العقد")}
        </h4>
        <p className="text-xs text-foreground/65">
          {bi(
            "Pour chaque item: pourcentage (*%), montant forfait (/F) ou barème journalier / برام (*J).",
            "لكل بند: نسبة (*%) أو مبلغ (/F) أو برام يومي (*J).",
          )}
        </p>
      </div>
      {SALARY_CLASSES.map((cls) => {
        const ofClass = rubriques.filter((r) => r.is_active && r.category === cls.id);
        const pickable = ofClass.filter((r) => r.apply_scope !== "site");
        const inherited = siteId
          ? ofClass
              .filter((r) => r.apply_scope === "site")
              .map((r) => {
                const asg = siteAsg.find((a) => a.rubrique_id === r.id);
                return {
                  rub: r,
                  amount: asg?.amount ?? r.default_amount,
                  unit: asg?.unit ?? r.unit,
                };
              })
          : [];
        return (
          <details
            key={cls.id}
            open
            className="rounded-md border border-border bg-background p-3"
          >
            <summary className="cursor-pointer text-sm font-semibold">
              {classTitle(cls.id)}
              <span className="ml-2 text-xs font-normal text-foreground/55">
                {pickable.length} {bi("au contrat", "في العقد")}
                {inherited.length
                  ? ` · ${inherited.length} ${bi("chantier", "ورشة")}`
                  : ""}
              </span>
            </summary>
            {inherited.length ? (
              <div className="mt-2 space-y-1 rounded border border-dashed border-border p-2">
                <p className="text-[11px] font-medium text-foreground/60">
                  {bi("Hérité du chantier", "موروث من الورشة")}
                </p>
                {inherited.map((row) => (
                  <p key={row.rub.id} className="flex justify-between gap-2 text-xs">
                    <span>
                      {row.rub.code} · {row.rub.label_fr} · {row.rub.label_ar}
                    </span>
                    <span className="shrink-0 font-mono">
                      {row.amount} {valueSuffix(row.unit)} · {valueModeLabel(row.unit, bi)}
                    </span>
                  </p>
                ))}
              </div>
            ) : null}
            <div className="mt-2 space-y-2">
              {pickable.length === 0 && inherited.length === 0 ? (
                <p className="text-xs text-foreground/55">
                  {bi(
                    "Aucun item dans cette classe. Ajoutez-le dans Paramètres → Rubriques.",
                    "لا بند في هذا الصنف. أضيفوه من الإعدادات → بنود الأجر.",
                  )}
                </p>
              ) : (
                pickable.map((r) => {
                  const current = selected[r.id];
                  const checked = Boolean(current);
                  const unit = current?.unit ?? r.unit;
                  return (
                    <div
                      key={r.id}
                      className="grid items-end gap-2 sm:grid-cols-[auto_1fr_8.5rem_7rem]"
                    >
                      <input
                        type="checkbox"
                        className="mb-2"
                        checked={checked}
                        onChange={(e) =>
                          onToggle(
                            r.id,
                            current ?? { amount: String(r.default_amount || 0), unit: r.unit },
                            e.target.checked,
                          )
                        }
                      />
                      <span className="mb-2 text-xs">
                        {r.code} · {r.label_fr} · {r.label_ar}
                      </span>
                      <RhField label={bi("Mode", "الضبط")}>
                        <select
                          className={rhInput}
                          disabled={!checked}
                          value={valueModeSelectValue(unit)}
                          onChange={(e) =>
                            onChange(r.id, {
                              amount: current?.amount ?? String(r.default_amount || 0),
                              unit: applyValueMode(
                                e.target.value as "percent" | "month" | "day",
                                unit,
                              ),
                            })
                          }
                        >
                          {VALUE_MODES.map((m) => (
                            <option key={m.unit} value={m.unit}>
                              {m.fr} · {m.ar}
                            </option>
                          ))}
                        </select>
                      </RhField>
                      <RhField label={`${bi("Valeur", "القيمة")} (${valueSuffix(unit)})`}>
                        <input
                          className={rhInput}
                          disabled={!checked}
                          value={current?.amount ?? ""}
                          onChange={(e) =>
                            onChange(r.id, { amount: e.target.value, unit })
                          }
                        />
                      </RhField>
                    </div>
                  );
                })
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
