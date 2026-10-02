"use client";

import { useState, useTransition } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import { addWorkRegime, removeWorkRegime, type CatalogItem } from "@/lib/actions/hr-catalogs";
import { Button } from "@/components/ui/button";
import { CatalogSelect, RhField, rhInput } from "@/components/rh/rh-ui";

export function WorkRegimeField({
  catalogs,
  value,
  onChange,
  onCatalogsChange,
  canManage,
}: {
  catalogs: CatalogItem[];
  value: string;
  onChange: (code: string) => void;
  onCatalogsChange: (next: CatalogItem[]) => void;
  canManage: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const selected = catalogs.find((c) => c.kind === "work_regime" && c.code === value && c.is_active);

  function add() {
    setError(null);
    start(async () => {
      const res = await addWorkRegime({ label_fr: label });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onCatalogsChange([...catalogs, res.data]);
      onChange(res.data.code);
      setLabel("");
      setAdding(false);
    });
  }

  function remove() {
    if (!selected) return;
    if (!window.confirm(`Supprimer le régime « ${selected.label_fr} » ?`)) return;
    setError(null);
    start(async () => {
      const res = await removeWorkRegime(selected.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onCatalogsChange(
        res.data.archived
          ? catalogs.map((c) => (c.id === selected.id ? { ...c, is_active: false } : c))
          : catalogs.filter((c) => c.id !== selected.id),
      );
      onChange("");
      if (res.data.archived) setError("Régime utilisé par des contrats : il est archivé et n'est plus proposé.");
    });
  }

  return (
    <RhField label="Régime de travail">
      <div className="flex gap-2">
        <CatalogSelect items={catalogs} kind="work_regime" value={value} onChange={onChange} />
        {canManage ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="mt-1.5 shrink-0"
              title="Ajouter un régime"
              disabled={pending}
              onClick={() => {
                setAdding((v) => !v);
                setError(null);
              }}
            >
              <Plus className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="mt-1.5 shrink-0 text-alert-critical"
              title={selected ? `Supprimer « ${selected.label_fr} »` : "Choisissez un régime à supprimer"}
              disabled={pending || !selected}
              onClick={remove}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </>
        ) : null}
      </div>
      {canManage && adding ? (
        <div className="flex gap-2">
          <input
            autoFocus
            className={rhInput}
            placeholder="Nouveau régime (ex. 4/4, 6/2…)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (label.trim()) add();
              }
            }}
          />
          <Button
            type="button"
            size="icon"
            className="mt-1.5 shrink-0"
            title="Ajouter"
            disabled={pending || !label.trim()}
            onClick={add}
          >
            <Check className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="mt-1.5 shrink-0"
            title="Annuler"
            onClick={() => setAdding(false)}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      ) : null}
      {error ? (
        <span role="alert" className="mt-1 block text-[11px] font-normal normal-case text-alert-critical">
          {error}
        </span>
      ) : null}
    </RhField>
  );
}
