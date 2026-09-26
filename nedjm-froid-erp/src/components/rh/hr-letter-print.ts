import {
  LETTER_PLACE,
  formatAmount,
  leaveDetailRows,
  letterParagraphs,
  letterRecipient,
  letterSignatures,
  letterSubtitle,
  letterTitle,
  slashDateIso,
  type LetterValues,
} from "@/lib/hr/hr-letters";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escapes, and in Arabic keeps grouped numbers / dates left-to-right. */
function txt(value: string, rtl: boolean) {
  const safe = escapeHtml(value ?? "");
  return rtl ? safe.replace(/\d[\d\s.,/]*\d/g, (m) => `<bdi dir="ltr">${m}</bdi>`) : safe;
}

export function buildHrLetterHtml(v: LetterValues, letterheadUrl: string) {
  const rtl = v.lang === "ar";
  const t = (s: string) => txt(s, rtl);
  const title = letterTitle(v);
  const subtitle = letterSubtitle(v);
  const recipient = letterRecipient(v);
  const details = leaveDetailRows(v);
  const signatures = letterSignatures(v);
  const place = rtl ? LETTER_PLACE.ar : LETTER_PLACE.fr;
  const dateDoc = slashDateIso(v.date_doc);
  const numeroLabel = rtl ? "الرقم :" : "N° :";
  const faitA = rtl ? `حرر في ${place} بتاريخ ${dateDoc}` : `Fait à ${place}, le ${dateDoc}`;

  const linesTable =
    v.kind === "STC" && v.lines.length
      ? `<table class="lines">
  <thead><tr><th>${rtl ? "البيان" : "Désignation"}</th><th class="num">${rtl ? "المبلغ (دج)" : "Montant (DA)"}</th></tr></thead>
  <tbody>${v.lines
    .map(
      (l) =>
        `<tr><td>${t(rtl ? l.label_ar || l.label_fr : l.label_fr || l.label_ar)}</td><td class="num">${t(formatAmount(l.amount))}</td></tr>`,
    )
    .join("")}</tbody>
</table>`
      : "";

  const detailsTable = details.length
    ? `<table class="details">${details
        .map(([k, val]) => `<tr><th>${t(k)}</th><td>${t(val)}</td></tr>`)
        .join("")}</table>`
    : "";

  return `<!doctype html>
<html lang="${rtl ? "ar" : "fr"}" dir="${rtl ? "rtl" : "ltr"}">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)} ${escapeHtml(v.numero)}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap">
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    .page {
      position: relative;
      width: 210mm;
      min-height: 297mm;
      padding: 38mm 20mm 30mm 20mm;
      font-family: ${rtl ? 'Amiri, "Traditional Arabic", Tahoma, serif' : '"Times New Roman", Georgia, serif'};
      font-size: ${rtl ? "17px" : "15px"};
      line-height: ${rtl ? "2" : "1.8"};
    }
    .letterhead {
      position: absolute;
      inset: 0;
      width: 210mm;
      height: 297mm;
      object-fit: fill;
      z-index: 0;
    }
    .content { position: relative; z-index: 1; }
    .meta { display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 8mm; }
    .recipient { width: 60%; margin-bottom: 6mm; margin-inline-start: auto; }
    .recipient .mode { font-style: italic; font-size: 0.9em; }
    h1 {
      text-align: center;
      font-size: ${rtl ? "26px" : "22px"};
      letter-spacing: ${rtl ? "0" : "1.5px"};
      text-decoration: underline;
      margin: 4mm 0 ${subtitle ? "1mm" : "10mm"};
    }
    .subtitle { text-align: center; font-weight: 700; margin-bottom: 8mm; }
    .object { font-weight: 700; text-decoration: underline; margin-bottom: 5mm; }
    p { text-align: justify; margin: 0 0 4mm; text-indent: ${rtl ? "0" : "10mm"}; }
    table { border-collapse: collapse; width: 100%; margin: 4mm 0 6mm; font-size: 0.92em; }
    th, td { border: 1px solid #333; padding: 1.5mm 3mm; text-align: ${rtl ? "right" : "left"}; }
    .lines thead th { background: #eee; }
    .num { text-align: ${rtl ? "left" : "right"}; white-space: nowrap; width: 38mm; }
    .details th { width: 45%; background: #f3f3f3; }
    .fait { margin-top: 8mm; text-align: ${rtl ? "left" : "right"}; font-weight: 700; }
    .signs { display: flex; justify-content: ${signatures.length > 1 ? "space-between" : rtl ? "flex-start" : "flex-end"}; margin-top: 8mm; font-weight: 700; }
    .signs div { min-width: 60mm; text-align: center; min-height: 28mm; }
    @media print {
      html, body, .letterhead { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
<div class="page">
  <img class="letterhead" src="${escapeHtml(letterheadUrl)}" alt="">
  <div class="content">
    <div class="meta"><span>${t(numeroLabel)} ${t(v.numero || "……")}</span>${v.matricule ? `<span>${rtl ? "رقم التسجيل :" : "Matricule :"} ${t(v.matricule)}</span>` : ""}</div>
    ${
      recipient
        ? `<div class="recipient"><div class="mode">${t(recipient.mode)}</div><div><b>${rtl ? "إلى" : "À"} : ${t(recipient.name)}</b></div>${recipient.address ? `<div>${t(recipient.address)}</div>` : ""}</div>`
        : ""
    }
    <h1>${t(title)}</h1>
    ${subtitle ? `<div class="subtitle">${t(subtitle)}</div>` : ""}
    ${recipient ? `<div class="object">${t(recipient.object)}</div>` : ""}
    ${letterParagraphs(v)
      .map((para) => `<p>${t(para)}</p>`)
      .join("\n    ")}
    ${linesTable}
    ${detailsTable}
    <div class="fait">${t(faitA)}</div>
    <div class="signs">${signatures.map((s) => `<div>${t(s)}</div>`).join("")}</div>
  </div>
</div>
</body>
</html>`;
}
