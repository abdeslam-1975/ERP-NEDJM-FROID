"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import {
  setHrEmployeeStatus,
  upsertHrEmployee,
  type HrEmployeeRow,
} from "@/lib/actions/hr-employees";
import { Button } from "@/components/ui/button";
import { AlertBadge } from "@/components/castle/alert-badge";

type FormState = {
  id?: string;
  matricule: string;
  last_name: string;
  first_name: string;
  nss: string;
  nin: string;
  birth_date: string;
  hired_at: string;
  irg_category: "STANDARD" | "DISABLED_OR_RETIREE";
  status: string;
};

const emptyForm = (): FormState => ({
  matricule: "",
  last_name: "",
  first_name: "",
  nss: "",
  nin: "",
  birth_date: "",
  hired_at: "",
  irg_category: "STANDARD",
  status: "ACTIVE",
});

const inputClass =
  "mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="text-xs font-medium text-foreground/70">
      {label}
      {children}
    </label>
  );
}

function statusTone(
  status: string,
): "success" | "warning" | "critical" | "info" {
  if (status === "ACTIVE") return "success";
  if (status === "SUSPENDED" || status === "INVITED") return "warning";
  if (status === "DISABLED" || status === "INACTIVE") return "critical";
  return "info";
}

export function EmployeesManager({
  initialEmployees,
  loadError,
}: {
  initialEmployees: HrEmployeeRow[];
  loadError?: string;
}) {
  const [rows, setRows] = useState(initialEmployees);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (e) =>
        e.matricule.toLowerCase().includes(q) ||
        e.last_name.toLowerCase().includes(q) ||
        e.first_name.toLowerCase().includes(q),
    );
  }, [rows, query]);

  function openCreate() {
    setForm(emptyForm());
    setFormError(null);
    setOpen(true);
  }

  function openEdit(row: HrEmployeeRow) {
    setForm({
      id: row.id,
      matricule: row.matricule,
      last_name: row.last_name,
      first_name: row.first_name,
      nss: row.nss ?? "",
      nin: row.nin ?? "",
      birth_date: row.birth_date ?? "",
      hired_at: row.hired_at ?? "",
      irg_category: row.irg_category,
      status: row.status,
    });
    setFormError(null);
    setOpen(true);
  }

  function submit() {
    setFormError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await upsertHrEmployee({
        id: form.id,
        matricule: form.matricule,
        last_name: form.last_name,
        first_name: form.first_name,
        nss: form.nss || null,
        nin: form.nin || null,
        birth_date: form.birth_date || null,
        hired_at: form.hired_at || null,
        irg_category: form.irg_category,
        status: form.status,
      });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      const next: HrEmployeeRow = {
        id: result.data.id,
        matricule: form.matricule.toUpperCase(),
        last_name: form.last_name.trim(),
        first_name: form.first_name.trim(),
        nss: form.nss || null,
        nin: form.nin || null,
        birth_date: form.birth_date || null,
        hired_at: form.hired_at || null,
        irg_category: form.irg_category,
        status: form.status,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setRows((prev) => {
        const without = prev.filter((r) => r.id !== next.id);
        return [...without, next].sort((a, b) =>
          a.last_name.localeCompare(b.last_name, "fr"),
        );
      });
      setOpen(false);
      setInfo(form.id ? "Employé mis à jour." : "Employé créé.");
    });
  }

  function toggleActive(row: HrEmployeeRow) {
    const nextStatus = row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setInfo(null);
    setFormError(null);
    startTransition(async () => {
      const result = await setHrEmployeeStatus({
        id: row.id,
        status: nextStatus,
      });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id ? { ...r, status: result.data.status } : r,
        ),
      );
      setInfo(
        nextStatus === "ACTIVE"
          ? "Employé réactivé (visible dans les pickers contrats)."
          : "Employé désactivé (retiré des pickers actifs).",
      );
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">Employés RH</h2>
          <p className="mt-1 text-sm text-foreground/70">
            Fiches minimales pour rattacher la main-d&apos;œuvre et les
            pénalités aux contrats clients. Statut ACTIVE = disponible dans les
            pickers.
          </p>
        </div>
        <Button type="button" disabled={pending} onClick={openCreate}>
          Nouvel employé
        </Button>
      </div>

      {(loadError || formError || info) && (
        <div
          role="alert"
          className={`rounded-md border px-4 py-3 text-sm ${
            loadError || formError
              ? "border-alert-critical/40 bg-alert-critical/10 text-alert-critical"
              : "border-alert-success/40 bg-alert-success/10 text-alert-success"
          }`}
        >
          {loadError || formError || info}
        </div>
      )}

      <input
        className="h-10 w-full max-w-md rounded-md border border-border bg-surface px-3 text-sm"
        placeholder="Rechercher matricule / nom…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border bg-surface-muted text-xs uppercase text-foreground/60">
            <tr>
              <th className="px-3 py-2">Matricule</th>
              <th className="px-3 py-2">Nom</th>
              <th className="px-3 py-2">IRG</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2">Embauche</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-foreground/55"
                >
                  Aucun employé.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="border-b border-border/60">
                  <td className="px-3 py-2 font-mono text-xs">{row.matricule}</td>
                  <td className="px-3 py-2">
                    {row.last_name} {row.first_name}
                  </td>
                  <td className="px-3 py-2 text-xs">{row.irg_category}</td>
                  <td className="px-3 py-2">
                    <AlertBadge label={row.status} tone={statusTone(row.status)} />
                  </td>
                  <td className="px-3 py-2 text-xs">{row.hired_at ?? "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => openEdit(row)}
                      >
                        Modifier
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => toggleActive(row)}
                      >
                        {row.status === "ACTIVE" ? "Désactiver" : "Activer"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {open ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-border bg-surface p-4 shadow-lg">
            <h3 className="font-semibold">
              {form.id ? "Modifier l'employé" : "Nouvel employé"}
            </h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Field label="Matricule">
                <input
                  className={inputClass}
                  value={form.matricule}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, matricule: e.target.value }))
                  }
                />
              </Field>
              <Field label="Statut">
                <select
                  className={inputClass}
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value }))
                  }
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                  <option value="DISABLED">DISABLED</option>
                  <option value="INVITED">INVITED</option>
                </select>
              </Field>
              <Field label="Nom">
                <input
                  className={inputClass}
                  value={form.last_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, last_name: e.target.value }))
                  }
                />
              </Field>
              <Field label="Prénom">
                <input
                  className={inputClass}
                  value={form.first_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, first_name: e.target.value }))
                  }
                />
              </Field>
              <Field label="Catégorie IRG">
                <select
                  className={inputClass}
                  value={form.irg_category}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      irg_category: e.target.value as FormState["irg_category"],
                    }))
                  }
                >
                  <option value="STANDARD">STANDARD</option>
                  <option value="DISABLED_OR_RETIREE">DISABLED_OR_RETIREE</option>
                </select>
              </Field>
              <Field label="Date embauche">
                <input
                  type="date"
                  className={inputClass}
                  value={form.hired_at}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, hired_at: e.target.value }))
                  }
                />
              </Field>
              <Field label="NSS (optionnel)">
                <input
                  className={inputClass}
                  value={form.nss}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, nss: e.target.value }))
                  }
                />
              </Field>
              <Field label="NIN (optionnel)">
                <input
                  className={inputClass}
                  value={form.nin}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, nin: e.target.value }))
                  }
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Date de naissance (optionnel)">
                  <input
                    type="date"
                    className={inputClass}
                    value={form.birth_date}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, birth_date: e.target.value }))
                    }
                  />
                </Field>
              </div>
            </div>
            {formError ? (
              <p className="mt-2 text-sm text-alert-critical">{formError}</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                Annuler
              </Button>
              <Button type="button" disabled={pending} onClick={submit}>
                Enregistrer
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
