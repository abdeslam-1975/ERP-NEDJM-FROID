"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import {
  listHrFilesForEmployee,
  type HrFileRow,
} from "@/lib/actions/hr-documents";
import { Button } from "@/components/ui/button";
import { RhAlert, RhModal } from "@/components/rh/rh-ui";
import {
  isDocumentRequiredForSave,
  isEmployeeUploadDocument,
} from "@/lib/hr/required-documents";

export function EmployeeAdminDossierDialog({
  employeeId,
  employeeLabel,
  catalogs,
  onClose,
  onOpenFiche,
}: {
  employeeId: string;
  employeeLabel: string;
  catalogs: CatalogItem[];
  onClose: () => void;
  onOpenFiche?: () => void;
}) {
  const [files, setFiles] = useState<HrFileRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const slots = useMemo(
    () =>
      catalogs
        .filter(
          (c) => c.kind === "document_type" && c.is_active && isEmployeeUploadDocument(c),
        )
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order),
    [catalogs],
  );

  const archive = files.find((f) => f.doc_type_code === "FICHE_RENSEIGNEMENTS");

  function reload() {
    start(async () => {
      const result = await listHrFilesForEmployee(employeeId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setFiles(result.data);
    });
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  function fileFor(code: string) {
    return files.find((f) => f.doc_type_code === code);
  }

  const present = slots.filter((s) => !!fileFor(s.code)).length;
  const requiredMissing = slots.filter(
    (s) => isDocumentRequiredForSave(s) && !fileFor(s.code),
  ).length;

  return (
    <RhModal
      size="lg"
      title="Fichier administratif"
      subtitle={employeeLabel}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" className="mr-auto" onClick={onClose}>
            Fermer
          </Button>
          <Button variant="secondary" disabled={pending} onClick={reload}>
            Actualiser
          </Button>
          {onOpenFiche ? (
            <Button
              onClick={() => {
                onClose();
                onOpenFiche();
              }}
            >
              Ouvrir la fiche
            </Button>
          ) : null}
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-lg bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800">
          {present} / {slots.length} documents
        </span>
        {requiredMissing > 0 ? (
          <span className="rounded-lg bg-amber-50 px-2.5 py-1 font-semibold text-amber-900">
            {requiredMissing} obligatoire(s) manquant(s)
          </span>
        ) : null}
      </div>

      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}

      {archive?.file_url ? (
        <div className="mb-3 rounded-xl border border-brand/20 bg-brand/[0.04] px-3 py-2 text-sm">
          <span className="font-semibold">Fiche de renseignements :</span>{" "}
          <a
            className="text-brand underline"
            href={archive.file_url}
            target="_blank"
            rel="noreferrer"
          >
            {archive.file_name || "Ouvrir le PDF"}
          </a>
        </div>
      ) : null}

      <ul className="space-y-2">
        {slots.map((slot) => {
          const file = fileFor(slot.code);
          const ok = !!file;
          const required = isDocumentRequiredForSave(slot);
          return (
            <li
              key={slot.id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 ${
                ok
                  ? "border-emerald-200/80 bg-emerald-50/50"
                  : "border-border/60 bg-surface-muted/30"
              }`}
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white ${
                    ok ? "bg-emerald-600" : "bg-slate-300"
                  }`}
                  aria-hidden
                >
                  {ok ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M5 12.5l5 5L19 7"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <span className="text-[10px] font-bold leading-none">–</span>
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {slot.label_fr}
                    {required ? (
                      <span className="ml-2 text-[10px] font-bold uppercase text-alert-critical">
                        Obligatoire
                      </span>
                    ) : null}
                  </p>
                  {slot.label_ar ? (
                    <p className="text-xs text-foreground/50" dir="rtl">
                      {slot.label_ar}
                    </p>
                  ) : null}
                  {file?.file_name ? (
                    <p className="mt-0.5 truncate text-xs text-foreground/55">
                      {file.file_name}
                    </p>
                  ) : !ok ? (
                    <p className="mt-0.5 text-xs text-foreground/45">Non téléversé</p>
                  ) : null}
                </div>
              </div>
              {file?.file_url ? (
                <a
                  className="shrink-0 rounded-lg border border-emerald-300/80 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-900"
                  href={file.file_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Voir
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>

      {!slots.length ? (
        <p className="text-sm text-foreground/55">
          Aucun type de document dans le référentiel.
        </p>
      ) : null}

      {pending ? (
        <p className="mt-3 text-xs text-foreground/50">Chargement…</p>
      ) : null}
    </RhModal>
  );
}
