"use client";

import { useState } from "react";
import JSZip from "jszip";
import {
  attachCaisseBonPhoto,
  clearCaisseMonthBonPhotos,
  getCaissePhoto,
  listCaisseBonAttachTargets,
  listCaisseMonthBonDownloads,
  readCaisseBonWithAi,
} from "@/lib/actions/caisse";
import {
  bonExtractNeedsAi,
  extractBonFields,
  extractBonFieldsFromFileName,
  extractOpNumberFromFileName,
  type BonExtract,
} from "@/lib/caisse/bon-check";
import { matchBonByOpNumber, matchBonToOperations, type BonAttachTarget } from "@/lib/caisse/bon-bulk-match";
import { prepareAndReadBon, prepareBonDataUrl } from "@/lib/caisse/bon-ocr";
import { formatDa, formatDateFr } from "@/lib/caisse/soldes";

type MatchMode = "op-number" | "ocr";

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

function extensionFromDataUrl(url: string, archiveName: string): string {
  if (url.startsWith("data:application/pdf")) return `${archiveName}.pdf`;
  if (url.startsWith("data:image/png")) return `${archiveName}.png`;
  if (url.startsWith("data:image/webp")) return `${archiveName}.webp`;
  return `${archiveName}.jpg`;
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
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
  const [matchMode, setMatchMode] = useState<MatchMode>("op-number");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<RowResult[]>([]);
  const [targets, setTargets] = useState<BonAttachTarget[]>([]);
  const [pickedLabel, setPickedLabel] = useState("");

  async function attachLinked(
    target: BonAttachTarget,
    photoDataUrl: string,
    pool: BonAttachTarget[],
    fileName: string,
    messageExtra: string,
  ): Promise<{ row: RowResult; pool: BonAttachTarget[]; linked: boolean }> {
    const attached = await attachCaisseBonPhoto({
      operationId: target.operationId,
      photoDataUrl,
      // En attente validation admin / gérant (Conforme).
      bonMatchStatus: "unknown",
    });
    if (!attached.ok) {
      return {
        linked: false,
        pool,
        row: {
          fileName,
          status: "error",
          message: attached.error,
          detectedDate: target.date,
          detectedAmount: target.amount,
          matches: [target],
          photoDataUrl,
        },
      };
    }
    return {
      linked: true,
      pool: pool.map((row) => (row.operationId === target.operationId ? { ...row, hasPhoto: true } : row)),
      row: {
        fileName,
        status: "linked",
        message: `${attached.data.message} — à valider (gérant/admin)${messageExtra}`,
        detectedDate: target.date,
        detectedAmount: target.amount,
        matches: [target],
        linkedOp: attached.data.op,
      },
    };
  }

  async function processOneByOpNumber(
    file: File,
    pool: BonAttachTarget[],
  ): Promise<{ row: RowResult; pool: BonAttachTarget[]; linked: boolean }> {
    const opNumber = extractOpNumberFromFileName(file.name);
    const matched = matchBonByOpNumber(pool, opNumber);
    if (matched.status === "unique" && matched.matches[0]) {
      setProgress(`N° ${matched.matches[0].op} — ${file.name}`);
      const dataUrl = await prepareBonDataUrl(file);
      return attachLinked(matched.matches[0], dataUrl, pool, file.name, " · N° fichier");
    }
    return {
      linked: false,
      pool,
      row: {
        fileName: file.name,
        status:
          matched.status === "already"
            ? "already"
            : matched.status === "ambiguous"
              ? "ambiguous"
              : opNumber == null
                ? "unreadable"
                : "none",
        message:
          matched.status === "already"
            ? `N° ${opNumber} a déjà un bon`
            : matched.status === "ambiguous"
              ? `Plusieurs opérations pour N° ${opNumber}`
              : opNumber == null
                ? "Pas de N° dans le nom (ex. Bon_N102_….pdf) — passez en mode OCR ou renommez"
                : `Aucune opération N° ${opNumber} sans photo ce mois`,
        detectedDate: matched.matches[0]?.date ?? null,
        detectedAmount: matched.matches[0]?.amount ?? null,
        matches: matched.matches,
        photoDataUrl: matched.status === "none" || matched.status === "unreadable" || matched.status === "ambiguous"
          ? await prepareBonDataUrl(file).catch(() => undefined)
          : undefined,
      },
    };
  }

  async function processOneByOcr(
    file: File,
    pool: BonAttachTarget[],
  ): Promise<{ row: RowResult; pool: BonAttachTarget[]; linked: boolean }> {
    const prepared = await prepareAndReadBon(file);
    let fields: BonExtract = prepared.extract.rawText
      ? prepared.extract
      : extractBonFields(prepared.rawText);
    const fromName = extractBonFieldsFromFileName(file.name);
    const opFromName = extractOpNumberFromFileName(file.name);
    let aiNote = "";

    // Si le nom porte déjà le N°, rattacher sans attendre l’OCR/IA.
    if (opFromName != null) {
      const byOp = matchBonByOpNumber(pool, opFromName);
      if (byOp.status === "unique" && byOp.matches[0]) {
        return attachLinked(byOp.matches[0], prepared.dataUrl, pool, file.name, " · N° fichier");
      }
    }

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

    const canAutoLink =
      matched.status === "unique" &&
      matched.matches[0] &&
      (matched.strategy === "date+amount" || matched.strategy === "text-amount+date");

    if (canAutoLink && matched.matches[0]) {
      return attachLinked(
        matched.matches[0],
        prepared.dataUrl,
        pool,
        file.name,
        `${matched.strategy && matched.strategy !== "date+amount" ? ` (${matched.strategy})` : ""}${aiNote}`,
      );
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
        ? matched.strategy === "amount-only"
          ? `Montant seul — choisissez N° manuellement${aiNote}`
          : `Plusieurs opérations possibles — choix manuel${aiNote}`
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
    if (matchMode === "op-number") return processOneByOpNumber(file, pool);
    return processOneByOcr(file, pool);
  }

  async function runImport(files: File[]) {
    if (!files.length) {
      onNotify("Bons", "Aucun fichier sélectionné");
      return;
    }
    if (!month) return onNotify("Mois", "Choisissez un mois");
    setBusy(true);
    setResults([]);
    setPickedLabel(`${files.length} fichier(s) · mois ${month} · mode ${matchMode === "op-number" ? "N° fichier" : "OCR"}`);
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
        `${month} : ${listed.data.targets.length} achat(s), ${listed.data.withoutPhoto} sans photo — ${
          matchMode === "op-number" ? "match N°…" : "lecture…"
        }`,
      );

      const nextResults: RowResult[] = [];
      let linkedCount = 0;
      let pool = [...listed.data.targets];
      let index = 0;

      for await (const file of iterateBonFiles(files)) {
        index += 1;
        setProgress(`${matchMode === "op-number" ? "N°" : "OCR"} ${index} — ${file.name}`);
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

      setProgress(`Terminé — ${linkedCount} bon(s) lié(s) / ${index} fichier(s) · à valider · journal → ${month}`);
      onNotify(
        "Import bons",
        `${linkedCount} lié(s) sur ${index}. Statut « à valider » — le gérant/admin clique Conforme.`,
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
        bonMatchStatus: "unknown",
      });
      if (!attached.ok) return onNotify("Bon", attached.error);
      setResults((current) =>
        current.map((item, i) =>
          i === rowIndex
            ? {
                ...item,
                status: "linked",
                message: `${attached.data.message} — à valider (gérant/admin)`,
                linkedOp: attached.data.op,
                matches: item.matches.filter((m) => m.operationId === operationId),
              }
            : item,
        ),
      );
      setTargets((current) =>
        current.map((t) => (t.operationId === operationId ? { ...t, hasPhoto: true } : t)),
      );
      onNotify("Bon", `${attached.data.message} — à valider`);
      await onDone(month);
    } finally {
      setBusy(false);
    }
  }

  async function downloadMonthZip() {
    if (!month) return onNotify("Mois", "Choisissez un mois");
    setBusy(true);
    setProgress(`Préparation ZIP — ${month}…`);
    try {
      const listed = await listCaisseMonthBonDownloads(month);
      if (!listed.ok) return onNotify("Téléchargement", listed.error);
      if (!listed.data.count) {
        onNotify("Téléchargement", `Aucun bon attaché pour « ${month} ».`);
        return;
      }
      const zip = new JSZip();
      let done = 0;
      for (const item of listed.data.items) {
        done += 1;
        setProgress(`ZIP ${done}/${listed.data.count} — N° ${item.op}`);
        const photo = await getCaissePhoto(item.operationId);
        if (!photo.ok) continue;
        const name = extensionFromDataUrl(photo.data.url, item.archiveName || photo.data.archiveName);
        zip.file(name, dataUrlToUint8Array(photo.data.url));
      }
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Bons_${month.replace(/\s+/g, "_")}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setProgress(`ZIP prêt — ${listed.data.count} bon(s)`);
      onNotify("Téléchargement", `ZIP « ${month} » : ${listed.data.count} bon(s).`);
    } catch (error) {
      onNotify("Téléchargement", error instanceof Error ? error.message : "Échec ZIP");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bulk-bons">
      <h6 className="admin-section-title">Import massif des bons (PDF / images / ZIP / dossier)</h6>
      <p className="hint">
        Mode <strong>N° fichier</strong> : rattache via le nom (<code>Bon_N102_….pdf</code>) sans OCR — rapide.
        Les bons liés restent <strong>à valider</strong> (bouton Conforme : admin / gérant).
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
        <label className="field">
          <span>Mode de correspondance</span>
          <select
            value={matchMode}
            onChange={(event) => setMatchMode(event.target.value as MatchMode)}
            disabled={busy}
          >
            <option value="op-number">N° fichier (rapide, sans OCR)</option>
            <option value="ocr">OCR date + montant</option>
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
      <div className="bulk-bons-purge">
        <button type="button" className="btn-action btn-teal" disabled={busy || !month} onClick={() => void downloadMonthZip()}>
          Télécharger ZIP des bons du mois
        </button>
        <button
          type="button"
          className="btn-light"
          disabled={busy || !month}
          onClick={() => {
            void (async () => {
              if (!month) return;
              const ok = window.confirm(
                `Retirer les bons suspects (warn/unknown) de « ${month} » pour recommencer l’import ?`,
              );
              if (!ok) return;
              setBusy(true);
              try {
                const result = await clearCaisseMonthBonPhotos({ monthSheet: month, mode: "suspect" });
                if (!result.ok) return onNotify("Bons", result.error);
                onNotify("Purge bons", result.data.message);
                await onDone(month);
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          Retirer bons suspects du mois
        </button>
        <button
          type="button"
          className="btn-light"
          disabled={busy || !month}
          onClick={() => {
            void (async () => {
              if (!month) return;
              const ok = window.confirm(
                `Retirer TOUS les bons ACHAT de « ${month} » ? Action irréversible pour les photos du mois.`,
              );
              if (!ok) return;
              setBusy(true);
              try {
                const result = await clearCaisseMonthBonPhotos({ monthSheet: month, mode: "all" });
                if (!result.ok) return onNotify("Bons", result.error);
                onNotify("Purge bons", result.data.message);
                await onDone(month);
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          Retirer tous les bons du mois
        </button>
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
                      ? `Lié N° ${row.linkedOp} · à valider`
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
