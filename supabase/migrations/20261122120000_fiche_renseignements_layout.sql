update public.doc_templates
set html = $fiche_renseignements$<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title data-field="doc_title"></title>
  <style>
    @font-face { font-family: "IBM Plex Sans"; font-style: normal; font-weight: 400 600; font-display: swap; src: url("/fonts/om/ibm-plex-sans-latin.woff2") format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
    @font-face { font-family: "IBM Plex Sans"; font-style: normal; font-weight: 400 600; font-display: swap; src: url("/fonts/om/ibm-plex-sans-latin-ext.woff2") format("woff2"); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
    @font-face { font-family: "IBM Plex Sans Arabic"; font-style: normal; font-weight: 400; font-display: swap; src: url("/fonts/om/ibm-plex-sans-latin.woff2") format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
    @font-face { font-family: "IBM Plex Sans Arabic"; font-style: normal; font-weight: 400; font-display: swap; src: url("/fonts/om/ibm-plex-sans-arabic-400.woff2") format("woff2"); unicode-range: U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC; }
    @font-face { font-family: "IBM Plex Sans Arabic"; font-style: normal; font-weight: 500; font-display: swap; src: url("/fonts/om/ibm-plex-sans-latin.woff2") format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
    @font-face { font-family: "IBM Plex Sans Arabic"; font-style: normal; font-weight: 500; font-display: swap; src: url("/fonts/om/ibm-plex-sans-arabic-500.woff2") format("woff2"); unicode-range: U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC; }
    @font-face { font-family: "IBM Plex Sans Arabic"; font-style: normal; font-weight: 600; font-display: swap; src: url("/fonts/om/ibm-plex-sans-latin.woff2") format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
    @font-face { font-family: "IBM Plex Sans Arabic"; font-style: normal; font-weight: 600; font-display: swap; src: url("/fonts/om/ibm-plex-sans-arabic-600.woff2") format("woff2"); unicode-range: U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC; }
    @font-face { font-family: "Noto Naskh Arabic"; font-style: normal; font-weight: 700; font-display: swap; src: url("/fonts/om/noto-naskh-arabic-700.woff2") format("woff2"); unicode-range: U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC; }
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
    .om-stack { flex: 1 1 auto; display: flex; flex-direction: column; gap: 1.2mm; min-height: 0; }
    .om-block { display: flex; flex-direction: column; min-height: min-content; }
    .om-sec { display: flex; align-items: center; gap: 2mm; flex: 0 0 auto; padding: .7mm 0 .4mm; font-size: 10px; font-weight: 600; letter-spacing: .35px; line-height: 1.25; }
    .om-rule { flex: 1; border-top: .8pt solid #111; }
    .fx-sec-ar { font-family: "IBM Plex Sans Arabic", sans-serif; font-size: 12.5px; letter-spacing: 0; direction: rtl; }
    .om-rows { flex: 1 1 auto; display: flex; flex-direction: column; justify-content: flex-start; gap: .7mm; padding: 0 .4mm; min-height: min-content; }
    .fx-id { display: grid; grid-template-columns: minmax(0, 1fr) 27mm; column-gap: 4mm; flex: 1 1 auto; min-height: min-content; align-items: start; }
    .fx-photo { align-self: center; width: 27mm; height: 34mm; border: .8pt solid #111; border-radius: 1mm; object-fit: cover; display: grid; place-items: center; text-align: center; font-size: 10px; line-height: 1.4; color: #888; }
    .fx-line { display: grid; column-gap: 3.5mm; align-items: start; flex: 0 0 auto; }
    .fx-line.cols-1 { grid-template-columns: minmax(0, 1fr); }
    .fx-line.cols-2 { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .fx-line.cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .fx-line.cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .fx-cell { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1.15fr) minmax(0, .9fr); align-items: baseline; column-gap: 1.2mm; min-height: 4.8mm; min-width: 0; }
    .om-fr { text-align: left; font-weight: 400; font-size: 10px; line-height: 1.25; color: #333; overflow-wrap: anywhere; min-width: 0; }
    .om-ar { text-align: right; font-weight: 400; font-size: 11px; line-height: 1.25; direction: rtl; color: #333; font-family: "IBM Plex Sans Arabic", sans-serif; overflow-wrap: anywhere; min-width: 0; }
    .om-val { text-align: center; font-size: 11px; font-weight: 600; line-height: 1.25; overflow-wrap: anywhere; min-width: 0; }
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
  <img class="om-letterhead" src="" data-attr-src="letterhead" alt="">
  <div class="om-head">
    <div class="om-ref"><span data-bare data-field="matricule_label"></span><b data-field="matricule"></b></div>
    <div class="om-title">
      <div class="om-title-ar">بطاقة المعلومات</div>
      <div class="om-title-fr" aria-label="" data-attr-aria-label="title_fr"><span data-each="title_letters" data-field="$item"></span></div>
    </div>
  </div>
  <div class="om-stack">
    <section class="om-block" style="" data-attr-style="identity_style">
      <div class="om-sec"><span>I. IDENTIFICATION DE L'EMPLOYÉ(E)</span><span class="om-rule"></span><span class="fx-sec-ar">هوية العامل(ة)</span></div>
      <div class="fx-id">
        <div class="om-rows">
          <div class="fx-line" data-each="identity_rows" data-attr-class="css"><div class="fx-cell" data-each="cells"><span class="om-fr" data-field="label_fr"></span><span class="om-val" data-field="value"></span><span class="om-ar" data-field="label_ar"></span></div></div>
        </div>
        <img class="fx-photo" data-if="photo" src="" data-attr-src="photo" alt="">
        <div class="fx-photo" data-if="!photo">Photo<br>صورة</div>
      </div>
    </section>
    <section class="om-block" data-each="sections" style="" data-attr-style="style">
      <div class="om-sec"><span data-field="heading"></span><span class="om-rule"></span><span class="fx-sec-ar" data-if="title_ar" data-field="title_ar"></span></div>
      <div class="om-rows">
        <div class="fx-line" data-each="rows" data-attr-class="css"><div class="fx-cell" data-each="cells"><span class="om-fr" data-field="label_fr"></span><span class="om-val" data-field="value"></span><span class="om-ar" data-field="label_ar"></span></div></div>
      </div>
    </section>
    <section class="om-sign">
      <div class="om-col">
        <div class="om-sec"><span data-field="sign_left_heading"></span><span class="om-rule"></span><span class="fx-sec-ar">العامل(ة)</span></div>
        <p class="om-declare">Je certifie l'exactitude des renseignements ci-dessus.<span data-bare data-if="sign_left_sub"> <span data-bare data-field="sign_left_sub"></span>.</span></p>
        <p class="om-declare-ar">أشهد بصحة المعلومات المذكورة أعلاه.</p>
        <div class="fx-visa">Signature :</div>
      </div>
      <div class="om-divider"></div>
      <div class="om-col">
        <div class="om-sec"><span data-field="sign_right_heading"></span><span class="om-rule"></span><span class="fx-sec-ar">الإدارة</span></div>
        <div class="fx-admin">
          <b data-if="sig_right_line1" data-field="sig_right_line1"></b><br data-if="sig_right_line1">
          <span data-bare data-field="sig_right_line2"></span>
        </div>
        <div class="fx-visa">Visa :</div>
      </div>
    </section>
  </div>
  <div class="om-foot">
    <div class="om-foot-line"><span>Le :</span><span class="om-val" data-field="today"></span><span class="om-ar">بتاريخ :</span></div>
    <div class="om-foot-line"><span>Fait à :</span><span class="om-val" data-field="company.city_short"></span><span class="om-ar">حرر في :</span></div>
  </div>
</div>
</body>
</html>$fiche_renseignements$
where doc_type = 'fiche_renseignements' and status = 'approved';
