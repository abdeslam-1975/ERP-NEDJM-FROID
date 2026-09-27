"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import {
  deleteContractDocument,
  prepareContractDocumentUpload,
  registerContractDocument,
  type ContractDocumentRow,
} from "@/lib/actions/contract-documents";
import {
  CONTRACT_DOCS_BUCKET,
  CONTRACT_DOC_ACCEPT,
  CONTRACT_DOC_KINDS,
  contractDocIssue,
  formatBytes,
  resolveContractDocType,
} from "@/lib/contracts/document-files";

const FORMAT_LABEL = { PDF: "PDF", WORD: "Word", EXCEL: "Excel", IMAGE: "Image" } as const;

function storage() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  ).storage.from(CONTRACT_DOCS_BUCKET);
}

function kindLabel(kind: string) {
  return CONTRACT_DOC_KINDS.find((item) => item.value === kind)?.label ?? kind;
}

export function ContractDocumentsTab({
  contractId,
  documents,
  canWrite,
  analysis,
}: {
  contractId: string;
  documents: ContractDocumentRow[];
  canWrite: boolean;
  analysis: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<string>("CONTRAT");
  const [title, setTitle] = useState("");
  const [signedOn, setSignedOn] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);

  function pick(selected: File | undefined) {
    setError(null);
    setInfo(null);
    if (!selected) return;
    const issue = contractDocIssue(selected.name, selected.size);
    if (issue) {
      setFile(null);
      setError(issue);
      return;
    }
    setFile(selected);
  }

  function upload() {
    if (!file) return;
    const type = resolveContractDocType(file.name);
    if (!type) return;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const prepared = await prepareContractDocumentUpload({
        contract_id: contractId,
        file_name: file.name,
        size: file.size,
      });
      if (!prepared.ok) {
        setError(prepared.error);
        return;
      }

      const { error: uploadError } = await storage().uploadToSignedUrl(
        prepared.data.path,
        prepared.data.token,
        new Blob([file], { type: type.mime }),
        { contentType: type.mime },
      );
      if (uploadError) {
        setError(`Envoi du fichier échoué : ${uploadError.message}`);
        return;
      }

      const saved = await registerContractDocument({
        contract_id: contractId,
        path: prepared.data.path,
        file_name: file.name,
        kind,
        title,
        signed_on: signedOn,
        notes,
      });
      if (!saved.ok) {
        setError(saved.error);
        return;
      }

      setFile(null);
      setTitle("");
      setSignedOn("");
      setNotes("");
      setInputKey((key) => key + 1);
      setInfo(`« ${saved.data.file_name} » enregistré.`);
      router.refresh();
    });
  }

  function remove(doc: ContractDocumentRow) {
    if (!window.confirm(`Supprimer « ${doc.file_name} » ? Le fichier sera effacé.`)) return;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await deleteContractDocument(doc.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInfo(`« ${doc.file_name} » supprimé.`);
      router.refresh();
    });
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <p className="text-sm text-foreground/70">
        Copie signée du contrat, avenants, annexes et PV. Formats : PDF, Word, Excel/CSV,
        photos (JPG, PNG, WEBP, HEIC), 25 Mo maximum par fichier. Vous pouvez ne joindre que
        les pages utiles (type « Extrait du contrat »).
      </p>

      {error ? (
        <p role="alert" className="rounded-md border border-alert-critical/40 bg-alert-critical/10 px-3 py-2 text-sm text-alert-critical">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="rounded-md border border-brand/30 bg-brand-muted/40 px-3 py-2 text-sm">{info}</p>
      ) : null}

      {canWrite ? (
        <div className="grid gap-3 rounded-md border border-dashed border-border p-3 sm:grid-cols-2">
          <label className="block text-sm font-medium sm:col-span-2">
            Fichier
            <input
              key={inputKey}
              type="file"
              accept={CONTRACT_DOC_ACCEPT}
              className="mt-1 block w-full text-sm"
              disabled={pending}
              onChange={(event) => pick(event.target.files?.[0])}
            />
            {file ? (
              <span className="mt-1 block text-xs text-foreground/60">
                {file.name} · {FORMAT_LABEL[resolveContractDocType(file.name)!.format]} ·{" "}
                {formatBytes(file.size)}
              </span>
            ) : null}
          </label>
          <label className="block text-sm font-medium">
            Type de document
            <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)}>
              {CONTRACT_DOC_KINDS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Date de signature
            <input
              type="date"
              className={inputClass}
              value={signedOn}
              onChange={(e) => setSignedOn(e.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            Intitulé
            <input
              className={inputClass}
              placeholder="Ex. Contrat signé, Avenant n° 1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            Remarque
            <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div className="sm:col-span-2">
            <Button onClick={upload} disabled={!file || pending}>
              {pending ? "Envoi…" : "Enregistrer le document"}
            </Button>
          </div>
        </div>
      ) : null}

      {analysis}

      {documents.length === 0 ? (
        <p className="text-sm">Aucun document joint.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-foreground/60">
              <tr>
                <th className="py-2">Document</th>
                <th>Type</th>
                <th>Format</th>
                <th>Taille</th>
                <th>Signé le</th>
                <th>Ajouté le</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => {
                const format = resolveContractDocType(doc.file_name)?.format;
                return (
                  <tr key={doc.id} className="border-t border-border align-top">
                    <td className="py-2">
                      <a
                        href={`/api/contracts/documents/${doc.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-brand hover:underline"
                      >
                        {doc.title || doc.file_name}
                      </a>
                      {doc.title ? (
                        <span className="block text-xs text-foreground/55">{doc.file_name}</span>
                      ) : null}
                      {doc.notes ? (
                        <span className="block text-xs text-foreground/55">{doc.notes}</span>
                      ) : null}
                    </td>
                    <td>{kindLabel(doc.kind)}</td>
                    <td>{format ? FORMAT_LABEL[format] : "—"}</td>
                    <td>{formatBytes(doc.size_bytes)}</td>
                    <td>{doc.signed_on ?? "—"}</td>
                    <td>{doc.created_at.slice(0, 10)}</td>
                    <td className="whitespace-nowrap text-right">
                      <a
                        href={`/api/contracts/documents/${doc.id}?download=1`}
                        className="font-semibold text-brand hover:underline"
                      >
                        Télécharger
                      </a>
                      {canWrite ? (
                        <button
                          type="button"
                          className="ms-3 font-semibold text-alert-critical hover:underline disabled:opacity-50"
                          disabled={pending}
                          onClick={() => remove(doc)}
                        >
                          Supprimer
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const inputClass =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";
