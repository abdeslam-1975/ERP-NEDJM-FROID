"use client";

import { useState, useTransition } from "react";
import { createClient } from "@supabase/supabase-js";
import { ScanText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RhAlert, RhModal } from "@/components/rh/rh-ui";
import { prepareContractPdfUpload, readContractPdf } from "@/lib/actions/hr-contract-pdf";
import { CONTRACT_PDF_MAX_BYTES, CONTRACT_PDF_MIME, type ContractPdfMime, type ContractPdfRead } from "@/lib/hr/contract-pdf";
import { HR_DOCS_BUCKET } from "@/lib/hr/hr-file-url";

export type ContractPdfScan = { path: string; file_name: string; read: ContractPdfRead };

function storage() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(HR_DOCS_BUCKET);
}

function mimeOf(file: File): ContractPdfMime | null {
  const type = file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : "");
  return (CONTRACT_PDF_MIME as readonly string[]).includes(type) ? (type as ContractPdfMime) : null;
}

export function ContractPdfDialog({ onClose, onRead }: { onClose: () => void; onRead: (scan: ContractPdfScan) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState("");
  const [pending, start] = useTransition();

  function read() {
    if (!file) return;
    const mime = mimeOf(file);
    if (!mime) return setError("Choisissez un PDF ou une image (JPG, PNG, WEBP).");
    if (file.size > CONTRACT_PDF_MAX_BYTES) return setError("Fichier supérieur à 14 Mo.");
    setError(null);
    start(async () => {
      setStage("Envoi du fichier…");
      const slot = await prepareContractPdfUpload({ mime, size: file.size });
      if (!slot.ok) {
        setError(slot.error);
        return;
      }
      const up = await storage().uploadToSignedUrl(slot.data.path, slot.data.token, file, { contentType: mime });
      if (up.error) {
        setError(up.error.message);
        return;
      }
      setStage("Lecture du contrat par l'IA… (jusqu'à une minute)");
      const result = await readContractPdf({ path: slot.data.path, file_name: file.name });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onRead({ path: slot.data.path, file_name: file.name, read: result.data });
    });
  }

  return (
    <RhModal
      title="Importer un contrat PDF · استيراد عقد PDF"
      subtitle="Contrat signé scanné (PDF ou photo). L'IA remplit la fiche contrat ; vous vérifiez avant d'enregistrer."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={!file || pending} onClick={read}>
            <ScanText aria-hidden />
            {pending ? "Lecture…" : "Lire le contrat"}
          </Button>
        </>
      }
    >
      <div className="space-y-4 p-2">
        {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
        {pending ? <RhAlert tone="info">{stage}</RhAlert> : null}
        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-surface px-6 py-14 text-center transition hover:border-brand/60 hover:bg-brand/[0.03]">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-muted text-brand">
            <ScanText className="h-7 w-7" strokeWidth={1.6} aria-hidden />
          </span>
          <span className="text-base font-semibold text-foreground">{file ? file.name : "Choisir le contrat"}</span>
          <span className="max-w-xl text-sm text-foreground/55">
            Une seule personne par fichier. Le fichier original est ensuite archivé avec le contrat.
          </span>
          <input
            type="file"
            accept=".pdf,application/pdf,image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={pending}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>
    </RhModal>
  );
}
