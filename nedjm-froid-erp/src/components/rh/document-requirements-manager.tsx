"use client";

import { useMemo, useState, useTransition } from "react";
import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import { setDocumentRequiredForSave } from "@/lib/actions/hr-catalogs";
import { Button } from "@/components/ui/button";
import {
  RhAlert,
  RhPanel,
  RhSectionTitle,
  RhTableWrap,
  catalogOptionLabel,
  rhTd,
  rhTh,
} from "@/components/rh/rh-ui";
import {
  isDocumentRequiredForSave,
  isEmployeeUploadDocument,
} from "@/lib/hr/required-documents";

export function DocumentRequirementsManager({
  catalogs,
  isSuperAdmin,
}: {
  catalogs: CatalogItem[];
  isSuperAdmin: boolean;
}) {
  const [rows, setRows] = useState(
    () =>
      catalogs
        .filter((c) => c.kind === "document_type" && c.is_active && isEmployeeUploadDocument(c))
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order),
  );
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const requiredCount = useMemo(
    () => rows.filter((r) => isDocumentRequiredForSave(r)).length,
    [rows],
  );

  return (
    <RhPanel>
      <RhSectionTitle>Documents obligatoires (fiche employé)</RhSectionTitle>
      <p className="mb-3 text-xs text-foreground/55">
        {isSuperAdmin
          ? "Cochez les documents exigés avant tout nouvel enregistrement de la fiche (après la première création). Réservé à SUPER_ADMIN."
          : "Consultation seule. Seul SUPER_ADMIN peut rendre un document obligatoire ou optionnel."}
      </p>
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {info ? <RhAlert tone="success">{info}</RhAlert> : null}
      <p className="mb-2 text-sm text-foreground/70">
        Obligatoires actuellement : <strong>{requiredCount}</strong>
      </p>
      <RhTableWrap>
        <table className="min-w-full text-sm">
          <thead className="border-b border-border/70 bg-surface-muted/80">
            <tr>
              <th className={rhTh()}>Document</th>
              <th className={rhTh()}>Code</th>
              <th className={rhTh()}>Obligatoire pour enregistrer</th>
              <th className={rhTh()} />
            </tr>
          </thead>
          <tbody>
            {rows.map((doc) => (
              <tr key={doc.id} className="border-t border-border/60">
                <td className={rhTd()}>{catalogOptionLabel(doc)}</td>
                <td className={`${rhTd()} font-mono text-xs`}>{doc.code}</td>
                <td className={rhTd()}>
                  <input
                    type="checkbox"
                    checked={isDocumentRequiredForSave(doc)}
                    disabled={!isSuperAdmin || pending}
                    onChange={(e) => {
                      const required_for_save = e.target.checked;
                      setRows((prev) =>
                        prev.map((r) =>
                          r.id === doc.id
                            ? {
                                ...r,
                                extra: { ...r.extra, required_for_save },
                              }
                            : r,
                        ),
                      );
                    }}
                  />
                </td>
                <td className={rhTd()}>
                  {isSuperAdmin ? (
                    <Button
                      variant="secondary"
                      disabled={pending}
                      onClick={() => {
                        setError(null);
                        start(async () => {
                          const result = await setDocumentRequiredForSave({
                            id: doc.id,
                            required_for_save: isDocumentRequiredForSave(doc),
                          });
                          if (!result.ok) {
                            setError(result.error);
                            return;
                          }
                          setInfo(`${doc.label_fr} mis à jour.`);
                        });
                      }}
                    >
                      Enregistrer
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </RhTableWrap>
      {!rows.length ? (
        <p className="mt-2 text-sm text-foreground/55">
          Aucun type de document à téléverser. Ajoutez-les dans « Listes et codes ».
        </p>
      ) : null}
    </RhPanel>
  );
}
