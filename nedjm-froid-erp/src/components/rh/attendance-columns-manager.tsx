"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteAttendanceColumn,
  saveAttendanceColumnsConfig,
  type AttendanceColumnsAdmin,
} from "@/lib/actions/hr-attendance-sheet";
import {
  isEditableColumn,
  sortColumns,
  type AttendanceColumn,
  type AttendanceValueType,
} from "@/lib/hr/attendance-columns";
import { Button } from "@/components/ui/button";
import {
  RhAlert,
  RhField,
  RhPanel,
  RhSectionTitle,
  RhTableWrap,
  rhInput,
} from "@/components/rh/rh-ui";

type DraftColumn = Omit<AttendanceColumn, "id"> & { id?: string };
type Grant = { view: boolean; edit: boolean };

const KIND_LABEL: Record<AttendanceColumn["kind"], string> = {
  IDENTITY: "Dossier",
  DAYS: "Jours",
  CODE_COUNTS: "Totaux codes",
  TOTAL: "Calcul",
  INPUT: "Saisie",
};

const VALUE_TYPES: { id: Exclude<AttendanceValueType, "catalog">; label: string }[] = [
  { id: "text", label: "Texte" },
  { id: "number", label: "Nombre" },
  { id: "date", label: "Date" },
];

const cellInput =
  "h-8 w-full rounded-lg border border-border/70 bg-surface px-2 text-xs outline-none focus:border-brand";

function grantKey(code: string, roleId: string) {
  return `${code}|${roleId}`;
}

