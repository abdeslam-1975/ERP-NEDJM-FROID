"use client";

import { createWorker, PSM } from "tesseract.js";
import { extractBonFields, type BonExtract } from "@/lib/caisse/bon-check";

/** Aligné sur la contrainte DB (~4 Mo) et bodySizeLimit server actions. */
export const MAX_BON_DATA_URL_CHARS = 3_800_000;

async function canvasToJpegDataUrl(canvas: HTMLCanvasElement, quality = 0.72): Promise<string> {
  let working = canvas;
  let q = quality;
  let url = working.toDataURL("image/jpeg", q);
  while (url.length > MAX_BON_DATA_URL_CHARS && q > 0.32) {
    q -= 0.08;
    url = working.toDataURL("image/jpeg", q);
  }
  // Si encore trop lourd : réduire la résolution puis recompresser.
  let side = Math.max(working.width, working.height);
  while (url.length > MAX_BON_DATA_URL_CHARS && side > 700) {
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
    q = 0.65;
    url = working.toDataURL("image/jpeg", q);
    while (url.length > MAX_BON_DATA_URL_CHARS && q > 0.28) {
      q -= 0.07;
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

async function rasterizeImageFile(file: File): Promise<string> {
  const bitmap = await fileToImageBitmap(file);
  try {
    const maxSide = 1400;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponible");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvasToJpegDataUrl(canvas, 0.7);
  } finally {
    bitmap.close();
  }
}

async function rasterizePdfFile(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // Worker via CDN (même version) pour éviter les soucis de bundling Next.js.
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(1.6, 1400 / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponible");
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    return canvasToJpegDataUrl(canvas, 0.7);
  } finally {
    await doc.destroy();
  }
}

/** Convert image or PDF bon into a compressed JPEG data URL for storage. */
export async function prepareBonDataUrl(file: File): Promise<string> {
  const type = file.type || "";
  const name = file.name.toLowerCase();
  const isPdf = type === "application/pdf" || name.endsWith(".pdf");
  if (isPdf) return rasterizePdfFile(file);
  if (type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp)$/i.test(name)) {
    return rasterizeImageFile(file);
  }
  throw new Error("Format bon non supporté (PDF, JPG, PNG, WEBP).");
}

async function ocrDataUrl(dataUrl: string, onProgress?: (pct: number) => void): Promise<string> {
  const worker = await createWorker("fra", 1, {
    logger: (m) => {
      if (m.status === "recognizing text" && typeof m.progress === "number") {
        onProgress?.(Math.round(m.progress * 100));
      }
    },
  });
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
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

export async function prepareAndReadBon(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<PreparedBon> {
  const dataUrl = await prepareBonDataUrl(file);
  onProgress?.(5);
  const rawText = await ocrDataUrl(dataUrl, (pct) => onProgress?.(Math.max(5, pct)));
  return {
    dataUrl,
    extract: extractBonFields(rawText),
    rawText,
  };
}
