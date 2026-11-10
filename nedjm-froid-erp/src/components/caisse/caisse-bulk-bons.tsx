"use client";

import { useState } from "react";
import JSZip from "jszip";
import { attachCaisseBonPhoto, listCaisseBonAttachTargets } from "@/lib/actions/caisse";
import { extractBonFields } from "@/lib/caisse/bon-check";
import { matchBonToOperations, type BonAttachTarget } from "@/lib/caisse/bon-bulk-match";
import { prepareAndReadBon } from "@/lib/caisse/bon-ocr";
import { formatDa, formatDateFr } from "@/lib/caisse/soldes";

type RowResult = {
  fileName: string;
  status: "linked" | "ambiguous" | "already" | "none" | "unreadable" | "error";
  message: string;
  detectedDate: string | null;
  detectedAmount: number | null;
  matches: BonAttachTarget[];
  photoDataUrl?: string;
  linkedOp?: number;
};

const BON_FILE_RE = /\.(pdf|png|jpe?g|webp)$/i;

async function collectBonFiles(fileList: FileList | File[]): Promise<File[]> {
  const out: File[] = [];
  for (const file of Array.from(fileList)) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".zip")) {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const entries = Object.values(zip.files).filter((entry) => !entry.dir && BON_FILE_RE.test(entry.name));
      for (const entry of entries) {
        const blob = await entry.async("blob");
        const base = entry.name.split("/").pop() || entry.name;
        const type = base.toLowerCase().endsWith(".pdf") ? "application/pdf" : blob.type || "application/octet-stream";
        out.push(new File([blob], base, { type }));
      }
      continue;
    }
    if (BON_FILE_RE.test(name) || file.type.startsWith("image/") || file.type === "application/pdf") {
      out.push(file);
    }
  }
  return out;
}

