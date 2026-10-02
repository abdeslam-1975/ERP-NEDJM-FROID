import {
  OM_ENTREPRISE,
  OM_GABARIT_ANCIEN,
  formatOmDate,
  omJoin,
  type MissionOrderFields,
} from "@/lib/hr/mission-order";

type MissionPrintFields = MissionOrderFields & { numero?: string | null };

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function text(value: string | null | undefined) {
  return escapeHtml(value ?? "");
}

/** "000005/26" → "NF/OM/0005/26". */
export function missionReference(numero: string | null | undefined) {
  const value = (numero ?? "").trim();
  if (!value) return "";
  const match = /^(\d+)\/(\d{2,4})$/.exec(value);
  if (!match) return `NF/OM/${value}`;
  return `NF/OM/${String(Number(match[1])).padStart(4, "0")}/${match[2]}`;
}

type TransportMode = "service" | "tous";

/** Legacy values (Train, Avion, Taxi…) print as "tous moyens". */
function transportMode(moyen: string | null): TransportMode | null {
  const value = (moyen ?? "").trim().toLowerCase();
  if (!value) return null;
  if (value.includes("véhicule") || value.includes("vehicule") || value.includes("service")) return "service";
  return "tous";
}

const OM_FONT_DIR = "/fonts/om";
const RANGE_LATIN =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";
const RANGE_LATIN_EXT =
  "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF";
const RANGE_ARABIC =
  "U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC";

function fontFace(origin: string, family: string, file: string, weight: string, range: string) {
  return `@font-face { font-family: "${family}"; font-style: normal; font-weight: ${weight}; font-display: swap; src: url("${origin}${OM_FONT_DIR}/${file}") format("woff2"); unicode-range: ${range}; }`;
}

/** Fonts served by the app itself so printing and archived copies work offline. */
function plexFontFaces(origin: string) {
  return [
    fontFace(origin, "IBM Plex Sans", "ibm-plex-sans-latin.woff2", "400 600", RANGE_LATIN),
    fontFace(origin, "IBM Plex Sans", "ibm-plex-sans-latin-ext.woff2", "400 600", RANGE_LATIN_EXT),
    // Same weight descriptor per pair, otherwise Chrome keeps only the latin face.
    ...["400", "500", "600"].flatMap((weight) => [
      fontFace(origin, "IBM Plex Sans Arabic", "ibm-plex-sans-latin.woff2", weight, RANGE_LATIN),
      fontFace(origin, "IBM Plex Sans Arabic", `ibm-plex-sans-arabic-${weight}.woff2`, weight, RANGE_ARABIC),
    ]),
  ].join("\n    ");
}

function cairoFontFaces(origin: string) {
  return fontFace(origin, "Cairo", "cairo-arabic-700.woff2", "700", RANGE_ARABIC);
}

/** `assetOrigin` must be absolute when the HTML is written into a print frame. */
export function buildMissionOrderHtml(fields: MissionPrintFields, letterheadUrl: string, assetOrigin = "") {
  return fields.gabarit === OM_GABARIT_ANCIEN
    ? buildMissionOrderHtmlV1(fields, letterheadUrl, assetOrigin)
    : buildMissionOrderHtmlV2(fields, letterheadUrl, assetOrigin);
}

