"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { getLegalDocumentUrl, listCitableDocuments } from "@/lib/actions/legal-documents";
import {
  appliesOn,
  applicationPeriodLabel,
  emptyCitation,
  legalDocShortLabel,
  legalDocStatusLabel,
  type CitationInput,
  type CitationView,
  type LegalDocument,
} from "@/lib/rules/legal-documents";
import { Button } from "@/components/ui/button";
import { RhAlert, RhChip, RhField, rhInput } from "@/components/rh/rh-ui";

export const LEGAL_DOCUMENTS_PATH = "/rh/legal/documents";

/** Supporting documents of a proposal: a register document, the article, the page and the excerpt relied on. */
export function CitationsField({
  value,
  onChange,
  month,
}: {
  value: CitationInput[];
  onChange: (v: CitationInput[]) => void;
  /** Month the rule is asked from (1st of the month), checked against the documents' application period. */
  month?: string | null;
}) {
  const [docs, setDocs] = useState<LegalDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await listCitableDocuments();
      if (cancelled) return;
      if (!r.ok) setError(r.error);
      else setDocs(r.data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = value.length ? value : [];
  const update = (i: number, patch: Partial<CitationInput>) =>
    onChange(rows.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <div className="space-y-3 rounded-xl border border-border/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          Justificatifs <span className="text-red-600">*</span>
        </p>
        <Link href={LEGAL_DOCUMENTS_PATH} target="_blank" className="text-xs text-brand hover:underline">
          Registre des documents juridiques
        </Link>
      </div>
      <p className="text-xs text-foreground/60">
        Au moins un document du registre, avec l&apos;article, la page et l&apos;extrait sur lesquels repose la valeur.
        Ils sont figés à la soumission.
      </p>
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {docs && !docs.length ? (
        <RhAlert tone="warning">
          Aucun document au registre : importez d&apos;abord le texte dans le{" "}
          <Link href={LEGAL_DOCUMENTS_PATH} target="_blank" className="font-medium underline">
            registre des documents juridiques
          </Link>
          .
        </RhAlert>
      ) : null}
      {rows.map((c, i) => {
        const doc = docs?.find((d) => d.id === c.document_id) ?? null;
        const outside = doc && month ? !appliesOn(doc, month) : false;
        return (
          <div key={i} className="space-y-2 rounded-lg bg-surface-muted/50 p-2.5">
            <RhField label={`Document ${i + 1}`} required>
              <select
                className={rhInput}
                value={c.document_id}
                disabled={!docs}
                onChange={(e) => update(i, { document_id: e.target.value })}
              >
                <option value="">{docs ? "Choisir un document…" : "Chargement…"}</option>
                {(docs ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {legalDocShortLabel(d)}
                  </option>
                ))}
              </select>
            </RhField>
            {doc ? (
              <p className="text-xs text-foreground/60">
                Période d&apos;application {applicationPeriodLabel(doc.applies_from, doc.applies_to)}.
              </p>
            ) : null}
            {outside ? (
              <RhAlert tone="warning">
                Le mois demandé sort de la période d&apos;application de ce document (avertissement affiché à
                l&apos;approbateur).
              </RhAlert>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-[1fr_7rem]">
              <RhField label="Article" required>
                <input
                  className={rhInput}
                  value={c.article}
                  maxLength={120}
                  placeholder="ex. art. 104"
                  onChange={(e) => update(i, { article: e.target.value })}
                />
              </RhField>
              <RhField label="Page" required>
                <input
                  className={rhInput}
                  type="number"
                  min={1}
                  max={5000}
                  value={c.page}
                  onChange={(e) => update(i, { page: Number(e.target.value) })}
                />
              </RhField>
            </div>
            <RhField label="Extrait du texte" required hint="Recopiez le passage exact (10 caractères minimum).">
              <textarea
                className={`${rhInput} min-h-16`}
                value={c.excerpt}
                maxLength={2000}
                onChange={(e) => update(i, { excerpt: e.target.value })}
              />
            </RhField>
            <div className="flex justify-end">
              <Button variant="ghost" className="text-red-700" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                Retirer ce justificatif
              </Button>
            </div>
          </div>
        );
      })}
      {rows.length < 20 ? (
        <Button variant="secondary" disabled={!docs?.length} onClick={() => onChange([...rows, emptyCitation()])}>
          Ajouter un justificatif
        </Button>
      ) : null}
    </div>
  );
}

export function useLegalDocumentOpener() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function open(id: string) {
    setError(null);
    start(async () => {
      const r = await getLegalDocumentUrl(id);
      if (!r.ok) return setError(r.error);
      window.open(r.data.url, "_blank", "noopener,noreferrer");
    });
  }
  return { open, pending, error };
}

/** Cited documents, as the approver and the D2 decider see them, with the coverage and validity warnings. */
export function CitationsList({ citations, warnings }: { citations: CitationView[]; warnings: string[] }) {
  const opener = useLegalDocumentOpener();
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">Justificatifs ({citations.length})</h4>
      {opener.error ? <RhAlert tone="danger">{opener.error}</RhAlert> : null}
      {warnings.length ? (
        <RhAlert tone="warning">
          <ul className="list-disc space-y-0.5 pl-4">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </RhAlert>
      ) : null}
      {citations.length ? (
        <ul className="space-y-2">
          {citations.map((c) => (
            <li key={c.id} className="rounded-lg border border-border/60 p-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{legalDocShortLabel(c)}</span>
                {c.status !== "ACTIVE" ? (
                  <RhChip tone={c.status === "WITHDRAWN" ? "danger" : "warning"}>{legalDocStatusLabel(c.status)}</RhChip>
                ) : null}
                {c.latest_version_no > c.version_no ? <RhChip tone="warning">v{c.latest_version_no} au registre</RhChip> : null}
              </div>
              <p className="text-xs text-foreground/60">
                {c.article} · page {c.page} · application {applicationPeriodLabel(c.applies_from, c.applies_to)}
              </p>
              <blockquote className="mt-1 border-l-2 border-border pl-2 text-foreground/80">« {c.excerpt} »</blockquote>
              <div className="mt-1 flex justify-end">
                <Button variant="ghost" disabled={opener.pending} onClick={() => opener.open(c.document_id)}>
                  Voir le document
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
