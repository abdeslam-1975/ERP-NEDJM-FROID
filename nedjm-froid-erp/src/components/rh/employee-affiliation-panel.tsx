"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { RhAlert, rhInput } from "@/components/rh/rh-ui";
import {
  confirmSocialAffiliation,
  getEmployeeAffiliation,
  type EmployeeAffiliation,
} from "@/lib/actions/hr-affiliation";

/** CNAS attestation: the signed scan opens attendance from the date written on it. */
export function EmployeeAffiliationPanel({ employeeId }: { employeeId: string }) {
  const [row, setRow] = useState<EmployeeAffiliation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reload() {
    start(async () => {
      const result = await getEmployeeAffiliation(employeeId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setRow(result.data);
    });
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  function onSubmit(formData: FormData) {
    formData.set("employee_id", employeeId);
    start(async () => {
      const result = await confirmSocialAffiliation(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setRow(result.data);
    });
  }

  const gap =
    row && !row.legacy && row.affiliation_start && row.hired_at && row.affiliation_start !== row.hired_at
      ? `Contrat : ${row.hired_at} · CNAS : ${row.affiliation_start}. Le pointage commence à la date CNAS.`
      : null;

  return (
    <section className="mb-4 rounded-xl border border-border/70 bg-surface px-3 py-3">
      <p className="text-sm font-semibold">Attestation CNAS · شهادة الضمان</p>
      <p className="mt-1 text-xs text-foreground/55">
        Le nom entre dans la feuille de présence à partir de la date de début écrite sur l&apos;attestation.
      </p>
      {error ? (
        <div className="mt-2">
          <RhAlert tone="danger">{error}</RhAlert>
        </div>
      ) : null}
      {row?.legacy ? (
        <p className="mt-2 text-sm text-emerald-800">
          Affilié avant ce cycle. Le pointage reste ouvert
          {row.affiliation_start ? ` depuis le ${row.affiliation_start}` : ""}.
        </p>
      ) : null}
      {row && !row.legacy && row.affiliation_start ? (
        <p className="mt-2 text-sm text-emerald-800">
          Pointage ouvert depuis le {row.affiliation_start}
          {row.nss ? ` · NSS ${row.nss}` : ""}.
        </p>
      ) : null}
      {gap ? <p className="mt-2 text-sm text-amber-900">{gap}</p> : null}
      {row && !row.legacy ? (
        <form key={`${row.nss ?? ""}-${row.affiliation_start ?? ""}`} action={onSubmit} className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold text-foreground/70">
            N° sécurité sociale
            <input name="nss" defaultValue={row.nss ?? ""} inputMode="numeric" className={rhInput} required />
          </label>
          <label className="text-xs font-semibold text-foreground/70">
            Date de début de travail
            <input name="work_start" type="date" defaultValue={row.affiliation_start ?? ""} className={rhInput} required />
          </label>
          <label className="text-xs font-semibold text-foreground/70 sm:col-span-2">
            Scan de l&apos;attestation
            <input name="file" type="file" accept="application/pdf,image/*" className={`${rhInput} py-2`} />
          </label>
          {row.file_url ? (
            <a className="text-xs font-semibold text-brand underline" href={row.file_url} target="_blank" rel="noreferrer">
              {row.file_name || "Voir l'attestation"}
            </a>
          ) : null}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Enregistrement…" : "Valider et ouvrir le pointage"}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
