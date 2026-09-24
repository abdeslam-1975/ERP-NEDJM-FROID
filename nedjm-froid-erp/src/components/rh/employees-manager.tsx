"use client";

import { useMemo, useState, useTransition } from "react";
import {
  deleteHrEmployeeField,
  getHrEmployeeFiche,
  nextHrMatricule,
  setHrEmployeeFieldActive,
  setHrEmployeeStatus,
  upsertHrEmployee,
  upsertHrEmployeeField,
  type HrEmployeeFiche,
  type HrEmployeeField,
} from "@/lib/actions/hr-employees";
import { archiveEmployeeFicheRenseignements } from "@/lib/actions/hr-documents";
import { maritalAllowsChildren, missingRequiredFields } from "@/lib/hr/employee-field-utils";
import {
  normalizeFicheValues,
  validateFicheConstraints,
} from "@/lib/hr/employee-fiche-constraints";
import { missingRequiredDocuments } from "@/lib/hr/required-documents";
import { listHrFilesForEmployee } from "@/lib/actions/hr-documents";
import type { CatalogItem, CatalogKind } from "@/lib/actions/hr-catalogs";
import type { SiteRow } from "@/lib/actions/sites";
import { Button } from "@/components/ui/button";
import { AlertBadge } from "@/components/castle/alert-badge";
import {
  RhAlert,
  RhField,
  RhModal,
  RhPage,
  RhPageHeader,
  RhTableWrap,
  RhToolbar,
  bi,
  catalogOptionLabel,
  rhInput,
  rhTd,
  rhTh,
} from "@/components/rh/rh-ui";
import { EmployeeFicheDialog } from "@/components/rh/employee-fiche";
import { EmployeeAdminDossierDialog } from "@/components/rh/employee-admin-dossier";
import { DEFAULT_FICHE_SETTINGS, type HrFicheSettings } from "@/lib/hr/fiche-settings";
import { mergeAffectationCatalog } from "@/lib/hr/affectation-options";

function rawValue(row: HrEmployeeFiche, field: HrEmployeeField): unknown {
  if (field.storage_group === "extra") return row.attrs?.[field.code];
  return (row as unknown as Record<string, unknown>)[field.code];
}

function asText(value: unknown) {
  if (value == null || value === "") return "";
  return String(value);
}

function statusTone(
  status: string,
): "success" | "warning" | "critical" | "info" {
  if (status === "ACTIVE") return "success";
  if (status === "SUSPENDED" || status === "INVITED") return "warning";
  if (status === "DISABLED" || status === "INACTIVE") return "critical";
  return "info";
}

function slugify(label: string) {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return slug || `col_${Date.now().toString().slice(-6)}`;
}

function valuesFromFiche(
  row: HrEmployeeFiche,
  fields: HrEmployeeField[],
): Record<string, string> {
  const values: Record<string, string> = { id: row.id };
  for (const field of fields) {
    values[field.code] = asText(rawValue(row, field));
    if (field.code === "irg_category" && !values[field.code]) {
      values[field.code] = "STANDARD";
    }
  }
  return values;
}

