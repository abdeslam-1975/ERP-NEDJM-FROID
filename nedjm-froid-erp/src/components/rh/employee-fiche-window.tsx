"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  getHrEmployeeFiche,
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
import { confirmFicheIdentity } from "@/components/rh/employee-identity";
import { findEmployeeForFicheSearch } from "@/lib/hr/employee-fiche-search";
import { matriculeKey } from "@/lib/hr/contract-import";
import { nextMatriculeForHire } from "@/lib/hr/employee-matricule";

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
  return { ok: true, values: emptyFicheValues(activeOf(fields)) };
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
  const autoMatricule = useRef(initialValues.matricule || "");
  const known = useMemo(
    () =>
      employees.map((row) => ({
        id: row.id,
        matricule: row.matricule,
        nin: row.nin,
        nss: row.nss,
        last_name: row.last_name,
        first_name: row.first_name,
        birth_date: row.birth_date,
        hired_at: row.hired_at,
      })),
    [employees],
  );
  const hireMatricule = useMemo(
    () =>
      nextMatriculeForHire(
        values.hired_at || "",
        employees.filter((row) => row.id !== values.id).map((row) => row.matricule),
      ),
    [values.hired_at, values.id, employees],
  );

  useEffect(() => {
    if (values.id) return;
    setValues((current) => {
      const typed = current.matricule || "";
      if (typed && typed !== autoMatricule.current) return current;
      if (typed === hireMatricule) return current;
      autoMatricule.current = hireMatricule;
      return { ...current, matricule: hireMatricule };
    });
  }, [hireMatricule, values.id]);

  function open(employeeId: string | null) {
    setFormError(null);
    if (!employeeId) {
      autoMatricule.current = "";
      setValues(emptyFicheValues(activeFields));
    }
    start(async () => {
      const result = await ficheWindowValues(employeeId, fields);
      if (result.ok) setValues(result.values);
      else setFormError(result.error);
    });
  }

  function search(query: string) {
    const found = findEmployeeForFicheSearch(employees, query);
    if (found.ok) open(found.employee.id);
    else setFormError(found.error);
  }

  function submit() {
    setFormError(null);
    const manual = Boolean(values.matricule && values.matricule !== autoMatricule.current);
    const decision = confirmFicheIdentity(values, known, manual);
    if (!decision.ok) {
      setFormError(decision.error);
      return;
    }
    const { normalized, error } = checkFicheValues(decision.values, activeFields);
    setValues(normalized);
    if (error) {
      setFormError(error);
      return;
    }
    const taken = employees.some(
      (row) => row.id !== normalized.id && matriculeKey(row.matricule) === matriculeKey(normalized.matricule ?? ""),
    );
    if (taken) {
      setFormError("Ce matricule est déjà utilisé.");
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
      takenMatricules={employees.filter((row) => row.id !== values.id).map((row) => row.matricule)}
    />
  );
}
