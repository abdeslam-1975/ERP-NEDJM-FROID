"use client";

import { useCallback, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { DataTable, dataColumns } from "@/components/ui/data-table";
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

const col = dataColumns<ContractDocumentRow>();

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

  const remove = useCallback(
    (doc: ContractDocumentRow) => {
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
    },
    [router],
  );

  const columns = useMemo(
    () => [
      col.accessor((doc) => doc.title || doc.file_name, {
        id: "document",
        header: "Document",
        cell: (info) => {
          const doc = info.row.original;
          return (
            <>
              <a
                href={`/api/contracts/documents/${doc.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-brand hover:underline"
              >
                {info.getValue()}
              </a>
              {doc.title ? <span className="block text-xs text-foreground/55">{doc.file_name}</span> : null}
              {doc.notes ? <span className="block text-xs text-foreground/55">{doc.notes}</span> : null}
            </>
          );
        },
      }),
      col.accessor((doc) => kindLabel(doc.kind), { id: "kind", header: "Type" }),
      col.accessor(
        (doc) => {
          const format = resolveContractDocType(doc.file_name)?.format;
          return format ? FORMAT_LABEL[format] : "—";
        },
        { id: "format", header: "Format" },
      ),
      col.accessor("size_bytes", {
        header: "Taille",
        meta: { className: "tabular-nums" },
        cell: (info) => formatBytes(info.getValue()),
      }),
      col.accessor((doc) => doc.signed_on ?? "", {
        id: "signed_on",
        header: "Signé le",
        cell: (info) => info.getValue() || "—",
      }),
      col.accessor((doc) => doc.created_at.slice(0, 10), { id: "created_at", header: "Ajouté le" }),
      col.display({
        id: "actions",
        header: "",
        enableSorting: false,
        enableHiding: false,
        meta: { align: "right", className: "whitespace-nowrap" },
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-3">
            <a
              href={`/api/contracts/documents/${row.original.id}?download=1`}
              className="font-semibold text-brand hover:underline"
            >
              Télécharger
            </a>
            {canWrite ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-alert-critical"
                disabled={pending}
                onClick={() => remove(row.original)}
              >
                Supprimer
              </Button>
            ) : null}
          </div>
        ),
      }),
    ],
    [canWrite, pending, remove],
  );

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

      <DataTable
        data={documents}
        columns={columns}
        getRowId={(doc) => doc.id}
        searchable={false}
        columnToggle={false}
        pageSize={0}
        emptyTitle="Aucun document joint."
      />
    </section>
  );
}

const inputClass =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";
