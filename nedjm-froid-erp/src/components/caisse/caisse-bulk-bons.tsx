"use client";

import { useState } from "react";
import JSZip from "jszip";
import { attachCaisseBonPhoto, listCaisseBonAttachTargets, readCaisseBonWithAi } from "@/lib/actions/caisse";
import {
  bonExtractNeedsAi,
  extractBonFields,
  extractBonFieldsFromFileName,
  type BonExtract,
} from "@/lib/caisse/bon-check";
import { matchBonToOperations, type BonAttachTarget } from "@/lib/caisse/bon-bulk-match";
import { prepareAndReadBon } from "@/lib/caisse/bon-ocr";
import { formatDa, formatDateFr } from "@/lib/caisse/soldes";

type RowResult = {
  fileName: string;
  status: "linked" | "ambiguous" | "already" | "none" | "unreadable" | "error" | "skipped";
  message: string;
  detectedDate: string | null;
  detectedAmount: number | null;
  matches: BonAttachTarget[];
  photoDataUrl?: string;
  linkedOp?: number;
};

const BON_FILE_RE = /\.(pdf|png|jpe?g|webp)$/i;
/** Au-delà, demander un dossier ou plusieurs petits ZIP. */
const MAX_ZIP_BYTES = 150 * 1024 * 1024;
const MAX_SINGLE_FILE_BYTES = 40 * 1024 * 1024;

function isBonFileName(name: string): boolean {
  return BON_FILE_RE.test(name);
}

async function* iterateBonFiles(files: File[]): AsyncGenerator<File> {
  for (const file of files) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".zip") || file.type === "application/zip" || file.type === "application/x-zip-compressed") {
      if (file.size > MAX_ZIP_BYTES) {
        throw new Error(
          `ZIP trop volumineux (${(file.size / (1024 * 1024)).toFixed(0)} Mo). Divisez en plusieurs ZIP (20–40 bons) ou utilisez « Dossier ».`,
        );
      }
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const entries = Object.values(zip.files)
        .filter((entry) => !entry.dir && isBonFileName(entry.name))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"));
      for (const entry of entries) {
        const blob = await entry.async("blob");
        const base = entry.name.split("/").pop() || entry.name;
        const type = base.toLowerCase().endsWith(".pdf") ? "application/pdf" : blob.type || "application/octet-stream";
        yield new File([blob], base, { type });
      }
      continue;
    }
    if (isBonFileName(file.name) || file.type.startsWith("image/") || file.type === "application/pdf") {
      yield file;
    }
  }
}

