"use client";

import { useMemo, useState, useTransition } from "react";
import {
  getHrEmployeeFiche,
  nextHrMatricule,
  type HrEmployeeFiche,
  type HrEmployeeField,
  type HrEmployeeRow,
} from "@/lib/actions/hr-employees";
import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import type { HrFicheSettings } from "@/lib/hr/fiche-settings";
import { EmployeeFicheDialog } from "@/components/rh/employee-fiche";
import {
  checkFicheValues,
  emptyFicheValues,
  saveEmployeeFiche,
  valuesFromFiche,
} from "@/components/rh/employee-fiche-save";

const activeOf = (fields: HrEmployeeField[]) =>
  fields.filter((f) => f.is_active).sort((a, b) => a.sort_order - b.sort_order);

/** Values to open the window with: the employee's card, or a new card with the next matricule. */
export async function ficheWindowValues(
  employeeId: string | null,
  fields: HrEmployeeField[],
): Promise<{ ok: true; values: Record<string, string> } | { ok: false; error: string }> {
  if (employeeId) {
    const result = await getHrEmployeeFiche(employeeId);
    return result.ok ? { ok: true, values: valuesFromFiche(result.data, fields) } : result;
  }
  const values = emptyFicheValues(activeOf(fields));
  const next = await nextHrMatricule();
  if (next.ok && next.data.matricule) values.matricule = next.data.matricule;
  return { ok: true, values };
}

/** The « Fiche employé » window on its own: edits a card, searches another one, saves and archives the PDF. */
export function EmployeeFicheWindow({
  employees,
  initialValues,
  fields,
  catalogs,
  fiche,
  onClose,
  onSaved,
}: {
  employees: HrEmployeeRow[];
  initialValues: Record<string, string>;
  fields: HrEmployeeField[];
  catalogs: CatalogItem[];
  fiche: HrFicheSettings;
  onClose: () => void;
  onSaved?: (saved: HrEmployeeFiche | null, info: string) => void;
}) {
  const activeFields = useMemo(() => activeOf(fields), [fields]);
  const [values, setValues] = useState(initialValues);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function open(employeeId: string | null) {
    setFormError(null);
    if (!employeeId) setValues(emptyFicheValues(activeFields));
    start(async () => {
      const result = await ficheWindowValues(employeeId, fields);
      if (result.ok) setValues(result.values);
      else setFormError(result.error);
    });
  }

  function search(query: string) {
    const needle = query.trim().toLowerCase();
    if (!needle) return;
    const found = employees.find(
      (e) =>
        e.matricule.toLowerCase() === needle ||
        (e.nss ?? "").toLowerCase() === needle ||
        (e.nin ?? "").toLowerCase() === needle,
    );
    if (found) open(found.id);
    else setFormError("Aucun employé pour cette recherche.");
  }

  function submit() {
    setFormError(null);
    const { normalized, error } = checkFicheValues(values, activeFields);
    setValues(normalized);
    if (error) {
      setFormError(error);
      return;
    }
    start(async () => {
      const result = await saveEmployeeFiche(normalized, activeFields, catalogs);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      if (result.fiche) setValues(valuesFromFiche(result.fiche, fields));
      onSaved?.(result.fiche, result.info);
    });
  }

  return (
    <EmployeeFicheDialog
      values={values}
      setValues={setValues}
      fields={fields}
      catalogs={catalogs}
      fiche={fiche}
      pending={pending}
      formError={formError}
      onClose={onClose}
      onSubmit={submit}
      onNew={() => open(null)}
      onSearch={search}
    />
  );
}
