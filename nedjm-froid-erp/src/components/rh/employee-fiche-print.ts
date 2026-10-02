import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import type { HrEmployeeField } from "@/lib/actions/hr-employees";
import type { HrFicheSettings } from "@/lib/hr/fiche-settings";
import { companyLetterheadUrl } from "@/lib/hr/company-letterhead";
import { formatOmDate, todayIsoAlgiers } from "@/lib/hr/mission-order";
import {
  naskhFontFaces,
  plexFontFaces,
  sheetText as text,
  spreadLetters,
} from "@/components/rh/mission-order-print";

const TITLE_AR = "بطاقة المعلومات";

/** Arabic headings of the default sections; custom sections print their French title only. */
const SECTION_AR: Record<string, string> = {
  affiliation: "النسب والعنوان",
  identite: "الهوية والوضعية الإدارية",
  pro: "الوضعية المهنية والدراسة",
  contacts: "وسائل الاتصال",
};

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

function roman(n: number) {
  return ROMAN[n - 1] ?? String(n);
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
  let value = raw.trim();
  if (field?.value_type === "catalog" && field.catalog_kind) {
    value = catalogFr(catalogs, field.catalog_kind, value);
  }
  if (field?.value_type === "date") value = formatOmDate(value);
  if (settings.uppercase_codes.includes(code)) value = value.toUpperCase();
  if (value && settings.phone_codes.includes(code) && settings.phone_prefix) {
    if (!value.startsWith("+")) value = `${settings.phone_prefix} ${value}`;
  }
  const suffix = settings.suffixes[code];
  if (value && suffix && !value.toLowerCase().includes(suffix.trim().toLowerCase())) {
    value = `${value}${suffix}`;
  }
  return value;
}

function withColon(label: string) {
  const bare = label.trim().replace(/\s*:\s*$/, "");
  return bare ? `${bare} :` : "";
}

