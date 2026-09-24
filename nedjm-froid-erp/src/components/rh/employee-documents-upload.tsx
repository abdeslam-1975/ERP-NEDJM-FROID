"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import {
  listHrFilesForEmployee,
  uploadHrEmployeeDocument,
  type HrFileRow,
} from "@/lib/actions/hr-documents";
import { Button } from "@/components/ui/button";
import { RhAlert, rhInput } from "@/components/rh/rh-ui";
import { runDocumentOcr } from "@/lib/hr/ocr/run-ocr";
import {
  isOcrDocProfile,
  type OcrDocProfile,
  type OcrFieldSuggestion,
} from "@/lib/hr/ocr/types";
import { sanitizeOcrSuggestion } from "@/lib/hr/ocr/extractors";
import {
  isDocumentRequiredForSave,
  isEmployeeUploadDocument,
} from "@/lib/hr/required-documents";

function isOcrEnabled(item: CatalogItem): boolean {
  return (
    isOcrDocProfile(item.code) &&
    (item.extra?.ocr_enabled === true || item.extra?.upload_slot === true)
  );
}

type DoneDoc = {
  code: string;
  label: string;
  file_url?: string | null;
  file_name?: string | null;
};

export function EmployeeDocumentsUpload({
  employeeId,
  catalogs,
  onApplySuggestions,
}: {
  employeeId: string | undefined;
  catalogs: CatalogItem[];
  onApplySuggestions: (fields: Record<string, string>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<HrFileRow[]>([]);
  /** Suivi local immédiat (même avant reload serveur). */
  const [doneDocs, setDoneDocs] = useState<DoneDoc[]>([]);
  const [selectedCode, setSelectedCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<OcrFieldSuggestion[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [ocrProfile, setOcrProfile] = useState<OcrDocProfile | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);

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

  const doneByCode = useMemo(() => {
    const map = new Map<string, DoneDoc>();
    for (const f of files) {
      const slot = slots.find((s) => s.code === f.doc_type_code);
      map.set(f.doc_type_code, {
        code: f.doc_type_code,
        label: slot?.label_fr ?? f.doc_type_code,
        file_url: f.file_url,
        file_name: f.file_name,
      });
    }
    for (const d of doneDocs) {
      if (!map.has(d.code)) map.set(d.code, d);
      else {
        const cur = map.get(d.code)!;
        map.set(d.code, {
          ...cur,
          file_url: cur.file_url || d.file_url,
          file_name: cur.file_name || d.file_name,
        });
      }
    }
    return map;
  }, [files, doneDocs, slots]);

  const pendingSlots = slots.filter((s) => !doneByCode.has(s.code));
  const completedList = slots
    .filter((s) => doneByCode.has(s.code))
    .map((s) => doneByCode.get(s.code)!);

  const selectedSlot = slots.find((s) => s.code === selectedCode);
  const selectedNeedsOcr = selectedSlot ? isOcrEnabled(selectedSlot) : false;

  function markDone(doc: DoneDoc) {
    setDoneDocs((prev) => {
      const rest = prev.filter((d) => d.code !== doc.code);
      return [...rest, doc];
    });
    setSelectedCode("");
  }

  function syncFromServer(rows: HrFileRow[]) {
    setFiles(rows);
    setDoneDocs((prev) =>
      prev.filter((d) => !rows.some((r) => r.doc_type_code === d.code)),
    );
  }

  useEffect(() => {
    if (!employeeId) {
      setFiles([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await listHrFilesForEmployee(employeeId);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      syncFromServer(result.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  function resetOcrUi() {
    setSuggestions([]);
    setSelected({});
    setEdited({});
    setPendingFile(null);
    setOcrProfile(null);
    setProgress(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function uploadFile(docType: string, file: File): Promise<HrFileRow | null> {
    if (!employeeId) {
      setError("Enregistrez d'abord la fiche, puis importez le document.");
      return null;
    }
    const data = new FormData();
    data.set("file", file);
    data.set("employee_id", employeeId);
    data.set("doc_type_code", docType);
    const result = await uploadHrEmployeeDocument(data);
    if (!result.ok) {
      setError(result.error);
      return null;
    }
    setFiles((prev) => {
      const rest = prev.filter((f) => f.doc_type_code !== result.data.doc_type_code);
      return [...rest, result.data];
    });
    return result.data;
  }

  async function handlePickedFile(file: File | null) {
    if (!file || !selectedCode) return;
    setError(null);
    const label = selectedSlot?.label_fr ?? selectedCode;

    if (selectedNeedsOcr && isOcrDocProfile(selectedCode)) {
      setPendingFile(file);
      setOcrProfile(selectedCode);
      setSuggestions([]);
      setBusy(true);
      setProgress(0);
      try {
        const result = await runDocumentOcr(file, selectedCode, setProgress);
        setSuggestions(result.suggestions);
        const sel: Record<string, boolean> = {};
        const ed: Record<string, string> = {};
        for (const s of result.suggestions) {
          sel[s.code] = true;
          ed[s.code] = sanitizeOcrSuggestion(s.code, s.value);
        }
        setSelected(sel);
        setEdited(ed);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Échec OCR.");
        setPendingFile(null);
        setOcrProfile(null);
      } finally {
        setBusy(false);
        setProgress(null);
      }
      return;
    }

    // Document sans OCR : téléversement direct → ✓ sous la liste
    setBusy(true);
    try {
      if (!employeeId) {
        // Pas encore de fiche : marquer localement pour le suivi UI
        markDone({ code: selectedCode, label, file_name: file.name });
        setError("Document noté. Enregistrez la fiche pour l'archiver définitivement.");
        return;
      }
      const row = await uploadFile(selectedCode, file);
      if (!row) return;
      markDone({
        code: row.doc_type_code,
        label,
        file_url: row.file_url,
        file_name: row.file_name,
      });
    } finally {
      setBusy(false);
    }
  }

  function confirmOcrAndArchive() {
    if (!ocrProfile || !pendingFile) {
      setError("Choisissez d'abord un fichier.");
      return;
    }
    const label = slots.find((s) => s.code === ocrProfile)?.label_fr ?? ocrProfile;

    const patch: Record<string, string> = {};
    for (const s of suggestions) {
      if (!selected[s.code]) continue;
      const v = sanitizeOcrSuggestion(s.code, edited[s.code] ?? s.value);
      if (v) patch[s.code] = v;
    }
    if (Object.keys(patch).length) onApplySuggestions(patch);

    start(async () => {
      if (employeeId) {
        const row = await uploadFile(ocrProfile, pendingFile);
        if (row) {
          markDone({
            code: row.doc_type_code,
            label,
            file_url: row.file_url,
            file_name: row.file_name,
          });
        } else {
          // Échec archivage : on marque quand même (champs déjà appliqués)
          markDone({ code: ocrProfile, label, file_name: pendingFile.name });
        }
      } else {
        markDone({ code: ocrProfile, label, file_name: pendingFile.name });
        setError("Champs appliqués. Enregistrez la fiche pour archiver le fichier.");
      }
      resetOcrUi();
    });
  }

  return (
    <div className="rounded-lg border border-border/60 bg-surface px-2.5 py-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[14rem] flex-1 text-[11px] font-semibold text-foreground/70">
          Type de document
          <select
            className={`${rhInput} mt-0.5 h-9 py-1 text-sm`}
            value={selectedCode}
            disabled={busy || pending || !!ocrProfile}
            onChange={(e) => {
              setSelectedCode(e.target.value);
              setError(null);
            }}
          >
            <option value="">— Choisir un document —</option>
            {pendingSlots.map((slot) => (
              <option key={slot.id} value={slot.code}>
                {slot.label_fr}
                {isDocumentRequiredForSave(slot) ? " *" : ""}
              </option>
            ))}
          </select>
        </label>
        <input
          ref={fileRef}
          type="file"
          accept={
            selectedNeedsOcr
              ? "image/jpeg,image/png,image/webp"
              : "application/pdf,image/jpeg,image/png,image/webp,image/gif"
          }
          className="hidden"
          disabled={busy || pending || !selectedCode || !!ocrProfile}
          onChange={(e) => {
            void handlePickedFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="secondary"
          className="h-9 px-3 text-xs"
          disabled={busy || pending || !selectedCode || !!ocrProfile}
          onClick={() => fileRef.current?.click()}
        >
          {busy
            ? progress != null
              ? `${progress}%`
              : "…"
            : "Importer"}
        </Button>
      </div>

      {/* Liste des documents traités — sous la liste déroulante, avec ✓ */}
      {completedList.length > 0 ? (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {completedList.map((doc) => (
            <li
              key={doc.code}
              className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-emerald-300/80 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-950"
            >
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"
                aria-hidden
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 12.5l5 5L19 7"
                    stroke="currentColor"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="truncate">{doc.label}</span>
              {doc.file_url ? (
                <a
                  className="font-medium text-brand underline"
                  href={doc.file_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Voir
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <div className="mt-1.5">
          <RhAlert tone="danger">{error}</RhAlert>
        </div>
      ) : null}

      {suggestions.length > 0 || (ocrProfile && pendingFile) ? (
        <div className="mt-1.5 max-h-[28vh] space-y-1.5 overflow-y-auto rounded-md border border-brand/20 bg-brand/[0.03] p-2">
          <p className="text-[11px] font-semibold text-brand">
            Vérification — {selectedSlot?.label_fr ?? ocrProfile}
          </p>
          {suggestions.length > 0 ? (
            <ul className="space-y-1">
              {suggestions.map((s) => (
                <li key={s.code} className="flex flex-wrap items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={!!selected[s.code]}
                    onChange={(e) =>
                      setSelected((prev) => ({ ...prev, [s.code]: e.target.checked }))
                    }
                  />
                  <span className="min-w-[6rem] text-[11px] font-medium">{s.label}</span>
                  <input
                    className={`${rhInput} mt-0 h-8 min-w-[8rem] flex-1 py-1 text-xs`}
                    value={edited[s.code] ?? s.value}
                    onChange={(e) =>
                      setEdited((prev) => ({
                        ...prev,
                        [s.code]: sanitizeOcrSuggestion(s.code, e.target.value),
                      }))
                    }
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-foreground/60">Aucune suggestion.</p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              className="h-8 px-3 text-xs"
              disabled={pending || busy}
              onClick={confirmOcrAndArchive}
            >
              Valider
            </Button>
            <Button
              type="button"
              className="h-8 px-3 text-xs"
              variant="ghost"
              disabled={pending || busy}
              onClick={() => {
                resetOcrUi();
                setSelectedCode("");
              }}
            >
              Annuler
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