export function AttendanceColumnsManager({ initial }: { initial: AttendanceColumnsAdmin }) {
  const router = useRouter();
  const [columns, setColumns] = useState<DraftColumn[]>(() => sortColumns(initial.columns));
  const [grants, setGrants] = useState<Record<string, Grant>>(() => {
    const codeById = new Map(initial.columns.map((c) => [c.id, c.code]));
    const map: Record<string, Grant> = {};
    for (const g of initial.grants) {
      const code = codeById.get(g.column_id);
      if (code) map[grantKey(code, g.role_id)] = { view: g.can_view, edit: g.can_edit };
    }
    return map;
  });
  const [newCol, setNewCol] = useState({
    code: "",
    label_fr: "",
    label_ar: "",
    value_type: "text" as Exclude<AttendanceValueType, "catalog">,
  });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();

  const roles = initial.roles;
  const ordered = useMemo(() => sortColumns(columns), [columns]);

  function patchColumn(code: string, patch: Partial<DraftColumn>) {
    setColumns((prev) => prev.map((c) => (c.code === code ? { ...c, ...patch } : c)));
    setDirty(true);
  }

  function setGrant(code: string, roleId: string, field: "view" | "edit", value: boolean) {
    setGrants((prev) => {
      const current = prev[grantKey(code, roleId)] ?? { view: false, edit: false };
      const next =
        field === "view"
          ? { view: value, edit: value ? current.edit : false }
          : { view: value ? true : current.view, edit: value };
      return { ...prev, [grantKey(code, roleId)]: next };
    });
    setDirty(true);
  }

  function move(code: string, dir: -1 | 1) {
    const list = ordered.slice();
    const i = list.findIndex((c) => c.code === code);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const orders = new Map(list.map((c, idx) => [c.code, (idx + 1) * 10]));
    setColumns((prev) => prev.map((c) => ({ ...c, sort_order: orders.get(c.code) ?? c.sort_order })));
    setDirty(true);
  }

  function addColumn() {
    setError(null);
    const code = newCol.code.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{0,31}$/.test(code)) {
      setError("Code : lettres majuscules, chiffres ou _ (ex. HEURES_SUP).");
      return;
    }
    if (columns.some((c) => c.code === code)) {
      setError(`Le code ${code} existe déjà.`);
      return;
    }
    if (!newCol.label_fr.trim()) {
      setError("Libellé FR requis.");
      return;
    }
    const maxOrder = columns.reduce((n, c) => Math.max(n, c.sort_order), 0);
    setColumns((prev) => [
      ...prev,
      {
        code,
        label_fr: newCol.label_fr.trim(),
        label_ar: newCol.label_ar.trim() || null,
        kind: "INPUT",
        source: null,
        value_type: newCol.value_type,
        catalog_kind: null,
        sort_order: maxOrder + 10,
        is_system: false,
        is_active: true,
      },
    ]);
    setGrants((prev) => {
      const next = { ...prev };
      for (const r of roles) next[grantKey(code, r.id)] = { view: true, edit: false };
      return next;
    });
    setNewCol({ code: "", label_fr: "", label_ar: "", value_type: "text" });
    setDirty(true);
    setInfo(`Colonne ${code} ajoutée — enregistrez pour l'appliquer.`);
  }

  function removeColumn(col: DraftColumn) {
    setError(null);
    if (!col.id) {
      setColumns((prev) => prev.filter((c) => c.code !== col.code));
      return;
    }
    if (!window.confirm(`Supprimer la colonne ${col.code} ? Les valeurs saisies ne seront plus affichées.`)) {
      return;
    }
    start(async () => {
      const r = await deleteAttendanceColumn(col.id!);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setColumns((prev) => prev.filter((c) => c.code !== col.code));
      setInfo(`Colonne ${col.code} supprimée.`);
      router.refresh();
    });
  }

  function save() {
    setError(null);
    setInfo(null);
    start(async () => {
      const r = await saveAttendanceColumnsConfig({
        columns: ordered.map((c) => ({
          id: c.id,
          code: c.code,
          label_fr: c.label_fr,
          label_ar: c.label_ar,
          value_type: c.value_type,
          sort_order: c.sort_order,
          is_active: c.is_active,
        })),
        grants: ordered.flatMap((c) =>
          roles.map((r) => {
            const g = grants[grantKey(c.code, r.id)] ?? { view: false, edit: false };
            return { column_code: c.code, role_id: r.id, can_view: g.view, can_edit: g.edit };
          }),
        ),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDirty(false);
      setInfo("Colonnes et droits enregistrés. · تم حفظ الأعمدة والصلاحيات.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <RhPanel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <RhSectionTitle>Feuille de présence — colonnes et droits</RhSectionTitle>
            <p className="mt-1 text-xs text-foreground/60">
              أعمدة ورقة الحضور وصلاحيات الاطلاع والتعديل لكل دور. SUPER_ADMIN يرى ويعدّل كل الأعمدة دائمًا.
              Aucune colonne financière n&apos;est proposée sur la feuille de présence.
            </p>
          </div>
          <Button disabled={pending || !dirty} onClick={save}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
        {error || info ? (
          <div className="mt-3">
            <RhAlert tone={error ? "danger" : "success"}>{error || info}</RhAlert>
          </div>
        ) : null}
      </RhPanel>

      <RhTableWrap>
        <table className="min-w-max border-collapse text-xs">
          <thead>
            <tr className="bg-surface-muted/70">
              <th className="px-2 py-2 text-left" rowSpan={2}>Ordre</th>
              <th className="px-2 py-2 text-left" rowSpan={2}>Code</th>
              <th className="px-2 py-2 text-left" rowSpan={2}>Libellé FR</th>
              <th className="px-2 py-2 text-left" rowSpan={2}>Libellé AR</th>
              <th className="px-2 py-2 text-left" rowSpan={2}>Nature</th>
              <th className="px-2 py-2 text-center" rowSpan={2}>Active</th>
              {roles.map((r) => (
                <th key={r.id} className="border-l border-border/60 px-2 pt-2 text-center" colSpan={2}>
                  {r.label_fr}
                  <span className="block font-mono text-[10px] font-normal text-foreground/45">{r.code}</span>
                </th>
              ))}
              <th className="px-2 py-2" rowSpan={2} />
            </tr>
            <tr className="bg-surface-muted/70 text-[10px] font-normal text-foreground/55">
              {roles.map((r) => (
                <FragmentPair key={r.id} />
              ))}
            </tr>
          </thead>
          <tbody>
            {ordered.map((col, index) => {
              const editable = isEditableColumn(col);
              return (
                <tr key={col.code} className={`border-t border-border/50 ${col.is_active ? "" : "opacity-50"}`}>
                  <td className="px-2 py-1.5">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="rounded border border-border/70 px-1.5 disabled:opacity-30"
                        disabled={index === 0}
                        onClick={() => move(col.code, -1)}
                        aria-label="Monter"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="rounded border border-border/70 px-1.5 disabled:opacity-30"
                        disabled={index === ordered.length - 1}
                        onClick={() => move(col.code, 1)}
                        aria-label="Descendre"
                      >
                        ↓
                      </button>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 font-mono font-semibold">{col.code}</td>
                  <td className="px-2 py-1.5">
                    <input
                      className={`${cellInput} min-w-[140px]`}
                      value={col.label_fr}
                      onChange={(e) => patchColumn(col.code, { label_fr: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      dir="rtl"
                      className={`${cellInput} min-w-[140px]`}
                      value={col.label_ar ?? ""}
                      onChange={(e) => patchColumn(col.code, { label_ar: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    {col.kind === "INPUT" && !col.is_system ? (
                      <select
                        className={cellInput}
                        value={col.value_type === "catalog" ? "text" : col.value_type}
                        onChange={(e) =>
                          patchColumn(col.code, { value_type: e.target.value as AttendanceValueType })
                        }
                      >
                        {VALUE_TYPES.map((t) => (
                          <option key={t.id} value={t.id}>
                            Saisie · {t.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px]">
                        {KIND_LABEL[col.kind]}
                        {col.source === "POSTE_EFFECTIF" ? " · saisissable" : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={col.is_active}
                      disabled={col.kind === "DAYS"}
                      title={col.kind === "DAYS" ? "La grille des jours reste toujours active." : undefined}
                      onChange={(e) => patchColumn(col.code, { is_active: e.target.checked })}
                    />
                  </td>
                  {roles.map((r) => {
                    const g = grants[grantKey(col.code, r.id)] ?? { view: false, edit: false };
                    return (
                      <GrantCells
                        key={r.id}
                        grant={g}
                        editable={editable}
                        onView={(v) => setGrant(col.code, r.id, "view", v)}
                        onEdit={(v) => setGrant(col.code, r.id, "edit", v)}
                      />
                    );
                  })}
                  <td className="px-2 py-1.5">
                    {col.is_system ? null : (
                      <button
                        type="button"
                        className="rounded-lg px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                        disabled={pending}
                        onClick={() => removeColumn(col)}
                      >
                        Supprimer
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </RhTableWrap>

      <RhPanel>
        <RhSectionTitle>Ajouter une colonne de saisie · إضافة عمود</RhSectionTitle>
        <div className="mt-3 grid gap-3 sm:grid-cols-5">
          <RhField label="Code">
            <input
              className={`${rhInput} font-mono uppercase`}
              value={newCol.code}
              placeholder="HEURES_SUP"
              onChange={(e) => setNewCol({ ...newCol, code: e.target.value.toUpperCase() })}
            />
          </RhField>
          <RhField label="Libellé FR">
            <input
              className={rhInput}
              value={newCol.label_fr}
              onChange={(e) => setNewCol({ ...newCol, label_fr: e.target.value })}
            />
          </RhField>
          <RhField label="Libellé AR">
            <input
              dir="rtl"
              className={rhInput}
              value={newCol.label_ar}
              onChange={(e) => setNewCol({ ...newCol, label_ar: e.target.value })}
            />
          </RhField>
          <RhField label="Type de valeur">
            <select
              className={rhInput}
              value={newCol.value_type}
              onChange={(e) =>
                setNewCol({
                  ...newCol,
                  value_type: e.target.value as Exclude<AttendanceValueType, "catalog">,
                })
              }
            >
              {VALUE_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </RhField>
          <div className="flex items-end">
            <Button variant="secondary" className="w-full" onClick={addColumn}>
              Ajouter
            </Button>
          </div>
        </div>
      </RhPanel>
    </div>
  );
}

function FragmentPair() {
  return (
    <>
      <th className="border-l border-border/60 px-2 pb-2 text-center font-normal">Voir</th>
      <th className="px-2 pb-2 text-center font-normal">Modifier</th>
    </>
  );
}

function GrantCells({
  grant,
  editable,
  onView,
  onEdit,
}: {
  grant: Grant;
  editable: boolean;
  onView: (v: boolean) => void;
  onEdit: (v: boolean) => void;
}) {
  return (
    <>
      <td className="border-l border-border/60 px-2 py-1.5 text-center">
        <input type="checkbox" checked={grant.view} onChange={(e) => onView(e.target.checked)} />
      </td>
      <td className="px-2 py-1.5 text-center">
        {editable ? (
          <input type="checkbox" checked={grant.edit} onChange={(e) => onEdit(e.target.checked)} />
        ) : (
          <span className="text-foreground/30">—</span>
        )}
      </td>
    </>
  );
}
