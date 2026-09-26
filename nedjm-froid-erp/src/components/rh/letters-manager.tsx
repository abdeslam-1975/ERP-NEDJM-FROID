"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LetterHistoryRow } from "@/lib/actions/hr-letters";
import type { LeaveEmployee } from "@/lib/actions/hr-leave";
import { LETTER_KINDS, letterKindLabel, type LetterKind } from "@/lib/hr/hr-letters";
import { HrLetterDialog } from "@/components/rh/hr-letter-dialog";
import { Button } from "@/components/ui/button";
import { RhAlert, RhField, bi, rhInput } from "@/components/rh/rh-ui";

const ISSUABLE = LETTER_KINDS.filter((k) => k.code !== "LEAVE");

export function LettersManager({
  history,
  employees,
  loadError,
}: {
  history: LetterHistoryRow[];
  employees: LeaveEmployee[];
  loadError?: string;
}) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState("");
  const [kind, setKind] = useState<LetterKind>("ATTEST");
  const [open, setOpen] = useState<{ employeeId: string; kind: LetterKind; correspondenceId?: string } | null>(null);
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const rows = history.filter((r) => !q || r.employee_label.toLowerCase().includes(q) || r.number.includes(q));

  return (
    <div className="space-y-5">
      {loadError ? <RhAlert tone="danger">{loadError}</RhAlert> : null}
      <div className="rounded-2xl border border-border/80 bg-surface p-4 shadow-[var(--card-shadow)]">
        <p className="mb-3 text-sm font-semibold">{bi("Établir un document", "إعداد وثيقة")}</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <RhField label={bi("Employé", "العامل")}>
            <select className={rhInput} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">—</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                  {e.employment_status === "EXITED" ? " (sorti)" : ""}
                </option>
              ))}
            </select>
          </RhField>
          <RhField label={bi("Document", "الوثيقة")}>
            <select className={rhInput} value={kind} onChange={(e) => setKind(e.target.value as LetterKind)}>
              {ISSUABLE.map((k) => (
                <option key={k.code} value={k.code}>
                  {k.fr} · {k.ar}
                </option>
              ))}
            </select>
          </RhField>
          <Button disabled={!employeeId} onClick={() => setOpen({ employeeId, kind })}>
            {bi("Préparer", "تحضير")}
          </Button>
        </div>
        <p className="mt-2 text-xs text-foreground/55">
          {bi(
            "Les titres de congé s'impriment depuis Congés ; certificat et solde de tout compte sont aussi accessibles depuis Sorties.",
            "",
          )}
        </p>
      </div>

      <div className="flex justify-end">
        <input
          className={`${rhInput} mt-0 w-64`}
          placeholder={bi("Rechercher…", "بحث")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border/80 bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-xs uppercase text-foreground/60">
            <tr>
              <th className="px-3 py-2 text-left">N°</th>
              <th className="px-3 py-2 text-left">{bi("Document", "الوثيقة")}</th>
              <th className="px-3 py-2 text-left">{bi("Employé", "العامل")}</th>
              <th className="px-3 py-2 text-left">{bi("Établi le", "بتاريخ")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-foreground/50">
                  {bi("Aucun document.", "لا توجد وثائق.")}
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const k = letterKindLabel(r.type_code);
                return (
                  <tr key={r.id} className="border-t border-border/60">
                    <td className="px-3 py-2 tabular-nums">{r.number}</td>
                    <td className="px-3 py-2">
                      {k.fr} <span className="text-xs text-foreground/50">({r.lang.toUpperCase()})</span>
                    </td>
                    <td className="px-3 py-2">{r.employee_label}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {new Date(r.created_at).toLocaleDateString("fr-DZ", { timeZone: "Africa/Algiers" })}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setOpen({ employeeId: r.employee_id, kind: r.type_code as LetterKind, correspondenceId: r.id })
                        }
                      >
                        {bi("Réimprimer", "إعادة الطباعة")}
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {open ? (
        <HrLetterDialog
          employeeId={open.employeeId}
          kind={open.kind}
          correspondenceId={open.correspondenceId}
          onClose={() => setOpen(null)}
          onIssued={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}
