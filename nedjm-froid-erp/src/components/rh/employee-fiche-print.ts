import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import type { HrEmployeeField } from "@/lib/actions/hr-employees";
import type { HrFicheSettings } from "@/lib/hr/fiche-settings";
import { companyLetterheadUrl } from "@/lib/hr/company-letterhead";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function catalogFr(catalogs: CatalogItem[], kind: string, code: string) {
  if (!code) return "";
  const opt = catalogs.find((c) => c.kind === kind && c.code === code);
  return opt?.label_fr ?? code;
}

function printValue(
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
  return escapeHtml(text);
}

function printLabel(field: HrEmployeeField | undefined, code: string) {
  const label = field?.label_fr?.trim() || code;
  return escapeHtml(label.endsWith(":") ? label : `${label}:`);
}

function lineHtml(label: string, value: string) {
  return `<div class="line"><b>${label}</b> ${value}</div>`;
}

export function buildOfficialFicheHtml(
  values: Record<string, string>,
  catalogs: CatalogItem[],
  fields: HrEmployeeField[],
  settings: HrFicheSettings,
  origin = "",
) {
  const map = new Map(fields.map((f) => [f.code, f]));
  const v = (code: string) => (values[code] ?? "").trim();
  const show = (code: string) =>
    lineHtml(
      printLabel(map.get(code), code),
      printValue(code, v(code), map.get(code), catalogs, settings),
    );
  const rowHtml = (codes: string[]) => {
    const used = codes.filter(Boolean);
    if (!used.length) return "";
    if (used.length === 1) return show(used[0]);
    return `<div class="pair cols-${used.length}">${used.map(show).join("")}</div>`;
  };
  const letterhead = companyLetterheadUrl(settings.letterhead_url, origin);
  const photo = v(settings.photo_field);

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(settings.title)} ${escapeHtml(v("matricule"))}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    body {
      width: 210mm;
      height: 297mm;
      font-family: Arial, Helvetica, sans-serif;
    }
    #print-view {
      width: 210mm;
      height: 297mm;
      position: relative;
      padding: 32.5mm 16mm 28mm 16mm;
    }
    .letterhead-img {
      position: absolute;
      inset: 0;
      width: 210mm;
      height: 297mm;
      z-index: 0;
      object-fit: fill;
    }
    .sheet { position: relative; z-index: 1; }
    .doc-title {
      text-align: center;
      font-size: 17pt;
      font-weight: 800;
      text-decoration: underline;
      letter-spacing: 0.2px;
      margin: 0 0 1.5mm 0;
      line-height: 1.1;
    }
    .doc-mat {
      text-align: center;
      font-weight: 700;
      font-size: 11.5pt;
      margin: 0 0 4mm 0;
    }
    .identity {
      display: grid;
      grid-template-columns: 1fr 1fr 24mm;
      column-gap: 8mm;
      align-items: start;
      margin-bottom: 2.5mm;
    }
    .identity .col .line { margin-bottom: 1.6mm; }
    .photo {
      width: 24mm;
      height: 32mm;
      object-fit: cover;
      background: #fff;
      justify-self: end;
    }
    .section {
      font-weight: 800;
      font-size: 9pt;
      margin: 3.4mm 0 1.8mm 0;
      letter-spacing: 0.15px;
    }
    .line {
      font-size: 10pt;
      line-height: 1.35;
      margin-bottom: 1.3mm;
    }
    .line b { font-weight: 700; margin-right: 2mm; }
    .pair { display: grid; column-gap: 10mm; }
    .pair.cols-2 { grid-template-columns: 1fr 1fr; }
    .pair.cols-3 { grid-template-columns: 1.15fr 0.85fr 0.9fr; }
    .pair.cols-4 { grid-template-columns: 1fr 1fr 1fr 1fr; }
    .sig-area {
      margin-top: 11mm;
      display: grid;
      grid-template-columns: 1fr 1fr;
      column-gap: 20mm;
      text-align: center;
    }
    .sig-label {
      font-weight: 700;
      text-decoration: underline;
      font-size: 11.5pt;
    }
    .lu-txt {
      display: block;
      margin-top: 1.5mm;
      font-style: italic;
      font-weight: 600;
      font-size: 10pt;
    }
    .admin-info { margin-top: 8mm; }
    .admin-info .svc { font-weight: 700; font-size: 11pt; }
    .admin-info .adm { font-size: 10pt; }
  </style>
</head>
<body>
  <div id="print-view">
    <img class="letterhead-img" src="${escapeHtml(letterhead)}" alt="">
    <div class="sheet">
      <div class="doc-title">${escapeHtml(settings.title)}</div>
      <div class="doc-mat">${escapeHtml(settings.matricule_label)} ${escapeHtml(v("matricule"))}</div>
      <div class="identity">
        <div class="col">${settings.identity_left.map(show).join("")}</div>
        <div class="col">${settings.identity_right.map(show).join("")}</div>
        ${photo ? `<img class="photo" src="${escapeHtml(photo)}" alt="">` : `<div class="photo"></div>`}
      </div>
      ${settings.sections
        .map(
          (section) =>
            `<div class="section">${escapeHtml(section.title)}</div>${section.rows.map(rowHtml).join("")}`,
        )
        .join("")}
      <div class="sig-area">
        <div>
          <span class="sig-label">${escapeHtml(settings.sig_left_title)}</span>
          ${settings.sig_left_sub ? `<span class="lu-txt">${escapeHtml(settings.sig_left_sub)}</span>` : ""}
        </div>
        <div>
          <span class="sig-label">${escapeHtml(settings.sig_right_title)}</span>
          <div class="admin-info">
            ${settings.sig_right_line1 ? `<div class="svc">${escapeHtml(settings.sig_right_line1)}</div>` : ""}
            ${settings.sig_right_line2 ? `<div class="adm">${escapeHtml(settings.sig_right_line2)}</div>` : ""}
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
