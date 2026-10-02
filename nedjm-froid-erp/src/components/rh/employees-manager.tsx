"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Columns3, DatabaseZap, UserPlus } from "lucide-react";
import { ToolbarSlot } from "@/components/layout/arrange";
import {
  deleteHrEmployeeField,
  getHrEmployeeFiche,
  listHrEmployeeFiches,
  nextHrMatricule,
  setHrEmployeeFieldActive,
  setHrEmployeeStatus,
  upsertHrEmployeeField,
  type HrEmployeeFiche,
  type HrEmployeeField,
} from "@/lib/actions/hr-employees";
import {
  checkFicheValues,
  emptyFicheValues as emptyValues,
  saveEmployeeFiche,
  valuesFromFiche,
} from "@/components/rh/employee-fiche-save";
import type { CatalogItem, CatalogKind } from "@/lib/actions/hr-catalogs";
import type { SiteRow } from "@/lib/actions/sites";
import { Button } from "@/components/ui/button";
import { DataTable, dataColumns, type DataColumn } from "@/components/ui/data-table";
import { AlertBadge } from "@/components/castle/alert-badge";
import {
  RhAlert,
  RhField,
  RhModal,
  RhPage,
  RhPageHeader,
  catalogOptionLabel,
  rhInput,
} from "@/components/rh/rh-ui";
import { EmployeeFicheDialog } from "@/components/rh/employee-fiche";
import {
  EmployeesList,
  EmployeeViewSwitch,
  type EmployeeAssignment,
  type EmployeeView,
} from "@/components/rh/employees-list";
import { EmployeeAdminDossierDialog } from "@/components/rh/employee-admin-dossier";
import { EmployeeCardPreview } from "@/components/rh/employee-card-preview";
import { EmployeeImportDialog } from "@/components/rh/employee-import-dialog";
import { DEFAULT_FICHE_SETTINGS, type HrFicheSettings } from "@/lib/hr/fiche-settings";
import { mergeAffectationCatalog } from "@/lib/hr/affectation-options";

const col = dataColumns<HrEmployeeFiche>();
const fieldCol = dataColumns<HrEmployeeField>();

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

