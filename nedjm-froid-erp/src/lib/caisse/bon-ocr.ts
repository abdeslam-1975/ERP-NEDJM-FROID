"use client";

import { createWorker, PSM } from "tesseract.js";
import { extractBonFields, type BonExtract } from "@/lib/caisse/bon-check";

/** Aligné sur la contrainte DB (~4 Mo) et bodySizeLimit server actions. */
export const MAX_BON_DATA_URL_CHARS = 3_800_000;
/** Target softer than the hard max so save/update stays under Vercel/PostgREST timeouts. */
export const TARGET_BON_DATA_URL_CHARS = 1_200_000;

async function canvasToJpegDataUrl(canvas: HTMLCanvasElement, quality = 0.68): Promise<string> {
  let working = canvas;
  let q = quality;
  let url = working.toDataURL("image/jpeg", q);
  while (url.length > TARGET_BON_DATA_URL_CHARS && q > 0.28) {
    q -= 0.07;
    url = working.toDataURL("image/jpeg", q);
  }
  let side = Math.max(working.width, working.height);
  while (url.length > TARGET_BON_DATA_URL_CHARS && side > 640) {
    side = Math.round(side * 0.75);
    const scale = side / Math.max(canvas.width, canvas.height);
    const smaller = document.createElement("canvas");
    smaller.width = Math.max(1, Math.round(canvas.width * scale));
    smaller.height = Math.max(1, Math.round(canvas.height * scale));
    const ctx = smaller.getContext("2d");
    if (!ctx) break;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, smaller.width, smaller.height);
    ctx.drawImage(canvas, 0, 0, smaller.width, smaller.height);
    working = smaller;
    q = 0.6;
    url = working.toDataURL("image/jpeg", q);
    while (url.length > TARGET_BON_DATA_URL_CHARS && q > 0.26) {
      q -= 0.06;
      url = working.toDataURL("image/jpeg", q);
    }
  }
  if (url.length > MAX_BON_DATA_URL_CHARS) {
    throw new Error("Bon trop lourd après compression (limite serveur).");
  }
  return url;
}

async function fileToImageBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === "undefined") {
    throw new Error("Navigateur incompatible pour la lecture du bon.");
  }
  return createImageBitmap(file);
}

function isPdfFile(file: File): boolean {
  const type = file.type || "";
  const name = file.name.toLowerCase();
  return type === "application/pdf" || name.endsWith(".pdf");
}

async function loadPdfDocument(file: File) {
  const pdfjs = await import("pdfjs-dist");
  // Worker local (public/pdfjs) — évite les blocages CDN / unpkg en production.
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  const data = new Uint8Array(await file.arrayBuffer());
  return pdfjs.getDocument({ data }).promise;
}

/** Texte natif du PDF (factures numériques) — bien plus fiable que l’OCR image. */
async function extractPdfPlainText(file: File): Promise<string> {
  const doc = await loadPdfDocument(file);
  try {
    const maxPages = Math.min(doc.numPages, 2);
    const chunks: string[] = [];
    for (let i = 1; i <= maxPages; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const line = content.items
        .map((item) => ("str" in item ? String(item.str) : ""))
        .filter(Boolean)
        .join(" ");
      if (line.trim()) chunks.push(line);
    }
    return chunks.join("\n").trim();
  } finally {
    await doc.destroy();
  }
}

async function contrastCanvas(source: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return source;
  ctx.drawImage(source, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
    const v = Math.max(0, Math.min(255, (gray - 128) * 1.45 + 128));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

async function rasterizeToCanvas(file: File, maxSide: number): Promise<HTMLCanvasElement> {
  const type = file.type || "";
  const name = file.name.toLowerCase();

  if (isPdfFile(file)) {
    const doc = await loadPdfDocument(file);
    try {
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2.2, maxSide / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponible");
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      return canvas;
    } finally {
      await doc.destroy();
    }
  }

  if (type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp)$/i.test(name)) {
    const bitmap = await fileToImageBitmap(file);
    try {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponible");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return canvas;
    } finally {
      bitmap.close();
    }
  }

  throw new Error("Format bon non supporté (PDF, JPG, PNG, WEBP).");
}

/** Convert image or PDF bon into a compressed JPEG data URL for storage. */
export async function prepareBonDataUrl(file: File): Promise<string> {
  const canvas = await rasterizeToCanvas(file, 1200);
  return canvasToJpegDataUrl(canvas, 0.62);
}

async function ocrDataUrl(
  dataUrl: string,
  onProgress?: (pct: number) => void,
  mode: "auto" | "sparse" = "auto",
): Promise<string> {
  const worker = await createWorker("fra", 1, {
    logger: (m) => {
      if (m.status === "recognizing text" && typeof m.progress === "number") {
        const base = mode === "auto" ? 0 : 50;
        onProgress?.(Math.min(99, base + Math.round(m.progress * 50)));
      }
    },
  });
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: mode === "sparse" ? PSM.SPARSE_TEXT : PSM.AUTO,
      preserve_interword_spaces: "1",
    });
    const { data } = await worker.recognize(dataUrl);
    return data.text ?? "";
  } finally {
    await worker.terminate();
  }
}

export type PreparedBon = {
  dataUrl: string;
  extract: BonExtract;
  rawText: string;
};

/**
 * 1) Texte natif PDF si disponible
 * 2) sinon une seule passe OCR (résolution modérée) — pas de 2e passe sparse (trop lente)
 * 3) compression séparée pour le stockage
 */
export async function prepareAndReadBon(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<PreparedBon> {
  onProgress?.(2);
  let rawText = "";
  if (isPdfFile(file)) {
    try {
      rawText = await extractPdfPlainText(file);
    } catch {
      rawText = "";
    }
  }

  let extract = rawText ? extractBonFields(rawText) : extractBonFields("");
  const hasUsefulExtract = Boolean(extract.preferredAmount || extract.amounts.length || extract.dates.length);

  // Cap OCR resolution: 2000px + dual Tesseract passes was freezing phones/low CPUs.
  const canvas = await rasterizeToCanvas(file, hasUsefulExtract ? 1100 : 1400);
  onProgress?.(8);

  if (!hasUsefulExtract) {
    const ocrCanvas = await contrastCanvas(canvas);
    const ocrUrl = ocrCanvas.toDataURL("image/jpeg", 0.85);
    onProgress?.(12);
    rawText = await ocrDataUrl(ocrUrl, (pct) => onProgress?.(Math.max(12, Math.round(pct * 0.85))), "auto");
    extract = extractBonFields(rawText);
  } else {
    onProgress?.(90);
  }

  onProgress?.(98);
  const dataUrl = await canvasToJpegDataUrl(canvas, 0.62);
  return {
    dataUrl,
    extract,
    rawText,
  };
}

/** OCR-only on an already prepared data URL (no second full rasterize for storage). */
export async function readBonFromDataUrl(
  dataUrl: string,
  onProgress?: (pct: number) => void,
): Promise<{ extract: BonExtract; rawText: string }> {
  onProgress?.(5);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Image bon illisible"));
    el.src = dataUrl;
  });
  const maxSide = 1200;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  canvas.height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const ocrCanvas = await contrastCanvas(canvas);
  const ocrUrl = ocrCanvas.toDataURL("image/jpeg", 0.85);
  onProgress?.(15);
  const rawText = await ocrDataUrl(ocrUrl, (pct) => onProgress?.(Math.max(15, Math.round(pct * 0.85))), "auto");
  onProgress?.(100);
  return { extract: extractBonFields(rawText), rawText };
}