export function EmployeesManager({
  initialEmployees,
  fields: initialFields,
  catalogs,
  kinds,
  sites = [],
  fiche = DEFAULT_FICHE_SETTINGS,
  loadError,
}: {
  initialEmployees: HrEmployeeFiche[];
  fields: HrEmployeeField[];
  catalogs: CatalogItem[];
  kinds: CatalogKind[];
  sites?: Pick<SiteRow, "id" | "name_fr" | "name_ar">[];
  fiche?: HrFicheSettings;
  loadError?: string;
}) {
  const [rows, setRows] = useState(initialEmployees);
  const [fields, setFields] = useState(initialFields);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [dossierEmployee, setDossierEmployee] = useState<HrEmployeeFiche | null>(null);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [newCol, setNewCol] = useState({
    label_ar: "",
    label_fr: "",
    value_type: "text" as HrEmployeeField["value_type"],
    catalog_kind: "",
    section_ar: "إضافي",
    section_fr: "Extra",
  });

  const ficheCatalogs = useMemo(
    () => mergeAffectationCatalog(catalogs, sites),
    [catalogs, sites],
  );

  const activeFields = useMemo(
    () =>
      fields
        .filter((f) => f.is_active)
        .sort((a, b) => a.sort_order - b.sort_order),
    [fields],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      activeFields.some((field) =>
        asText(rawValue(row, field)).toLowerCase().includes(q),
      ),
    );
  }, [rows, query, activeFields]);

  function display(row: HrEmployeeFiche, field: HrEmployeeField) {
    const raw = rawValue(row, field);
    if (raw == null || raw === "") return "—";
    if (field.value_type === "catalog" && field.catalog_kind) {
      const opt = ficheCatalogs.find(
        (c) => c.kind === field.catalog_kind && c.code === String(raw),
      );
      return opt ? catalogOptionLabel(opt) : String(raw);
    }
    if (field.code === "photo_url") {
      return raw ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={String(raw)} alt="" className="h-10 w-8 object-cover" />
      ) : (
        "—"
      );
    }
    if (field.code === "status") {
      return (
        <AlertBadge label={String(raw)} tone={statusTone(String(raw))} />
      );
    }
    return String(raw);
  }

  function openCreate() {
    const empty: Record<string, string> = {};
    for (const field of activeFields) {
      empty[field.code] =
        field.code === "status"
          ? "ACTIVE"
          : field.code === "irg_category"
            ? "STANDARD"
            : field.code === "nationality"
              ? "Algérienne"
              : "";
    }
    setValues(empty);
    setFormError(null);
    setOpen(true);
    startTransition(async () => {
      const next = await nextHrMatricule();
      if (next.ok && next.data.matricule) {
        setValues((v) => ({ ...v, matricule: v.matricule || next.data.matricule }));
      }
    });
  }

  function openEdit(row: HrEmployeeFiche) {
    setFormError(null);
    setOpen(true);
    startTransition(async () => {
      const result = await getHrEmployeeFiche(row.id);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setValues(valuesFromFiche(result.data, fields));
    });
  }

  function submit() {
    setFormError(null);
    setInfo(null);
    const normalized = normalizeFicheValues(values) as Record<string, string>;
    setValues(normalized);
    const missing = missingRequiredFields(normalized, activeFields);
    if (missing.length) {
      setFormError(
        `Champs obligatoires manquants : ${missing
          .slice(0, 6)
          .map((f) => f.label_fr || f.label_ar || f.code)
          .join(", ")}`,
      );
      return;
    }
    const constraintIssues = validateFicheConstraints(normalized);
    if (constraintIssues.length) {
      setFormError(constraintIssues.map((i) => i.message).join(" "));
      return;
    }
    startTransition(async () => {
      if (normalized.id) {
        const files = await listHrFilesForEmployee(normalized.id);
        if (files.ok) {
          const missingDocs = missingRequiredDocuments(
            ficheCatalogs,
            files.data.map((f) => f.doc_type_code),
          );
          if (missingDocs.length) {
            setFormError(
              `Documents obligatoires manquants : ${missingDocs
                .slice(0, 6)
                .map((d) => d.label_fr || d.code)
                .join(", ")}. Onglet Documents.`,
            );
            return;
          }
        }
      }
      const attrs: Record<string, unknown> = {};
      const payload: Record<string, unknown> = {
        id: normalized.id || undefined,
        irg_category: normalized.irg_category || "STANDARD",
        status: normalized.status || "ACTIVE",
      };
      for (const field of activeFields) {
        const v = normalized[field.code] ?? "";
        if (field.storage_group === "extra") {
          attrs[field.code] = v === "" ? null : v;
        } else if (field.code === "experience_years" || field.code === "children_count") {
          if (field.code === "children_count" && !maritalAllowsChildren(normalized.marital_code)) {
            payload.children_count = null;
          } else {
            payload[field.code] = v === "" ? null : Number(v);
          }
        } else if (field.code === "irg_category") {
          payload.irg_category = v || "STANDARD";
        } else if (field.code === "status") {
          payload.status = v || "ACTIVE";
        } else {
          payload[field.code] = v;
        }
      }
      payload.attrs = attrs;
      const result = await upsertHrEmployee(payload);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      const fiche = await getHrEmployeeFiche(result.data.id);
      if (fiche.ok) {
        setRows((prev) => {
          const without = prev.filter((r) => r.id !== fiche.data.id);
          return [...without, fiche.data].sort((a, b) => {
            const aOk = a.import_seq != null;
            const bOk = b.import_seq != null;
            if (aOk && bOk && a.import_seq !== b.import_seq) {
              return (a.import_seq as number) - (b.import_seq as number);
            }
            if (aOk && !bOk) return -1;
            if (!aOk && bOk) return 1;
            return a.matricule.localeCompare(b.matricule, "fr", { numeric: true });
          });
        });
        setValues(valuesFromFiche(fiche.data, fields));
      }

      setInfo(bi("Fiche enregistrée.", "تم حفظ البطاقة."));

      // PDF archive must never break the save UI
      try {
        const archived = await archiveEmployeeFicheRenseignements(result.data.id);
        if (archived.ok) {
          setInfo(
            bi(
              `Fiche enregistrée. PDF : ${archived.data.file_name}`,
              `تم الحفظ. PDF: ${archived.data.file_name}`,
            ),
          );
        } else {
          setInfo(
            bi(
              `Fiche enregistrée. PDF plus tard : ${archived.error}`,
              `تم الحفظ. PDF لاحقاً: ${archived.error}`,
            ),
          );
        }
      } catch {
        setInfo(
          bi(
            "Fiche enregistrée. Génération PDF reportée.",
            "تم الحفظ. تأجيل إنشاء PDF.",
          ),
        );
      }
    });
  }

  function toggleActive(row: HrEmployeeFiche) {
    const nextStatus = row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    startTransition(async () => {
      const result = await setHrEmployeeStatus({ id: row.id, status: nextStatus });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id ? { ...r, status: result.data.status } : r,
        ),
      );
    });
  }

  function searchFromFiche(q: string) {
    const needle = q.trim().toLowerCase();
    if (!needle) return;
    const found = rows.find(
      (r) =>
        r.matricule.toLowerCase() === needle ||
        (r.nss ?? "").toLowerCase() === needle ||
        (r.nin ?? "").toLowerCase() === needle,
    );
    if (found) {
      openEdit(found);
      return;
    }
    setFormError("Aucun employé pour cette recherche.");
  }

  return (
    <RhPage>
      <RhPageHeader
        title="Employés"
        description="Toutes les données de l'employé apparaissent ici. Ajoutez ou masquez une colonne depuis cet écran."
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => setColumnsOpen(true)}>
              Colonnes
            </Button>
            <Button type="button" disabled={pending} onClick={openCreate}>
              Nouvel employé
            </Button>
          </>
        }
      />

      {loadError || formError ? (
        <RhAlert tone="danger">{loadError || formError}</RhAlert>
      ) : null}
      {info && !loadError && !formError ? (
        <RhAlert tone="success">{info}</RhAlert>
      ) : null}

      <RhToolbar>
        <input
          className={`${rhInput} mt-0 max-w-md`}
          placeholder="Rechercher dans toutes les colonnes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </RhToolbar>

      <RhTableWrap>
        <table className="min-w-max text-left text-sm">
          <thead className="border-b border-border/70 bg-surface-muted/80">
            <tr>
              {activeFields.map((field) => (
                <th key={field.id} className={`whitespace-nowrap ${rhTh()}`}>
                  <span className="block">{field.label_fr}</span>
                  <span className="block font-normal normal-case tracking-normal" dir="rtl">
                    {field.label_ar}
                  </span>
                </th>
              ))}
              <th className={`sticky right-0 bg-surface-muted/80 ${rhTh()}`} />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={activeFields.length + 1}
                  className={`${rhTd()} py-6 text-center text-foreground/55`}
                >
                  Aucun employé.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="border-b border-border/60">
                  {activeFields.map((field) => (
                    <td key={field.id} className={`whitespace-nowrap ${rhTd()}`}>
                      {display(row, field)}
                    </td>
                  ))}
                  <td className={`sticky right-0 bg-surface ${rhTd()}`}>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => openEdit(row)}
                      >
                        Ouvrir
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => setDossierEmployee(row)}
                      >
                        Dossier
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
      </RhTableWrap>

      {columnsOpen ? (
        <RhModal
          title="Colonnes base employés"
          subtitle="Ajoutez une colonne ici. Masquer une colonne système la cache sans effacer les données."
          onClose={() => setColumnsOpen(false)}
          footer={
            <Button variant="secondary" onClick={() => setColumnsOpen(false)}>
              Fermer
            </Button>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <RhField label="Libellé AR">
              <input
                dir="rtl"
                className={rhInput}
                value={newCol.label_ar}
                onChange={(e) => setNewCol({ ...newCol, label_ar: e.target.value })}
              />
            </RhField>
            <RhField label="Libellé">
              <input
                className={rhInput}
                value={newCol.label_fr}
                onChange={(e) => setNewCol({ ...newCol, label_fr: e.target.value })}
              />
            </RhField>
            <RhField label="Type">
              <select
                className={rhInput}
                value={newCol.value_type}
                onChange={(e) =>
                  setNewCol({
                    ...newCol,
                    value_type: e.target.value as HrEmployeeField["value_type"],
                  })
                }
              >
                <option value="text">Texte</option>
                <option value="date">Date</option>
                <option value="number">Nombre</option>
                <option value="catalog">Liste</option>
              </select>
            </RhField>
            {newCol.value_type === "catalog" ? (
              <RhField label="Liste">
                <select
                  className={rhInput}
                  value={newCol.catalog_kind}
                  onChange={(e) =>
                    setNewCol({ ...newCol, catalog_kind: e.target.value })
                  }
                >
                  <option value="">—</option>
                  {kinds.map((k) => (
                    <option key={k.code} value={k.code}>
                      {k.label_fr} — {k.label_ar}
                    </option>
                  ))}
                </select>
              </RhField>
            ) : null}
          </div>
          <div className="mt-3">
            <Button
              disabled={pending}
              onClick={() => {
                setFormError(null);
                startTransition(async () => {
                  const result = await upsertHrEmployeeField({
                    code: slugify(newCol.label_fr || newCol.label_ar),
                    label_ar: newCol.label_ar,
                    label_fr: newCol.label_fr,
                    value_type: newCol.value_type,
                    catalog_kind: newCol.catalog_kind || null,
                    section_ar: newCol.section_ar,
                    section_fr: newCol.section_fr,
                  });
                  if (!result.ok) {
                    setFormError(result.error);
                    return;
                  }
                  setFields((prev) => [
                    ...prev,
                    {
                      id: result.data.id,
                      code: slugify(newCol.label_fr || newCol.label_ar),
                      label_ar: newCol.label_ar,
                      label_fr: newCol.label_fr,
                      value_type: newCol.value_type,
                      catalog_kind: newCol.catalog_kind || null,
                      storage_group: "extra",
                      section_ar: newCol.section_ar,
                      section_fr: newCol.section_fr,
                      sort_order: 800,
                      is_system: false,
                      is_active: true,
                      is_required: false,
                    },
                  ]);
                  setNewCol({
                    label_ar: "",
                    label_fr: "",
                    value_type: "text",
                    catalog_kind: "",
                    section_ar: "إضافي",
                    section_fr: "Extra",
                  });
                  setInfo("Colonne ajoutée.");
                });
              }}
            >
              Ajouter une colonne
            </Button>
          </div>
          <RhTableWrap>
            <table className="mt-4 min-w-full text-sm">
              <thead className="border-b border-border/70 bg-surface-muted/80">
                <tr>
                  <th className={rhTh()}>Colonne</th>
                  <th className={rhTh()}>Type</th>
                  <th className={rhTh()} />
                </tr>
              </thead>
              <tbody>
                {fields
                  .slice()
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((field) => (
                    <tr key={field.id} className="border-b border-border/60">
                      <td className={rhTd()}>
                        {field.label_fr} — {field.label_ar}
                        {!field.is_active ? (
                          <span className="ms-2 text-xs text-foreground/45">Masqué</span>
                        ) : null}
                      </td>
                      <td className={`${rhTd()} text-xs`}>{field.value_type}</td>
                      <td className={rhTd()}>
                        <div className="flex gap-2">
                          {field.is_active ? (
                            <Button
                              variant="ghost"
                              disabled={pending}
                              onClick={() => {
                                startTransition(async () => {
                                  const result = await deleteHrEmployeeField(field.id);
                                  if (!result.ok) {
                                    setFormError(result.error);
                                    return;
                                  }
                                  setFields((prev) =>
                                    field.is_system
                                      ? prev.map((f) =>
                                          f.id === field.id
                                            ? { ...f, is_active: false }
                                            : f,
                                        )
                                      : prev.filter((f) => f.id !== field.id),
                                  );
                                });
                              }}
                            >
                              Supprimer
                            </Button>
                          ) : (
                            <Button
                              variant="secondary"
                              disabled={pending}
                              onClick={() => {
                                startTransition(async () => {
                                  const result = await setHrEmployeeFieldActive({
                                    id: field.id,
                                    is_active: true,
                                  });
                                  if (!result.ok) {
                                    setFormError(result.error);
                                    return;
                                  }
                                  setFields((prev) =>
                                    prev.map((f) =>
                                      f.id === field.id ? { ...f, is_active: true } : f,
                                    ),
                                  );
                                });
                              }}
                            >
                              Afficher
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </RhTableWrap>
        </RhModal>
      ) : null}

      {dossierEmployee ? (
        <EmployeeAdminDossierDialog
          employeeId={dossierEmployee.id}
          employeeLabel={[
            dossierEmployee.matricule,
            dossierEmployee.last_name,
            dossierEmployee.first_name,
          ]
            .filter(Boolean)
            .join(" · ")}
          catalogs={ficheCatalogs}
          onClose={() => setDossierEmployee(null)}
          onOpenFiche={() => openEdit(dossierEmployee)}
        />
      ) : null}

      {open ? (
        <EmployeeFicheDialog
          values={values}
          setValues={setValues}
          fields={fields}
          catalogs={ficheCatalogs}
          fiche={fiche}
          pending={pending}
          formError={formError}
          onClose={() => setOpen(false)}
          onSubmit={submit}
          onNew={openCreate}
          onSearch={searchFromFiche}
        />
      ) : null}
    </RhPage>
  );
}
