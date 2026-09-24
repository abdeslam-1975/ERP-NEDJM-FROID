import {
  OM_ENTREPRISE,
  formatOmDate,
  omJoin,
  type MissionOrderFields,
} from "@/lib/hr/mission-order";

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

export function buildMissionOrderHtml(
  fields: MissionOrderFields & { numero?: string | null },
  letterheadUrl: string,
) {
  const km = (value: string | null) => (value ? `${value} km` : "");
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>ORDRE DE MISSION ${text(fields.numero)}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@700&display=swap">
  <style>
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
