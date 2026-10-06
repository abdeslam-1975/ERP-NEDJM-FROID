import { BUNDLED_FONTS } from "@/lib/doc/bundled-fonts";

/** Fonts every computer has; the built-in documents only use these. */
export const SYSTEM_FONTS = [
  "Arial, Helvetica, sans-serif",
  "\"Times New Roman\", Times, serif",
  "Georgia, serif",
  "Tahoma, sans-serif",
  "Verdana, sans-serif",
  "Calibri, Carlito, sans-serif",
  "Cambria, Caladea, serif",
  "\"Courier New\", monospace",
  "Amiri, \"Traditional Arabic\", serif",
  "Cairo, Tahoma, sans-serif",
];

/** Style element added to a rendered custom document (and removed again when the editor saves). */
export const DOC_FONTS_STYLE_ID = "doc-fonts";

export type UploadedFont = {
  id: string;
  family: string;
  weight: number;
  style: "normal" | "italic";
  format: "woff2" | "woff" | "truetype" | "opentype";
  url: string;
  is_active: boolean;
  created_at?: string;
};

export type FontGroup = "arabic" | "latin" | "upload" | "system";

export type FontOption = { family: string; stack: string; group: FontGroup };

export const FONT_GROUP_LABELS: Record<FontGroup, string> = {
  arabic: "Polices arabes",
  latin: "Polices latines",
  upload: "Polices importées",
  system: "Polices système",
};

const quote = (family: string) => `"${family.replace(/["\\]/g, "")}"`;

/** Fonts offered by the designer of custom documents: bundled, uploaded (active), then system ones. */
export function docFontOptions(uploaded: readonly UploadedFont[]): FontOption[] {
  const seen = new Set<string>();
  const out: FontOption[] = [];
  const add = (family: string, stack: string, group: FontGroup) => {
    const key = family.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ family, stack, group });
  };
  for (const f of BUNDLED_FONTS) add(f.family, `${quote(f.family)}, ${f.fallback}`, f.category);
  for (const f of uploaded) if (f.is_active) add(f.family, `${quote(f.family)}, Arial, sans-serif`, "upload");
  for (const stack of SYSTEM_FONTS) add(stack.split(",")[0].replace(/"/g, "").trim(), stack, "system");
  return out;
}

/** CSS font-family value of a family name (unknown names keep a safe fallback). */
export function fontStack(family: string, options: readonly FontOption[]): string {
  const hit = options.find((o) => o.family.toLowerCase() === family.trim().toLowerCase());
  if (hit) return hit.stack;
  return family.trim() ? `${quote(family.trim())}, Arial, sans-serif` : "Arial, Helvetica, sans-serif";
}

/** @font-face rules of the bundled and active uploaded fonts (browsers only download the ones used). */
export function fontFaceCss(uploaded: readonly UploadedFont[]): string {
  const rules: string[] = [];
  for (const f of BUNDLED_FONTS) {
    for (const face of f.faces) {
      rules.push(
        `@font-face { font-family: ${quote(f.family)}; font-style: normal; font-weight: ${face.weight}; font-display: swap; src: url("${face.file}") format("woff2"); unicode-range: ${face.range}; }`,
      );
    }
  }
  for (const f of uploaded) {
    if (!f.is_active || !/^https?:\/\//i.test(f.url)) continue;
    rules.push(
      `@font-face { font-family: ${quote(f.family)}; font-style: ${f.style}; font-weight: ${f.weight}; font-display: swap; src: url("${f.url.replace(/["\\)]/g, "")}") format("${f.format}"); }`,
    );
  }
  return rules.join("\n");
}

/** Adds the font rules to a rendered document's <head>. */
export function withFontFaces(html: string, css: string): string {
  if (!css) return html;
  const tag = `<style id="${DOC_FONTS_STYLE_ID}">\n${css}\n</style>`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head([^>]*)>/i, `<head$1>${tag}`) : `${tag}${html}`;
}

const FONT_FORMATS: Record<string, { format: UploadedFont["format"]; mime: string }> = {
  woff2: { format: "woff2", mime: "font/woff2" },
  woff: { format: "woff", mime: "font/woff" },
  ttf: { format: "truetype", mime: "font/ttf" },
  otf: { format: "opentype", mime: "font/otf" },
};

/** Format of an uploaded font file from its extension (browsers often send no MIME type for fonts). */
export function fontFileFormat(fileName: string) {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const hit = FONT_FORMATS[ext];
  return hit ? { ext, ...hit } : null;
}