export function CaisseBulkBonsPanel({
  months,
  initialMonth,
  onDone,
  onNotify,
}: {
  months: string[];
  initialMonth: string;
  onDone: () => Promise<void> | void;
  onNotify: (title: string, text: string) => void;
}) {
  const [month, setMonth] = useState(initialMonth === "TOUS" ? months[0] || "" : initialMonth);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<RowResult[]>([]);
  const [targets, setTargets] = useState<BonAttachTarget[]>([]);

  async function runImport(fileList: FileList | null) {
    if (!fileList?.length) return;
    if (!month) return onNotify("Mois", "Choisissez un mois");
    setBusy(true);
    setResults([]);
    setProgress("Chargement des opérations…");
    try {
      const listed = await listCaisseBonAttachTargets(month);
      if (!listed.ok) {
        onNotify("Bons", listed.error);
        return;
      }
      setTargets(listed.data.targets);
      setProgress(`Préparation des fichiers (sans photo: ${listed.data.withoutPhoto})…`);
      const files = await collectBonFiles(fileList);
      if (!files.length) {
        onNotify("Bons", "Aucun PDF/image trouvé");
        return;
      }

      const nextResults: RowResult[] = [];
      let linkedCount = 0;
      let pool = [...listed.data.targets];

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index]!;
        setProgress(`Lecture OCR ${index + 1}/${files.length} — ${file.name}`);
        try {
          const prepared = await prepareAndReadBon(file);
          const fields = prepared.extract.rawText ? prepared.extract : extractBonFields(prepared.rawText);
          const matched = matchBonToOperations(pool, fields.preferredDate, fields.preferredAmount);

          if (matched.status === "unique" && matched.matches[0]) {
            const target = matched.matches[0];
            const attached = await attachCaisseBonPhoto({
              operationId: target.operationId,
              photoDataUrl: prepared.dataUrl,
              bonMatchStatus: "ok",
            });
            if (!attached.ok) {
              nextResults.push({
                fileName: file.name,
                status: "error",
                message: attached.error,
                detectedDate: fields.preferredDate,
                detectedAmount: fields.preferredAmount,
                matches: matched.matches,
                photoDataUrl: prepared.dataUrl,
              });
            } else {
              linkedCount += 1;
              pool = pool.map((row) =>
                row.operationId === target.operationId ? { ...row, hasPhoto: true } : row,
              );
              nextResults.push({
                fileName: file.name,
                status: "linked",
                message: attached.data.message,
                detectedDate: fields.preferredDate,
                detectedAmount: fields.preferredAmount,
                matches: matched.matches,
                linkedOp: attached.data.op,
              });
            }
          } else {
            const label =
              matched.status === "ambiguous"
                ? "Plusieurs opérations possibles — choix manuel"
                : matched.status === "already"
                  ? "Déjà un bon sur l’opération correspondante"
                  : matched.status === "unreadable"
                    ? "Date/montant non lus sur le fichier"
                    : "Aucune opération (date+montant)";
            nextResults.push({
              fileName: file.name,
              status: matched.status === "ambiguous" ? "ambiguous" : matched.status === "already" ? "already" : matched.status === "unreadable" ? "unreadable" : "none",
              message: label,
              detectedDate: fields.preferredDate,
              detectedAmount: fields.preferredAmount,
              matches: matched.matches,
              photoDataUrl: prepared.dataUrl,
            });
          }
          setResults([...nextResults]);
        } catch (error) {
          nextResults.push({
            fileName: file.name,
            status: "error",
            message: error instanceof Error ? error.message : "Échec lecture",
            detectedDate: null,
            detectedAmount: null,
            matches: [],
          });
          setResults([...nextResults]);
        }
      }

      setTargets(pool);
      setProgress(`Terminé — ${linkedCount} bon(s) lié(s) / ${files.length} fichier(s)`);
      onNotify("Import bons", `${linkedCount} lié(s) automatiquement sur ${files.length}.`);
      await onDone();
    } finally {
      setBusy(false);
    }
  }

  async function attachManual(rowIndex: number, operationId: string) {
    const row = results[rowIndex];
    if (!row?.photoDataUrl || !operationId) return;
    setBusy(true);
    try {
      const attached = await attachCaisseBonPhoto({
        operationId,
        photoDataUrl: row.photoDataUrl,
        bonMatchStatus: "ok",
      });
      if (!attached.ok) return onNotify("Bon", attached.error);
      setResults((current) =>
        current.map((item, i) =>
          i === rowIndex
            ? {
                ...item,
                status: "linked",
                message: attached.data.message,
                linkedOp: attached.data.op,
                matches: item.matches.filter((m) => m.operationId === operationId),
              }
            : item,
        ),
      );
      setTargets((current) =>
        current.map((t) => (t.operationId === operationId ? { ...t, hasPhoto: true } : t)),
      );
      onNotify("Bon", attached.data.message);
      await onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bulk-bons">
      <h6 className="admin-section-title">Import massif des bons (PDF / images / ZIP)</h6>
      <p className="hint">
        Lecture automatique date + montant, rattachement à l’achat du mois. Un seul match → lien auto.
        Ambigu / illisible → choix manuel. Les opérations qui ont déjà un bon ne sont pas écrasées.
      </p>
      <div className="bulk-bons-controls">
        <label className="field">
          <span>Mois</span>
          <select value={month} onChange={(event) => setMonth(event.target.value)} disabled={busy}>
            {months.filter((name) => name !== "TOUS").map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Fichiers</span>
          <input
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.webp,.zip,application/pdf,image/*,application/zip"
            disabled={busy || !month}
            onChange={(event) => {
              const files = event.target.files;
              event.target.value = "";
              void runImport(files);
            }}
          />
        </label>
      </div>
      {progress ? <p className="hint bulk-bons-progress">{progress}{targets.length ? ` · ${targets.filter((t) => !t.hasPhoto).length} sans photo` : ""}</p> : null}
      {results.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Fichier</th>
                <th>Date lue</th>
                <th>Montant lu</th>
                <th>Résultat</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {results.map((row, index) => (
                <tr key={`${row.fileName}-${index}`} className={`bulk-row ${row.status}`}>
                  <td className="libelle">{row.fileName}</td>
                  <td>{row.detectedDate ? formatDateFr(row.detectedDate) : "—"}</td>
                  <td>{row.detectedAmount != null ? `${formatDa(row.detectedAmount)} DA` : "—"}</td>
                  <td>
                    {row.status === "linked"
                      ? `Lié N° ${row.linkedOp}`
                      : row.message}
                  </td>
                  <td>
                    {(row.status === "ambiguous" || row.status === "none" || row.status === "unreadable") && row.photoDataUrl ? (
                      <select
                        defaultValue=""
                        disabled={busy}
                        onChange={(event) => {
                          const id = event.target.value;
                          event.target.value = "";
                          if (id) void attachManual(index, id);
                        }}
                      >
                        <option value="">Choisir N°…</option>
                        {(row.matches.length ? row.matches : targets.filter((t) => !t.hasPhoto)).map((m) => (
                          <option key={m.operationId} value={m.operationId}>
                            N° {m.op} · {formatDateFr(m.date)} · {formatDa(m.amount)} · {m.buyer}
                          </option>
                        ))}
                      </select>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {busy ? <div className="hint">Traitement en cours — ne fermez pas la fenêtre…</div> : null}
    </div>
  );
}