export function EmployeesManager({
  initialEmployees,
  fields: initialFields,
  catalogs,
  kinds,
  sites = [],
  assignments = [],
  fiche = DEFAULT_FICHE_SETTINGS,
  loadError,
}: {
  initialEmployees: HrEmployeeFiche[];
  fields: HrEmployeeField[];
  catalogs: CatalogItem[];
  kinds: CatalogKind[];
  sites?: Pick<SiteRow, "id" | "name_fr" | "name_ar">[];
  assignments?: EmployeeAssignment[];
  fiche?: HrFicheSettings;
  loadError?: string;
}) {
  const [rows, setRows] = useState(initialEmployees);
  const [fields, setFields] = useState(initialFields);
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const [startNew] = useState(() => searchParams.get("nouveau") === "1");
  const [view, setView] = useState<EmployeeView>("list");
  const [open, setOpen] = useState(startNew);
  const [dossierEmployee, setDossierEmployee] = useState<HrEmployeeFiche | null>(null);
  const [preview, setPreview] = useState<HrEmployeeFiche | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() =>
    startNew ? emptyValues(initialFields.filter((f) => f.is_active)) : {},
  );
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

  useEffect(() => {
    if (!startNew) return;
    let cancelled = false;
    void nextHrMatricule().then((next) => {
      if (!cancelled && next.ok && next.data.matricule) {
        setValues((v) => ({ ...v, matricule: v.matricule || next.data.matricule }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [startNew]);

  const fallbackText = useCallback(
    (row: HrEmployeeFiche, code: "fiche_affectation" | "fiche_poste") => {
      const raw = row[code];
      if (!raw) return "";
      const field = fields.find((f) => f.code === code);
      if (field?.value_type === "catalog" && field.catalog_kind) {
        const opt = ficheCatalogs.find((c) => c.kind === field.catalog_kind && c.code === raw);
        if (opt) return opt.label_fr || opt.label_ar || raw;
      }
      return raw;
    },
    [fields, ficheCatalogs],
  );

  function openCreate() {
    setValues(emptyValues(activeFields));
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
    const { normalized, error } = checkFicheValues(values, activeFields);
    setValues(normalized);
    if (error) {
      setFormError(error);
      return;
    }
    startTransition(async () => {
      const result = await saveEmployeeFiche(normalized, activeFields, ficheCatalogs);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      const saved = result.fiche;
      if (saved) {
        setRows((prev) => {
          const without = prev.filter((r) => r.id !== saved.id);
          return [...without, saved].sort((a, b) => {
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
        setValues(valuesFromFiche(saved, fields));
      }
      setInfo(result.info);
    });
  }

  const existingIds = useMemo(() => rows.map((r) => ({ matricule: r.matricule, nin: r.nin })), [rows]);

  function refreshRows() {
    startTransition(async () => {
      const result = await listHrEmployeeFiches();
      if (result.ok) setRows(result.data);
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

  const columns: DataColumn<HrEmployeeFiche>[] = [
    ...activeFields.map((field) =>
      col.accessor((row) => asText(rawValue(row, field)), {
        id: field.code,
        header: () => (
          <span className="flex flex-col items-start">
            <span>{field.label_fr}</span>
            <span className="font-normal normal-case tracking-normal" dir="rtl">
              {field.label_ar}
            </span>
          </span>
        ),
        meta: { label: field.label_fr || field.label_ar || field.code, className: "whitespace-nowrap" },
        cell: ({ row }) => display(row.original, field),
      }),
    ),
    col.display({
      id: "actions",
      header: "",
      enableSorting: false,
      enableHiding: false,
      meta: { className: "sticky right-0 bg-surface", headerClassName: "sticky right-0 bg-surface-muted" },
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={pending} onClick={() => setPreview(row.original)}>
            Ouvrir
          </Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => openEdit(row.original)}>
            Modifier
          </Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => setDossierEmployee(row.original)}>
            Dossier
          </Button>
          <Button type="button" variant="ghost" disabled={pending} onClick={() => toggleActive(row.original)}>
            {row.original.status === "ACTIVE" ? "Désactiver" : "Activer"}
          </Button>
        </div>
      ),
    }),
  ];

  const fieldColumns = [
    fieldCol.accessor((f) => `${f.label_fr} — ${f.label_ar}`, {
      id: "label",
      header: "Colonne",
      cell: ({ row }) => (
        <>
          {row.original.label_fr} — {row.original.label_ar}
          {!row.original.is_active ? <span className="ms-2 text-xs text-foreground/45">Masqué</span> : null}
        </>
      ),
    }),
    fieldCol.accessor("value_type", { header: "Type", meta: { className: "text-xs" } }),
    fieldCol.display({
      id: "actions",
      header: "",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const field = row.original;
        return (
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
                        ? prev.map((f) => (f.id === field.id ? { ...f, is_active: false } : f))
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
                    setFields((prev) => prev.map((f) => (f.id === field.id ? { ...f, is_active: true } : f)));
                  });
                }}
              >
                Afficher
              </Button>
            )}
          </div>
        );
      },
    }),
  ];

  return (
    <RhPage>
      <RhPageHeader
        eyebrow={`${rows.length} employé${rows.length > 1 ? "s" : ""} inscrit${rows.length > 1 ? "s" : ""}`}
        title="Personnel"
        actionsTabset="btn_rh_employees"
        actions={
          <>
            <ToolbarSlot id="columns">
              <Button type="button" variant="secondary" onClick={() => setColumnsOpen(true)}>
                <Columns3 aria-hidden />
                Colonnes
              </Button>
            </ToolbarSlot>
            <ToolbarSlot id="new">
              <Button type="button" disabled={pending} onClick={openCreate}>
                <UserPlus aria-hidden />
                Nouvel employé
              </Button>
            </ToolbarSlot>
          </>
        }
      />

      {loadError || formError ? (
        <RhAlert tone="danger">{loadError || formError}</RhAlert>
      ) : null}
      {info && !loadError && !formError ? (
        <RhAlert tone="success">{info}</RhAlert>
      ) : null}

      {view === "table" ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="secondary" disabled={pending} onClick={() => setImportOpen(true)}>
              <DatabaseZap aria-hidden />
              Importer l&apos;ancienne base
            </Button>
            <EmployeeViewSwitch value={view} onChange={setView} />
          </div>
          <DataTable
            key={urlQuery}
            data={rows}
            columns={columns}
            getRowId={(r) => r.id}
            searchPlaceholder="Rechercher dans toutes les colonnes"
            searchText={(row) => activeFields.map((field) => asText(rawValue(row, field))).join(" ")}
            initialSearch={urlQuery}
            columnToggle={false}
            maxHeight="70vh"
            emptyTitle="Aucun employé"
          />
        </>
      ) : (
        <EmployeesList
          key={urlQuery}
          rows={rows}
          assignments={assignments}
          fallback={fallbackText}
          initialQuery={urlQuery}
          view={view}
          onViewChange={setView}
          pending={pending}
          onOpen={setPreview}
          onEdit={openEdit}
          onDossier={setDossierEmployee}
          onToggle={toggleActive}
        />
      )}

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
          <DataTable
            className="mt-4"
            data={fields.slice().sort((a, b) => a.sort_order - b.sort_order)}
            columns={fieldColumns}
            getRowId={(f) => f.id}
            searchPlaceholder="Rechercher une colonne…"
            searchText={(f) => [f.label_fr, f.label_ar, f.code, f.value_type].filter(Boolean).join(" ")}
            pageSize={0}
            columnToggle={false}
            emptyTitle="Aucune colonne"
          />
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

      {preview ? (
        <EmployeeCardPreview
          employee={rows.find((r) => r.id === preview.id) ?? preview}
          fields={fields}
          catalogs={ficheCatalogs}
          fiche={fiche}
          onClose={() => setPreview(null)}
          onEdit={() => {
            const row = preview;
            setPreview(null);
            openEdit(row);
          }}
        />
      ) : null}

      {importOpen ? (
        <EmployeeImportDialog
          fields={fields}
          catalogs={ficheCatalogs}
          existing={existingIds}
          onClose={() => setImportOpen(false)}
          onImported={refreshRows}
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
