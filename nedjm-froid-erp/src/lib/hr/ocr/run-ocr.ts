"use client";

import { createWorker, PSM } from "tesseract.js";
import { extractFieldsFromOcrText, ocrLanguagesForProfile } from "@/lib/hr/ocr/extractors";
import type { OcrDocProfile, OcrExtractResult } from "@/lib/hr/ocr/types";

/** Améliore le contraste / taille avant Tesseract (scans flous). */
async function preprocessImage(file: File): Promise<Blob> {
  if (typeof createImageBitmap === "undefined") return file;

  const bitmap = await createImageBitmap(file);
  try {
    const scale = bitmap.width < 1400 ? 2 : bitmap.width < 2200 ? 1.5 : 1;
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, w, h);

    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
      // contraste doux
      const v = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128));
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png", 0.95),
    );
    return blob ?? file;
  } finally {
    bitmap.close();
  }
}

/**
 * OCR navigateur. CNI / naissance / CNAS : ara+fra.
 * PDF non supporté : convertir en JPG/PNG.
 */
export async function runDocumentOcr(
  file: File,
  profile: OcrDocProfile,
  onProgress?: (pct: number) => void,
): Promise<OcrExtractResult> {
  if (file.type === "application/pdf") {
    throw new Error(
      "L'OCR accepte JPG / PNG / WEBP. Convertissez le PDF en image, ou téléversez une photo du document.",
    );
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("Format non supporté pour l'OCR (JPG, PNG, WEBP).");
  }

  const langs = ocrLanguagesForProfile(profile);
  const prepared = await preprocessImage(file);
  const worker = await createWorker(langs, 1, {
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
    const { data } = await worker.recognize(prepared);
    const rawText = data.text ?? "";
    return extractFieldsFromOcrText(profile, rawText);
  } finally {
    await worker.terminate();
  }
}
