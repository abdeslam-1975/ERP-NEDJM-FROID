import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import type { HrEmployeeField } from "@/lib/actions/hr-employees";
import type { HrFicheSettings } from "@/lib/hr/fiche-settings";

/** Helvetica (WinAnsi) rejects Arabic / most Unicode — keep printable Latin only. */
function pdfSafe(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function catalogFr(catalogs: CatalogItem[], kind: string | null, code: string) {
  if (!kind || !code) return code;
  const opt = catalogs.find((c) => c.kind === kind && c.code === code);
  return opt?.label_fr ?? code;
}

function displayValue(
  code: string,
  raw: string,
  field: HrEmployeeField | undefined,
  catalogs: CatalogItem[],
  settings: HrFicheSettings,
) {
  let text = raw.trim();
  if (field?.value_type === "catalog" && field.catalog_kind) {
    text = catalogFr(catalogs, field.catalog_kind, text);
  }
  if (settings.uppercase_codes.includes(code)) text = text.toUpperCase();
  if (text && settings.phone_codes.includes(code) && settings.phone_prefix) {
    if (!text.startsWith("+")) text = `${settings.phone_prefix} ${text}`;
  }
  const suffix = settings.suffixes[code];
  if (text && suffix && !text.toLowerCase().includes(suffix.trim().toLowerCase())) {
    text = `${text}${suffix}`;
  }
  return pdfSafe(text);
}

/** Filename: FICHE DE RENSEIGNEMENTS MAT NOM PRÉNOM.pdf */
export function buildFicheRenseignementsFileName(values: {
  matricule?: string | null;
  last_name?: string | null;
  first_name?: string | null;
}) {
  const mat = pdfSafe(String(values.matricule ?? "").trim()) || "MAT";
  const nom = pdfSafe(String(values.last_name ?? "").trim().toUpperCase()) || "NOM";
  const prenom =
    pdfSafe(String(values.first_name ?? "").trim().toUpperCase()) || "PRENOM";
  const base = `FICHE DE RENSEIGNEMENTS ${mat} ${nom} ${prenom}`
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${base}.pdf`;
}

export async function buildFicheRenseignementsPdfBytes(input: {
  values: Record<string, string>;
  fields: HrEmployeeField[];
  catalogs: CatalogItem[];
  settings: HrFicheSettings;
}): Promise<Uint8Array> {
  const { values, fields, catalogs, settings } = input;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595.28, 841.89]);
  const margin = 40;
  let y = page.getHeight() - margin;
  const lineH = 14;
  const maxWidth = page.getWidth() - margin * 2;

  const draw = (text: string, opts?: { bold?: boolean; size?: number }) => {
    const size = opts?.size ?? 10;
    const f = opts?.bold ? fontBold : font;
    const safe = pdfSafe(text) || " ";
    const chunks: string[] = [];
    let rest = safe;
    while (rest.length) {
      let cut = rest.length;
      while (cut > 0 && f.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) {
        cut -= 1;
      }
      if (cut === 0) cut = 1;
      chunks.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    for (const chunk of chunks) {
      if (y < margin + lineH) {
        page = pdf.addPage([595.28, 841.89]);
        y = page.getHeight() - margin;
      }
      page.drawText(chunk, {
        x: margin,
        y,
        size,
        font: f,
        color: rgb(0.1, 0.1, 0.15),
      });
      y -= lineH;
    }
  };

  draw(settings.title || "FICHE DE RENSEIGNEMENTS", { bold: true, size: 14 });
  y -= 6;
  const mat = (values.matricule ?? "").trim();
  if (mat) {
    draw(`${settings.matricule_label || "Matricule"} : ${mat}`, {
      bold: true,
      size: 11,
    });
  }
  y -= 8;

  const fieldMap = new Map(fields.map((f) => [f.code, f]));
  const active = fields
    .filter((f) => f.is_active && f.code !== (settings.photo_field || "photo_url"))
    .filter((f) => !/_ar$/i.test(f.code))
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);

  let lastSection = "";
  for (const field of active) {
    const raw = (values[field.code] ?? "").trim();
    if (!raw) continue;
    const section = pdfSafe(field.section_fr || "") || "";
    if (section && section !== lastSection) {
      y -= 4;
      draw(section, { bold: true, size: 11 });
      lastSection = section;
    }
    const label = pdfSafe(field.label_fr || field.code);
    const value = displayValue(
      field.code,
      raw,
      fieldMap.get(field.code),
      catalogs,
      settings,
    );
    if (!value) continue;
    draw(`${label} : ${value}`, { size: 10 });
  }

  y -= 16;
  if (settings.sig_left_title) draw(settings.sig_left_title, { size: 9 });
  if (settings.sig_left_sub) draw(settings.sig_left_sub, { size: 9 });
  if (settings.sig_right_title) draw(settings.sig_right_title, { size: 9 });
  if (settings.sig_right_line1) draw(settings.sig_right_line1, { size: 9 });
  if (settings.sig_right_line2) draw(settings.sig_right_line2, { size: 9 });

  return pdf.save();
}