export function CaisseBulkBonsPanel({
  months,
  initialMonth,
  onDone,
  onNotify,
}: {
  months: string[];
  initialMonth: string;
  /** Appelé avec le mois importé pour resynchroniser le journal. */
  onDone: (month: string) => Promise<void> | void;
  onNotify: (title: string, text: string) => void;
}) {
  const [month, setMonth] = useState(initialMonth === "TOUS" ? months[0] || "" : initialMonth);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<RowResult[]>([]);
  const [targets, setTargets] = useState<BonAttachTarget[]>([]);
  const [pickedLabel, setPickedLabel] = useState("");

  async function processOne(
    file: File,
    pool: BonAttachTarget[],
  ): Promise<{ row: RowResult; pool: BonAttachTarget[]; linked: boolean }> {
    if (file.size > MAX_SINGLE_FILE_BYTES) {
      return {
        linked: false,
        pool,
        row: {
          fileName: file.name,
          status: "skipped",
          message: `Fichier trop lourd (${(file.size / (1024 * 1024)).toFixed(1)} Mo) — ignorez ou compressez`,
          detectedDate: null,
          detectedAmount: null,
          matches: [],
        },
      };
    }

    const prepared = await prepareAndReadBon(file);
    let fields: BonExtract = prepared.extract.rawText
      ? prepared.extract
      : extractBonFields(prepared.rawText);
    const fromName = extractBonFieldsFromFileName(file.name);
    let aiNote = "";
    if (bonExtractNeedsAi(fields)) {
      const ai = await readCaisseBonWithAi({ photoDataUrl: prepared.dataUrl });
      if (ai.ok) {
        aiNote = " · IA";
        fields = {
          dates: [...new Set([...(ai.data.date ? [ai.data.date] : []), ...fields.dates])],
          amounts: [...new Set([...(ai.data.amounts || []), ...fields.amounts, ...(ai.data.amount != null ? [ai.data.amount] : [])])],
          preferredDate: ai.data.date || fields.preferredDate,
          preferredAmount: ai.data.amount ?? fields.preferredAmount,
          rawText: fields.rawText,
        };
      } else {
        aiNote = ` · IA: ${ai.error}`;
      }
    }
    const candidateDates = [...new Set([...fields.dates, ...fromName.dates])];
    const candidateAmounts = [...new Set([...fields.amounts, ...fromName.amounts])];
    const matched = matchBonToOperations(
      pool,
      fields.preferredDate || fromName.dates[0] || null,
      fields.preferredAmount ?? fromName.amounts[0] ?? null,
      {
        candidateDates,
        candidateAmounts,
        rawText: prepared.rawText || fields.rawText,
      },
    );
    const shownDate = matched.matches[0]?.date || fields.preferredDate;
    const shownAmount = matched.matches[0]?.amount ?? fields.preferredAmount;

    if (matched.status === "unique" && matched.matches[0]) {
      const target = matched.matches[0];
      const attached = await attachCaisseBonPhoto({
        operationId: target.operationId,
        photoDataUrl: prepared.dataUrl,
        bonMatchStatus: matched.strategy === "date+amount" ? "ok" : "warn",
      });
      if (!attached.ok) {
        return {
          linked: false,
          pool,
          row: {
            fileName: file.name,
            status: "error",
            message: attached.error,
            detectedDate: shownDate,
            detectedAmount: shownAmount,
            matches: matched.matches,
            photoDataUrl: prepared.dataUrl,
          },
        };
      }
      return {
        linked: true,
        pool: pool.map((row) => (row.operationId === target.operationId ? { ...row, hasPhoto: true } : row)),
        row: {
          fileName: file.name,
          status: "linked",
          message: `${attached.data.message}${matched.strategy && matched.strategy !== "date+amount" ? ` (${matched.strategy})` : ""}${aiNote}`,
          detectedDate: shownDate,
          detectedAmount: shownAmount,
          matches: matched.matches,
          linkedOp: attached.data.op,
        },
      };
    }

    const ocrHint = [
      fields.preferredDate ? `date=${fields.preferredDate}` : null,
      fields.preferredAmount != null ? `montant=${fields.preferredAmount}` : null,
      fields.amounts.length ? `candidats=${fields.amounts.slice(0, 5).join("|")}` : null,
      prepared.rawText?.trim()
        ? `ocr="${prepared.rawText.trim().replace(/\s+/g, " ").slice(0, 80)}"`
        : "ocr=vide",
    ]
      .filter(Boolean)
      .join(" · ");

    const label =
      matched.status === "ambiguous"
        ? `Plusieurs opérations possibles — choix manuel${aiNote}`
        : matched.status === "already"
          ? "Déjà un bon sur l’opération correspondante"
          : matched.status === "unreadable"
            ? `Date/montant non lus (${ocrHint})${aiNote}`
            : `Aucune opération pour ce mois (${ocrHint})${aiNote}`;
    return {
      linked: false,
      pool,
      row: {
        fileName: file.name,
        status:
          matched.status === "ambiguous"
            ? "ambiguous"
            : matched.status === "already"
              ? "already"
              : matched.status === "unreadable"
                ? "unreadable"
                : "none",
        message: label,
        detectedDate: shownDate,
        detectedAmount: shownAmount,
        matches: matched.matches,
        photoDataUrl: prepared.dataUrl,
      },
    };
  }

  async function runImport(files: File[]) {
    if (!files.length) {
      onNotify("Bons", "Aucun fichier sélectionné");
      return;
    }
    if (!month) return onNotify("Mois", "Choisissez un mois");
    setBusy(true);
    setResults([]);
    setPickedLabel(`${files.length} fichier(s) · mois ${month}`);
    setProgress(`Préparation — mois ${month} · ${files.length} fichier(s)…`);
    try {
      const listed = await listCaisseBonAttachTargets(month);
      if (!listed.ok) {
        onNotify("Bons", listed.error);
        return;
      }
      if (!listed.data.targets.length) {
        onNotify("Mois", `Aucune opération ACHAT pour « ${month} ». Vérifiez le mois sélectionné.`);
        return;
      }
      if (!listed.data.withoutPhoto) {
        onNotify("Bons", `Toutes les opérations de « ${month} » ont déjà un bon.`);
        return;
      }
      setTargets(listed.data.targets);
      setProgress(
        `${month} : ${listed.data.targets.length} achat(s), ${listed.data.withoutPhoto} sans photo — lecture…`,
      );

      const nextResults: RowResult[] = [];
      let linkedCount = 0;
      let pool = [...listed.data.targets];
      let index = 0;

      for await (const file of iterateBonFiles(files)) {
        index += 1;
        setProgress(`OCR ${index} — ${file.name}`);
        try {
          const outcome = await processOne(file, pool);
          pool = outcome.pool;
          if (outcome.linked) linkedCount += 1;
          nextResults.push(outcome.row);
        } catch (error) {
          nextResults.push({
            fileName: file.name,
            status: "error",
            message: error instanceof Error ? error.message : "Échec lecture",
            detectedDate: null,
            detectedAmount: null,
            matches: [],
          });
        }
        setResults([...nextResults]);
        setTargets(pool);
      }

      if (!index) {
        onNotify("Bons", "Aucun PDF/image trouvé");
        return;
      }

      setProgress(`Terminé — ${linkedCount} bon(s) lié(s) / ${index} fichier(s) · journal → ${month}`);
      onNotify(
        "Import bons",
        `${linkedCount} lié(s) automatiquement sur ${index}. Affichez le mois « ${month} » dans le journal pour voir les Voir.`,
      );
      await onDone(month);
    } catch (error) {
      onNotify("Bons", error instanceof Error ? error.message : "Import interrompu");
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
      await onDone(month);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bulk-bons">
      <h6 className="admin-section-title">Import massif des bons (PDF / images / ZIP / dossier)</h6>
      <p className="hint">
        Important : mois des bons = <strong>JANVIER 2026</strong> (pas le mois courant). Les bons
        manuscrits passent par lecture IA (plus lent). ZIP trop gros → <strong>Dossier</strong>.
      </p>
      <div className="bulk-bons-controls">
        <label className="field">
          <span>Mois des bons</span>
          <select value={month} onChange={(event) => setMonth(event.target.value)} disabled={busy}>
            {months.filter((name) => name !== "TOUS").map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>Fichiers / ZIP</span>
          <label className={`btn-light bulk-pick-btn${busy || !month ? " disabled" : ""}`}>
            Choisir des fichiers…
            <input
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,.zip,application/pdf,image/*,application/zip"
              disabled={busy || !month}
              hidden
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                event.target.value = "";
                void runImport(files);
              }}
            />
          </label>
        </div>
        <div className="field">
          <span>Dossier (recommandé si archive lourde)</span>
          <label className={`btn-light bulk-pick-btn${busy || !month ? " disabled" : ""}`}>
            Choisir un dossier…
            <input
              type="file"
              multiple
              // @ts-expect-error webkitdirectory is supported in Chromium/Edge
              webkitdirectory=""
              directory=""
              disabled={busy || !month}
              hidden
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                event.target.value = "";
                void runImport(files);
              }}
            />
          </label>
        </div>
      </div>
      {pickedLabel ? <p className="hint">{pickedLabel}</p> : null}
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