/** Heading with the French title left, a rule, and the Arabic title right. */
function sectionHead(fr: string, ar: string) {
  return `<div class="om-sec"><span>${text(fr)}</span><span class="om-rule"></span>${
    ar ? `<span class="fx-sec-ar">${text(ar)}</span>` : ""
  }</div>`;
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
  const cell = (code: string) => {
    const field = map.get(code);
    const fr = withColon(field?.label_fr || code);
    const ar = withColon(field?.label_ar && field.label_ar !== field.label_fr ? field.label_ar : "");
    const value = printValue(code, v(code), field, catalogs, settings);
    return `<div class="fx-cell"><span class="om-fr">${text(fr)}</span><span class="om-val">${text(value)}</span><span class="om-ar">${text(ar)}</span></div>`;
  };
  const line = (codes: string[]) => {
    const used = codes.filter((code) => code && code !== settings.photo_field);
    if (!used.length) return "";
    return `<div class="fx-line cols-${Math.min(used.length, 4)}">${used.map(cell).join("")}</div>`;
  };

  const identityLines: string[][] = [];
  const identityCount = Math.max(settings.identity_left.length, settings.identity_right.length);
  for (let i = 0; i < identityCount; i += 1) {
    identityLines.push([settings.identity_left[i] ?? "", settings.identity_right[i] ?? ""]);
  }
  const identityRows = identityLines.map(line).filter(Boolean);

  const sections = settings.sections
    .map((section) => ({ ...section, html: section.rows.map(line).filter(Boolean) }))
    .filter((section) => section.html.length > 0);

  const letterhead = companyLetterheadUrl(settings.letterhead_url, origin);
  const photo = v(settings.photo_field);
  const matricule = v("matricule");
  const signNo = sections.length + 2;
  const titleFr = settings.title || "FICHE DE RENSEIGNEMENTS";
  const block = (lines: number) => `style="flex: ${Math.max(lines, 1)} 1 0"`;

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>${text(`${titleFr} ${matricule}`.trim())}</title>
  <style>
    ${plexFontFaces(origin)}
    ${naskhFontFaces(origin)}
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    #om-print-view {
      display: flex;
      flex-direction: column;
      width: 210mm;
      height: 297mm;
      position: relative;
      overflow: hidden;
      padding: 33mm 13mm 26mm 13mm;
      font-family: "IBM Plex Sans", "IBM Plex Sans Arabic", "Segoe UI", sans-serif;
      color: #111;
      background: #fff;
    }
    .om-letterhead {
      position: absolute;
      inset: 0;
      width: 210mm;
      height: 297mm;
      object-fit: fill;
      z-index: 0;
      pointer-events: none;
    }
    .om-head, .om-stack, .om-foot { position: relative; z-index: 1; }
    .om-head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 3mm; }
    .om-ref { font-size: 13px; font-weight: 500; }
    .om-ref b { font-weight: 600; margin-left: 2mm; letter-spacing: .4px; }
    .om-title { display: inline-flex; flex-direction: column; color: #0d0d0d; }
    .om-title-ar { font-family: "Noto Naskh Arabic", "IBM Plex Sans Arabic", serif; font-size: 46px; font-weight: 700; line-height: 1.2; direction: rtl; text-align: center; white-space: nowrap; }
    /* Zero width + full min-width: the Arabic word alone sets the block width. */
    .om-title-fr { display: flex; justify-content: space-between; width: 0; min-width: 100%; font-size: 11.5px; font-weight: 600; line-height: 1; margin-top: .8mm; padding-top: 1.6mm; border-top: 1.2pt solid #0d0d0d; }
    .om-stack { flex: 1 1 auto; display: flex; flex-direction: column; gap: 1.6mm; min-height: 0; }
    .om-block { display: flex; flex-direction: column; min-height: 0; }
    .om-sec { display: flex; align-items: center; gap: 3mm; padding: 1.2mm 0 .8mm; font-size: 11px; font-weight: 600; letter-spacing: 1.4px; }
    .om-rule { flex: 1; border-top: .8pt solid #111; }
    .fx-sec-ar { font-family: "IBM Plex Sans Arabic", sans-serif; font-size: 12.5px; letter-spacing: 0; direction: rtl; }
    .om-rows { flex: 1; display: flex; flex-direction: column; justify-content: space-evenly; padding: 0 1mm; }
    .fx-id { display: grid; grid-template-columns: 1fr 27mm; column-gap: 5mm; flex: 1; min-height: 0; }
    .fx-photo { align-self: center; width: 27mm; height: 34mm; border: .8pt solid #111; border-radius: 1mm; object-fit: cover; display: grid; place-items: center; text-align: center; font-size: 10px; line-height: 1.4; color: #888; }
    .fx-line { display: grid; column-gap: 6mm; }
    .fx-line.cols-1 { grid-template-columns: 1fr; }
    .fx-line.cols-2 { grid-template-columns: 1fr 1fr; }
    .fx-line.cols-3 { grid-template-columns: repeat(3, 1fr); }
    .fx-line.cols-4 { grid-template-columns: repeat(4, 1fr); }
    .fx-cell { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; column-gap: 2mm; min-height: 6mm; min-width: 0; }
    .om-fr { text-align: left; font-weight: 400; font-size: 11px; line-height: 1.25; color: #333; white-space: nowrap; }
    .om-ar { text-align: right; font-weight: 400; font-size: 12px; line-height: 1.3; direction: rtl; color: #333; font-family: "IBM Plex Sans Arabic", sans-serif; white-space: nowrap; }
    .om-val { text-align: center; font-size: 12px; font-weight: 600; line-height: 1.25; overflow-wrap: anywhere; }
    .om-val:empty::before { content: ""; display: block; margin: 0 1mm; border-bottom: 1pt dotted #8a8a8a; height: 3.2mm; }
    .om-sign { flex: 0 0 38mm; margin-top: 1.5mm; display: grid; grid-template-columns: 1fr auto 1fr; column-gap: 5mm; min-height: 0; }
    .om-col { display: flex; flex-direction: column; min-width: 0; }
    .om-divider { border-left: .8pt solid #111; margin-top: 1.5mm; }
    .om-declare { margin: 1.5mm 1mm 0; font-size: 11px; line-height: 1.5; color: #333; font-style: italic; }
    .om-declare-ar { margin: .5mm 1mm 0; font-size: 12px; line-height: 1.5; color: #333; direction: rtl; text-align: right; font-family: "IBM Plex Sans Arabic", sans-serif; }
    .fx-admin { margin: 1.5mm 1mm 0; font-size: 11.5px; line-height: 1.5; color: #333; }
    .fx-admin b { font-weight: 600; color: #111; }
    .fx-visa { margin: auto 1mm 0; font-size: 11px; color: #333; }
    .om-foot { display: grid; grid-template-columns: 1fr 1fr; column-gap: 10mm; align-items: end; font-size: 12px; color: #333; padding: 2.5mm 1mm 0; border-top: .8pt solid #111; margin-top: 2mm; }
    .om-foot-line { display: grid; grid-template-columns: auto 1fr auto; align-items: baseline; gap: 3mm; }
    .om-foot .om-val { color: #111; }
    .om-foot .om-ar { font-size: 13px; }
    @media print {
      html, body, .om-letterhead {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
<div id="om-print-view">
  <img class="om-letterhead" src="${text(letterhead)}" alt="">
  <div class="om-head">
    <div class="om-ref">${text(withColon(settings.matricule_label || "Matricule"))}<b>${text(matricule)}</b></div>
    <div class="om-title">
      <div class="om-title-ar">${text(TITLE_AR)}</div>
      <div class="om-title-fr" aria-label="${text(titleFr)}">${spreadLetters(titleFr)}</div>
    </div>
  </div>
  <div class="om-stack">
    <section class="om-block" ${block(identityRows.length + 1)}>
      ${sectionHead("I. IDENTIFICATION DE L'EMPLOYÉ(E)", "هوية العامل(ة)")}
      <div class="fx-id">
        <div class="om-rows">
          ${identityRows.join("\n          ")}
        </div>
        ${photo ? `<img class="fx-photo" src="${text(photo)}" alt="">` : `<div class="fx-photo">Photo<br>صورة</div>`}
      </div>
    </section>
    ${sections
      .map(
        (section, index) => `<section class="om-block" ${block(section.html.length)}>
      ${sectionHead(`${roman(index + 2)}. ${section.title.toUpperCase()}`, SECTION_AR[section.id] ?? "")}
      <div class="om-rows">
        ${section.html.join("\n        ")}
      </div>
    </section>`,
      )
      .join("\n    ")}
    <section class="om-sign">
      <div class="om-col">
        ${sectionHead(`${roman(signNo)}. ${(settings.sig_left_title || "L'Employé(e)").toUpperCase()}`, "العامل(ة)")}
        <p class="om-declare">Je certifie l'exactitude des renseignements ci-dessus.${
          settings.sig_left_sub ? ` ${text(settings.sig_left_sub)}.` : ""
        }</p>
        <p class="om-declare-ar">أشهد بصحة المعلومات المذكورة أعلاه.</p>
        <div class="fx-visa">Signature :</div>
      </div>
      <div class="om-divider"></div>
      <div class="om-col">
        ${sectionHead(`${roman(signNo + 1)}. ${(settings.sig_right_title || "L'Administration").toUpperCase()}`, "الإدارة")}
        <div class="fx-admin">
          ${settings.sig_right_line1 ? `<b>${text(settings.sig_right_line1)}</b><br>` : ""}
          ${settings.sig_right_line2 ? text(settings.sig_right_line2) : ""}
        </div>
        <div class="fx-visa">Visa :</div>
      </div>
    </section>
  </div>
  <div class="om-foot">
    <div class="om-foot-line"><span>Le :</span><span class="om-val">${text(formatOmDate(todayIsoAlgiers()))}</span><span class="om-ar">بتاريخ :</span></div>
    <div class="om-foot-line"><span>Fait à :</span><span class="om-val">HMD</span><span class="om-ar">حرر في :</span></div>
  </div>
</div>
</body>
</html>`;
}