function buildMissionOrderHtmlV2(fields: MissionPrintFields, letterheadUrl: string, assetOrigin: string) {
  const km = (value: string | null) => (value ? `${value} km` : "");
  const mode = transportMode(fields.moyen);
  const check = (value: TransportMode) => (mode === value ? "✓" : "");
  const row = (fr: string, value: string, ar: string) =>
    `<div class="om-row"><div class="om-fr">${fr}</div><div class="om-val">${value}</div><div class="om-ar">${ar}</div></div>`;
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>ORDRE DE MISSION ${text(fields.numero)}</title>
  <style>
    ${plexFontFaces(assetOrigin)}
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
      padding: 33mm 13mm 28mm 13mm;
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
    .om-head { display: grid; grid-template-columns: 1fr 1fr; align-items: end; margin-bottom: 2mm; }
    .om-ref { justify-self: start; font-size: 13px; font-weight: 500; padding-bottom: 1.5mm; }
    .om-ref b { font-weight: 600; margin-left: 2mm; letter-spacing: .4px; }
    .om-title { text-align: center; line-height: 1.15; }
    .om-title-ar { font-family: "IBM Plex Sans Arabic", sans-serif; font-size: 25px; font-weight: 600; direction: rtl; }
    .om-title-fr { font-size: 17px; font-weight: 500; letter-spacing: 4px; margin-top: 1mm; }
    .om-stack { flex: 1 1 auto; display: flex; flex-direction: column; gap: 2.5mm; min-height: 0; }
    .om-block { display: flex; flex-direction: column; }
    .om-id { flex: 1.15 1 0; }
    .om-trip { flex: 1 1 0; }
    .om-trans { flex: 1.3 1 0; }
    .om-sec { display: flex; align-items: center; gap: 3mm; padding: 1.5mm 0 1mm; font-size: 11.5px; font-weight: 600; letter-spacing: 1.6px; }
    .om-rule { flex: 1; border-top: .8pt solid #111; }
    .om-rows { flex: 1; display: flex; flex-direction: column; justify-content: space-evenly; padding: 0 1mm; }
    .om-row { display: grid; grid-template-columns: 34% 32% 34%; align-items: center; column-gap: 2.5mm; min-height: 7mm; }
    .om-fr { text-align: left; font-weight: 400; font-size: 12px; line-height: 1.3; color: #333; }
    .om-ar { text-align: right; font-weight: 400; font-size: 13px; line-height: 1.35; direction: rtl; color: #333; font-family: "IBM Plex Sans Arabic", sans-serif; }
    .om-val { text-align: center; font-size: 13px; font-weight: 600; line-height: 1.3; padding: 0 1.5mm; }
    .om-val:empty::before { content: ""; display: block; margin: 0 4mm; border-bottom: 1pt dotted #8a8a8a; height: 3.5mm; }
    .om-sub { display: block; font-weight: 400; font-size: 10.5px; margin-top: .3mm; color: #666; }
    .om-indent { padding-left: 6mm; }
    .om-modes { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2mm; padding: 1.5mm 1mm; }
    .om-mode { display: flex; align-items: center; gap: 2mm; font-size: 12px; color: #333; }
    .om-check { width: 4.2mm; height: 4.2mm; border: .8pt solid #111; border-radius: 1mm; display: grid; place-items: center; font-size: 11px; font-weight: 600; line-height: 1; flex: 0 0 auto; color: #111; }
    .om-mode small { display: block; direction: rtl; font-size: 12px; text-align: left; font-family: "IBM Plex Sans Arabic", sans-serif; }
    .om-sign { flex: 1.45 1 0; display: grid; grid-template-columns: 1fr auto 1fr; column-gap: 5mm; min-height: 0; }
    .om-col { display: flex; flex-direction: column; min-width: 0; }
    .om-divider { border-left: .8pt solid #111; margin-top: 1.5mm; }
    .om-kv { display: grid; grid-template-columns: 24mm 1fr; align-items: baseline; gap: 2mm; min-height: 7.5mm; padding: 0 1mm; }
    .om-kv .om-val { text-align: left; font-size: 12px; padding: 0; }
    .om-kv .om-val:empty::before { margin: 0 8mm 0 0; }
    .om-visa { flex: 1; align-items: start; padding-top: 1.5mm; }
    .om-sign .om-row { grid-template-columns: 33% 37% 30%; padding: 0 1mm; }
    .om-sign .om-fr { font-size: 11.5px; }
    .om-sign .om-ar { font-size: 12.5px; }
    .om-sign .om-row .om-val { font-size: 12px; }
    .om-declare { margin: 2.5mm 1mm 0; font-size: 11.5px; line-height: 1.55; color: #333; font-style: italic; }
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
  <img class="om-letterhead" src="${escapeHtml(letterheadUrl)}" alt="">
  <div class="om-head">
    <div class="om-ref">Réf :<b>${text(missionReference(fields.numero))}</b></div>
    <div class="om-title">
      <div class="om-title-ar">أمر بمهمة</div>
      <div class="om-title-fr">ORDRE DE MISSION</div>
    </div>
  </div>
  <div class="om-stack">
    <section class="om-block om-id">
      <div class="om-sec"><span>I. IDENTIFICATION DU MISSIONNAIRE</span><span class="om-rule"></span></div>
      <div class="om-rows">
        ${row("Matricule :", text(fields.matricule), "الرقم التسلسلي :")}
        ${row("Nom et Prénom :", text(`${fields.nom} ${fields.prenom ?? ""}`.trim().toUpperCase()), "الاسم واللقب :")}
        ${row("Affectation :", text(fields.affectation), "التعيين :")}
        ${row("Code affectation :", text(fields.codeAffectation), "رمز التعيين :")}
        ${row("Fonction :", text(fields.poste), "الوظيفة :")}
      </div>
    </section>
    <section class="om-block om-trip">
      <div class="om-sec"><span>II. ITINÉRAIRE DE LA MISSION</span><span class="om-rule"></span></div>
      <div class="om-rows">
        ${row("Destination(s) :", text(omJoin(fields.dest1, fields.dest2)), "الوجهة :")}
        ${row('Départ :<span class="om-sub">(lieu et date)</span>', text(omJoin(fields.lieuDepart, formatOmDate(fields.dateDepart))), 'الذهاب :<span class="om-sub">(المكان والتاريخ)</span>')}
        ${row('Retour :<span class="om-sub">(lieu et date)</span>', text(omJoin(fields.lieuRetour, formatOmDate(fields.dateRetour))), 'العودة :<span class="om-sub">(المكان والتاريخ)</span>')}
        ${row("Objet de la mission :", text(fields.motif), "سبب المهمة :")}
      </div>
    </section>
    <section class="om-block om-trans">
      <div class="om-sec"><span>III. MODE DE TRANSPORT</span><span class="om-rule"></span></div>
      <div class="om-modes">
        <div class="om-mode"><span class="om-check">${check("tous")}</span><span>Tous moyens de transport<small>جميع وسائل النقل</small></span></div>
        <div class="om-mode"><span class="om-check">${check("service")}</span><span>Véhicule de service<small>سيارة المصلحة</small></span></div>
      </div>
      <div class="om-rows">
        ${row("Modèle :", text(fields.modele), "النوع :")}
        ${row("Immatriculation :", text(fields.immat), "لوح الترقيم :")}
        ${row("Kilométrage : au départ :", text(km(fields.kmDepart)), "حساب العداد : عند الذهاب :")}
        ${row('<span class="om-indent">au retour :</span>', text(km(fields.kmRetour)), "عند العودة :")}
      </div>
    </section>
    <section class="om-sign">
      <div class="om-col">
        <div class="om-sec"><span>IV. VALIDATION</span><span class="om-rule"></span></div>
        <div class="om-kv"><span class="om-fr">Établi par :</span><span class="om-val">${text(fields.donneur)}</span></div>
        <div class="om-kv"><span class="om-fr">Fonction :</span><span class="om-val">${text(fields.pieceFonction)}</span></div>
        <div class="om-kv om-visa"><span class="om-fr">Visa :</span></div>
      </div>
      <div class="om-divider"></div>
      <div class="om-col">
        <div class="om-sec"><span>V. SIGNATURE DU MISSIONNAIRE</span><span class="om-rule"></span></div>
        ${row("Pièce d'identité :", text(fields.pieceType), "وثيقة التعريف :")}
        ${row("N° :", text(fields.pieceNum), "رقم :")}
        <p class="om-declare">Je déclare avoir lu et pris connaissance des conditions de la présente mission et les accepter.</p>
      </div>
    </section>
  </div>
  <div class="om-foot">
    <div class="om-foot-line"><span>Le :</span><span class="om-val">${text(formatOmDate(fields.dateDoc))}</span><span class="om-ar">بتاريخ :</span></div>
    <div class="om-foot-line"><span>Fait à :</span><span class="om-val">${text(fields.faitA || "HMD")}</span><span class="om-ar">حرر في :</span></div>
  </div>
</div>
</body>
</html>`;
}

function buildMissionOrderHtmlV1(fields: MissionPrintFields, letterheadUrl: string, assetOrigin: string) {
  const km = (value: string | null) => (value ? `${value} km` : "");
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>ORDRE DE MISSION ${text(fields.numero)}</title>
  <style>
    ${cairoFontFaces(assetOrigin)}
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
      padding: 30mm 12mm 22mm 12mm;
      font-family: Arial, Tahoma, sans-serif;
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
    .om-head, .om-stack, .om-foot {
      position: relative;
      z-index: 1;
    }
    .om-head {
      display: grid;
      grid-template-columns: 1.05fr 1fr;
      align-items: center;
      flex: 0 0 auto;
      margin-bottom: 3.5mm;
      gap: 4mm;
    }
    .om-idbox {
      border: 1.4pt solid #111;
      border-radius: 11px;
      padding: 3mm 6mm 3mm 4mm;
    }
    .om-idrow {
      display: grid;
      grid-template-columns: 32mm 1fr 36mm;
      align-items: end;
      gap: 2.5mm;
      margin-bottom: 2.2mm;
    }
    .om-idrow:last-child { margin-bottom: 0; }
    .om-title { text-align: center; text-decoration: none; line-height: 1.25; }
    .om-title-ar {
      font-family: Cairo, Amiri, "Traditional Arabic", Tahoma, sans-serif;
      font-size: 22px;
      font-weight: bold;
      direction: rtl;
      letter-spacing: 0.4px;
      margin-bottom: 1.8mm;
      line-height: 1.25;
    }
    .om-title-fr {
      font-family: "Times New Roman", Georgia, "Palatino Linotype", serif;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 1.4px;
      text-transform: uppercase;
    }
    .om-stack {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      gap: 4mm;
      min-height: 0;
    }
    .om-box {
      border: 1.4pt solid #111;
      border-radius: 12px;
      padding: 4.5mm 7mm 4.5mm 5mm;
      display: flex;
      flex-direction: column;
      justify-content: space-evenly;
    }
    .om-box-emp { flex: 0.85 1 0; }
    .om-box-trip { flex: 1.25 1 0; }
    .om-box-trans { flex: 1.1 1 0; }
    .om-row {
      display: grid;
      grid-template-columns: 34% 32% 34%;
      align-items: center;
      column-gap: 2.5mm;
      min-height: 9mm;
    }
    .om-fr { text-align: left; font-weight: 700; font-size: 13px; line-height: 1.35; }
    .om-ar {
      text-align: right;
      font-weight: 700;
      font-size: 13px;
      line-height: 1.45;
      direction: rtl;
      font-family: Arial, Tahoma, sans-serif;
      padding-right: 15px;
    }
    .om-val {
      text-align: center;
      font-size: 14px;
      font-weight: 800;
      line-height: 1.35;
      min-height: 6mm;
      padding: 0 1.5mm;
    }
    .om-sub { display: block; font-weight: 700; font-size: 12px; margin-top: 0.6mm; }
    .om-hint { display: block; font-weight: 600; font-size: 11px; margin-top: 0.4mm; }
    .om-indent { padding-left: 8mm; }
    .om-bottom {
      flex: 1.05 1 0;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4mm;
    }
    .om-bottom .om-box { height: 100%; padding: 4mm 7mm 4mm 4.5mm; }
    .om-bottom .om-row { grid-template-columns: 38% 28% 34%; min-height: 10mm; }
    .om-box-donneur .om-row { grid-template-columns: 32% 38% 30%; }
    .om-box-donneur .om-val {
      font-size: 10.5px;
      font-weight: 700;
      line-height: 1.15;
      overflow-wrap: anywhere;
      word-break: break-word;
      padding: 0 1mm;
    }
    .om-foot {
      flex: 0 0 auto;
      display: grid;
      grid-template-columns: 1.15fr 1fr;
      align-items: end;
      font-weight: 700;
      font-size: 13.5px;
      padding: 3.5mm 2mm 0 2mm;
    }
    .om-foot-line { display: flex; align-items: baseline; gap: 3.5mm; }
    .om-foot .om-val { flex: 1; min-width: 32mm; font-size: 14px; font-weight: 800; }
    .om-hmd { letter-spacing: 0.5px; font-weight: 800; font-size: 14px; }
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
  <img class="om-letterhead" src="${escapeHtml(letterheadUrl)}" alt="">
  <div class="om-head">
    <div class="om-idbox">
      <div class="om-idrow"><span class="om-fr">N°:</span><span class="om-val">${text(fields.numero)}</span><span class="om-ar">رقم :</span></div>
      <div class="om-idrow"><span class="om-fr">MATRICULE:</span><span class="om-val">${text(fields.matricule)}</span><span class="om-ar">الرقم التسلسلي:</span></div>
    </div>
    <div class="om-title">
      <div class="om-title-ar">أمر بمهمة</div>
      <div class="om-title-fr">ORDRE DE MISSION</div>
    </div>
  </div>
  <div class="om-stack">
    <div class="om-box om-box-emp">
      <div class="om-row"><div class="om-fr">Nom et Prénom :</div><div class="om-val">${text(`${fields.nom} ${fields.prenom ?? ""}`.trim().toUpperCase())}</div><div class="om-ar">الاسم واللقب :</div></div>
      <div class="om-row"><div class="om-fr">Affectation :</div><div class="om-val">${text(fields.affectation)}</div><div class="om-ar">تعيين :</div></div>
      <div class="om-row"><div class="om-fr">Fonction :</div><div class="om-val">${text(fields.poste)}</div><div class="om-ar">الوظيفة :</div></div>
    </div>
    <div class="om-box om-box-trip">
      <div class="om-row"><div class="om-fr">Se rendre à: 1<sup>er</sup> destination:</div><div class="om-val">${text(fields.dest1)}</div><div class="om-ar">يسافر إلى: الوجهة الأولى :</div></div>
      <div class="om-row"><div class="om-fr om-indent">2<sup>ème</sup> destination:</div><div class="om-val">${text(fields.dest2)}</div><div class="om-ar">الوجهة الثانية :</div></div>
      <div class="om-row"><div class="om-fr">Départ:<span class="om-sub">Lieu et date et heure:</span></div><div class="om-val">${text(omJoin(fields.lieuDepart, formatOmDate(fields.dateDepart), fields.heureDepart))}</div><div class="om-ar">الذهاب :<span class="om-sub">المكان والتاريخ والساعة :</span></div></div>
      <div class="om-row"><div class="om-fr">Retour:<span class="om-sub">Lieu et date et heure:</span></div><div class="om-val">${text(omJoin(fields.lieuRetour, formatOmDate(fields.dateRetour), fields.heureRetour))}</div><div class="om-ar">العودة :<span class="om-sub">المكان والتاريخ والساعة :</span></div></div>
      <div class="om-row"><div class="om-fr">Motif du déplacement:</div><div class="om-val">${text(fields.motif)}</div><div class="om-ar">سبب السفر :</div></div>
    </div>
    <div class="om-box om-box-trans">
      <div class="om-row"><div class="om-fr">Moyen de transport:<span class="om-hint">( Train – Avion – Taxi)</span></div><div class="om-val">${text(fields.moyen)}</div><div class="om-ar">وسائل النقل :<span class="om-hint">(قطار - طائرة - تاكسي ...)</span></div></div>
      <div class="om-row"><div class="om-fr">Véhicule de l'entreprise: Modèle:</div><div class="om-val">${text(fields.modele)}</div><div class="om-ar">مركبة المؤسسة : النوع :</div></div>
      <div class="om-row"><div class="om-fr">Immatriculation:</div><div class="om-val">${text(fields.immat)}</div><div class="om-ar">لوح الترقيم :</div></div>
      <div class="om-row"><div class="om-fr">Kilométrage: au départ:</div><div class="om-val">${text(km(fields.kmDepart))}</div><div class="om-ar">حساب العداد : عند الذهاب :</div></div>
      <div class="om-row"><div class="om-fr om-indent">au retour:</div><div class="om-val">${text(km(fields.kmRetour))}</div><div class="om-ar">عند العودة :</div></div>
    </div>
    <div class="om-bottom">
      <div class="om-box om-box-donneur">
        <div class="om-row"><div class="om-fr">Donneur de l'OM</div><div class="om-val">${text(fields.donneur)}</div><div class="om-ar">مسلم أمر المهمة :</div></div>
        <div class="om-row"><div class="om-fr">Mr/Entreprise:</div><div class="om-val">${text(OM_ENTREPRISE)}</div><div class="om-ar">السيد(ة) المؤسسة :</div></div>
        <div class="om-row"><div class="om-fr">Fonction :</div><div class="om-val">${text(fields.pieceFonction)}</div><div class="om-ar">الوظيفة :</div></div>
      </div>
      <div class="om-box">
        <div class="om-row"><div class="om-fr">pièce d'identité :</div><div class="om-val">${text(fields.pieceType)}</div><div class="om-ar">وثيقة التعريف :</div></div>
        <div class="om-row"><div class="om-fr">N° :</div><div class="om-val">${text(fields.pieceNum)}</div><div class="om-ar">رقم :</div></div>
        <div class="om-row"><div class="om-fr">Délivré le :</div><div class="om-val">${text(formatOmDate(fields.pieceDelivre))}</div><div class="om-ar">سلمت بتاريخ :</div></div>
        <div class="om-row"><div class="om-fr">à :</div><div class="om-val">${text(fields.pieceLieu)}</div><div class="om-ar">في :</div></div>
      </div>
    </div>
  </div>
  <div class="om-foot">
    <div class="om-foot-line"><span class="om-fr">Le :</span><span class="om-val">${text(formatOmDate(fields.dateDoc))}</span><span class="om-ar">بتاريخ :</span></div>
    <div class="om-foot-line" style="justify-content:flex-end;"><span class="om-fr">Fait à :</span><span class="om-hmd">${text(fields.faitA || "HMD")}</span><span class="om-ar">حرر في :</span></div>
  </div>
</div>
</body>
</html>`;
}
