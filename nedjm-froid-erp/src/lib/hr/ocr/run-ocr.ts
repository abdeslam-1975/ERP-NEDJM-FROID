"use client";

import { createWorker, PSM } from "tesseract.js";
import {
  extractFieldsFromOcrText,
  linesFromOcrWords,
  mergeOcrSuggestions,
  ocrLanguagesForProfile,
  type OcrWordBox,
} from "@/lib/hr/ocr/extractors";
import type { OcrDocProfile, OcrExtractResult, OcrFieldSuggestion } from "@/lib/hr/ocr/types";

function toPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png", 0.95));
}

/** Contraste + une version noir/blanc. Deux images, pour que chaque champ ait une chance d'être lu. */
async function preprocessVariants(file: File): Promise<{ contrast: Blob; binary: Blob }> {
  if (typeof createImageBitmap === "undefined") return { contrast: file, binary: file };

  const bitmap = await createImageBitmap(file);
  try {
    const scale = bitmap.width < 1600 ? 2 : bitmap.width < 2400 ? 1.5 : 1;
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { contrast: file, binary: file };

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, w, h);

    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    let sum = 0;
    const pixels = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
      const v = Math.max(0, Math.min(255, (gray - 128) * 1.45 + 128));
      d[i] = d[i + 1] = d[i + 2] = v;
      sum += v;
    }
    ctx.putImageData(img, 0, 0);
    const contrast = (await toPngBlob(canvas)) ?? file;

    const threshold = Math.max(150, Math.min(200, sum / pixels - 8));
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i]! < threshold ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
    const binary = (await toPngBlob(canvas)) ?? contrast;
    return { contrast, binary };
  } finally {
    bitmap.close();
  }
}

type OcrPass = { image: Blob; psm: (typeof PSM)[keyof typeof PSM] };

type Recognized = {
  text?: string | null;
  blocks?: unknown;
};

function boxOf(value: unknown): OcrWordBox["bbox"] | null {
  if (!value || typeof value !== "object") return null;
  const b = value as { x0?: unknown; y0?: unknown; x1?: unknown; y1?: unknown };
  if (typeof b.x0 !== "number" || typeof b.y0 !== "number") return null;
  return {
    x0: b.x0,
    y0: b.y0,
    x1: typeof b.x1 === "number" ? b.x1 : b.x0,
    y1: typeof b.y1 === "number" ? b.y1 : b.y0,
  };
}

/** Mots positionnés (Tesseract ne les renvoie que si `blocks` est demandé). */
function wordsFromBlocks(blocks: unknown): OcrWordBox[] {
  const out: OcrWordBox[] = [];
  const walk = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node !== "object") return;
    const rec = node as Record<string, unknown>;
    if (Array.isArray(rec.words)) {
      for (const word of rec.words) {
        if (!word || typeof word !== "object") continue;
        const w = word as { text?: unknown; bbox?: unknown };
        const bbox = boxOf(w.bbox);
        if (typeof w.text !== "string" || !w.text.trim() || !bbox) continue;
        out.push({ text: w.text, bbox });
      }
    }
    for (const key of ["blocks", "paragraphs", "lines"]) {
      if (Array.isArray(rec[key])) walk(rec[key]);
    }
  };
  walk(blocks);
  return out;
}

function textsFromRecognition(data: Recognized): string[] {
  const geom = linesFromOcrWords(wordsFromBlocks(data.blocks));
  const plain = data.text ?? "";
  const out: string[] = [];
  if (geom.trim()) out.push(geom);
  const flat = (value: string) => value.replace(/\s+/g, " ").trim();
  if (plain.trim() && flat(plain) !== flat(geom)) out.push(plain);
  return out;
}

function suggestionsFromTexts(profile: OcrDocProfile, texts: string[]): OcrFieldSuggestion[][] {
  return texts.map((raw) => extractFieldsFromOcrText(profile, raw).suggestions);
}

/**
 * OCR navigateur. CNI / naissance : une lecture.
 * Attestation CNAS : plusieurs lectures (mise en page + noir/blanc), puis fusion
 * pour que le même document remplisse toujours les mêmes champs.
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
  const images = await preprocessVariants(file);
  const passes: OcrPass[] =
    profile === "SS_REGISTRATION"
      ? [
          { image: images.contrast, psm: PSM.AUTO },
          { image: images.contrast, psm: PSM.SINGLE_BLOCK },
          { image: images.binary, psm: PSM.SPARSE_TEXT },
        ]
      : [{ image: images.contrast, psm: PSM.AUTO }];
  const progress = { index: 0, total: passes.length };
  const worker = await createWorker(langs, 1, {
    logger: (m) => {
      if (m.status === "recognizing text" && typeof m.progress === "number") {
        const pct = (progress.index + m.progress) / progress.total;
        onProgress?.(Math.min(99, Math.round(pct * 100)));
      }
    },
  });

  try {
    const groups: OcrFieldSuggestion[][] = [];
    let rawText = "";
    for (let i = 0; i < passes.length; i++) {
      progress.index = i;
      const pass = passes[i]!;
      await worker.setParameters({
        tessedit_pageseg_mode: pass.psm,
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
      });
      const { data } = await worker.recognize(
        pass.image,
        {},
        profile === "SS_REGISTRATION" ? { text: true, blocks: true } : { text: true },
      );
      const recognized = data as Recognized;
      if (!rawText && recognized.text) rawText = recognized.text;
      groups.push(...suggestionsFromTexts(profile, textsFromRecognition(recognized)));
    }
    onProgress?.(100);
    const suggestions =
      groups.length <= 1 ? (groups[0] ?? []) : mergeOcrSuggestions(groups);
    return { profile, rawText, suggestions };
  } finally {
    await worker.terminate();
  }
}
