"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type {
  ClauseCategory,
  ContractAttributes,
  ContractClause,
  TerminationClause,
} from "@/lib/contracts/attributes-schema";
import type { ContractDocumentRow } from "@/lib/actions/contract-documents";

const CATEGORIES: { value: ClauseCategory; label: string }[] = [
  { value: "RESILIATION", label: "Résiliation (complément)" },
  { value: "FORCE_MAJEURE", label: "Force majeure" },
  { value: "LITIGES", label: "Règlement des litiges" },
  { value: "ASSURANCE", label: "Assurances" },
  { value: "CONFIDENTIALITE", label: "Confidentialité" },
  { value: "REVISION_PRIX", label: "Révision des prix" },
  { value: "GARANTIE", label: "Garantie" },
  { value: "SOUS_TRAITANCE", label: "Sous-traitance" },
  { value: "AUTRE", label: "Autre" },
];

const CAUTION_EFFECTS: { value: TerminationClause["caution_effect"]; label: string }[] = [
  { value: "NON_PRECISE", label: "Non précisé" },
  { value: "RESTITUEE", label: "Restituée" },
  { value: "CONFISQUEE", label: "Confisquée" },
  { value: "PARTIELLE", label: "Partiellement retenue" },
];

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `clause-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function numberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

export function ContractClausesTab({
  attrs,
  documents,
  pending,
  canWrite,
  onSave,
}: {
  attrs: ContractAttributes;
  documents: ContractDocumentRow[];
  pending: boolean;
  canWrite: boolean;
  onSave: (attrs: ContractAttributes) => void;
}) {
  const [termination, setTermination] = useState<TerminationClause>(attrs.clauses.termination);
  const [groundsText, setGroundsText] = useState(attrs.clauses.termination.grounds.join("\n"));
  const [items, setItems] = useState<ContractClause[]>(attrs.clauses.items);
  const [error, setError] = useState<string | null>(null);

  const baseline = useMemo(
    () => JSON.stringify(attrs.clauses),
    [attrs.clauses],
  );
  const current = {
    termination: {
      ...termination,
      grounds: groundsText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    },
    items,
  };
  const dirty = JSON.stringify(current) !== baseline;

  function setTerm<K extends keyof TerminationClause>(key: K, value: TerminationClause[K]) {
    setTermination((t) => ({ ...t, [key]: value }));
  }

  function updateItem(id: string, patch: Partial<ContractClause>) {
    setItems((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addItem() {
    setItems((list) => [
      ...list,
      {
        id: newId(),
        category: "AUTRE",
        article_ref: "",
        title: "",
        content: "",
        source_document_id: null,
        source_page: null,
      },
    ]);
  }

  function save() {
    setError(null);
    const untitled = items.findIndex((item) => item.title.trim() === "");
    if (untitled >= 0) {
      setError(`La clause n° ${untitled + 1} n'a pas d'intitulé.`);
      return;
    }
    onSave({ ...attrs, clauses: current });
  }

  const readOnly = !canWrite;

  return (
    <section className="space-y-6 rounded-lg border border-border bg-surface p-4">
      {error ? (
        <p role="alert" className="rounded-md border border-alert-critical/40 bg-alert-critical/10 px-3 py-2 text-sm text-alert-critical">
          {error}
        </p>
      ) : null}

      <div className="space-y-3">
        <h3 className="font-semibold">Résiliation</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Article du contrat">
            <input
              className={inputClass}
              placeholder="Ex. Art. 25"
              value={termination.article_ref}
              disabled={readOnly}
              onChange={(e) => setTerm("article_ref", e.target.value)}
            />
          </Field>
          <Field label="Préavis (jours)">
            <input
              type="number"
              min={0}
              className={inputClass}
              value={termination.notice_days ?? ""}
              disabled={readOnly}
              onChange={(e) => setTerm("notice_days", numberOrNull(e.target.value))}
            />
          </Field>
          <Field label="Délai de mise en demeure (jours)">
            <input
              type="number"
              min={0}
              className={inputClass}
              value={termination.cure_days ?? ""}
              disabled={readOnly}
              onChange={(e) => setTerm("cure_days", numberOrNull(e.target.value))}
            />
          </Field>
          <Field label="Effet sur la caution">
            <select
              className={inputClass}
              value={termination.caution_effect}
              disabled={readOnly}
              onChange={(e) =>
                setTerm("caution_effect", e.target.value as TerminationClause["caution_effect"])
              }
            >
              {CAUTION_EFFECTS.map((effect) => (
                <option key={effect.value} value={effect.value}>
                  {effect.label}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm font-medium sm:col-span-2">
            <input
              type="checkbox"
              checked={termination.client_convenience}
              disabled={readOnly}
              onChange={(e) => setTerm("client_convenience", e.target.checked)}
            />
            Le client peut résilier sans faute du prestataire (résiliation unilatérale)
          </label>
          <Field label="Motifs de résiliation (un par ligne)" wide>
            <textarea
              rows={4}
              className={inputClass}
              value={groundsText}
              disabled={readOnly}
              onChange={(e) => setGroundsText(e.target.value)}
            />
          </Field>
          <Field label="Conséquences financières" wide>
            <textarea
              rows={3}
              className={inputClass}
              value={termination.financial_consequences}
              disabled={readOnly}
              onChange={(e) => setTerm("financial_consequences", e.target.value)}
            />
          </Field>
          <Field label="Remarques" wide>
            <textarea
              rows={2}
              className={inputClass}
              value={termination.notes}
              disabled={readOnly}
              onChange={(e) => setTerm("notes", e.target.value)}
            />
          </Field>
          <SourceFields
            documents={documents}
            documentId={termination.source_document_id}
            page={termination.source_page}
            disabled={readOnly}
            onChange={(source_document_id, source_page) =>
              setTermination((t) => ({ ...t, source_document_id, source_page }))
            }
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Autres clauses</h3>
          {canWrite ? (
            <Button variant="secondary" onClick={addItem} disabled={pending}>
              Ajouter une clause
            </Button>
          ) : null}
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-foreground/70">
            Aucune clause saisie (force majeure, litiges, assurances, révision des prix…).
          </p>
        ) : null}
        {items.map((item, index) => (
          <div key={item.id} className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-3">
            <Field label={`Catégorie · clause ${index + 1}`}>
              <select
                className={inputClass}
                value={item.category}
                disabled={readOnly}
                onChange={(e) =>
                  updateItem(item.id, { category: e.target.value as ClauseCategory })
                }
              >
                {CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Article">
              <input
                className={inputClass}
                value={item.article_ref}
                disabled={readOnly}
                onChange={(e) => updateItem(item.id, { article_ref: e.target.value })}
              />
            </Field>
            <Field label="Intitulé *">
              <input
                className={inputClass}
                value={item.title}
                disabled={readOnly}
                onChange={(e) => updateItem(item.id, { title: e.target.value })}
              />
            </Field>
            <Field label="Contenu / résumé" wide>
              <textarea
                rows={3}
                className={inputClass}
                value={item.content}
                disabled={readOnly}
                onChange={(e) => updateItem(item.id, { content: e.target.value })}
              />
            </Field>
            <SourceFields
              documents={documents}
              documentId={item.source_document_id}
              page={item.source_page}
              disabled={readOnly}
              onChange={(source_document_id, source_page) =>
                updateItem(item.id, { source_document_id, source_page })
              }
            />
            {canWrite ? (
              <div className="flex items-end justify-end sm:col-span-3">
                <button
                  type="button"
                  className="text-sm font-semibold text-alert-critical hover:underline"
                  onClick={() => setItems((list) => list.filter((row) => row.id !== item.id))}
                >
                  Retirer cette clause
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {canWrite ? (
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={pending || !dirty}>
            {pending ? "Enregistrement…" : "Enregistrer les clauses"}
          </Button>
          {dirty ? (
            <span className="text-sm text-foreground/60">Modifications non enregistrées.</span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SourceFields({
  documents,
  documentId,
  page,
  disabled,
  onChange,
}: {
  documents: ContractDocumentRow[];
  documentId: string | null;
  page: number | null;
  disabled: boolean;
  onChange: (documentId: string | null, page: number | null) => void;
}) {
  const known = !documentId || documents.some((doc) => doc.id === documentId);
  return (
    <>
      <Field label="Document source" wide>
        <select
          className={inputClass}
          value={documentId ?? ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value || null, e.target.value ? page : null)}
        >
          <option value="">—</option>
          {!known ? <option value={documentId!}>Document supprimé</option> : null}
          {documents.map((doc) => (
            <option key={doc.id} value={doc.id}>
              {doc.title || doc.file_name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Page">
        <input
          type="number"
          min={1}
          className={inputClass}
          value={page ?? ""}
          disabled={disabled || !documentId}
          onChange={(e) => {
            const n = numberOrNull(e.target.value);
            onChange(documentId, n && n >= 1 ? n : null);
          }}
        />
      </Field>
    </>
  );
}

function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`block text-sm font-medium ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      {children}
    </label>
  );
}

const inputClass =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30 disabled:opacity-70";
