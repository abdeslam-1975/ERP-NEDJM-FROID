import {
  arabicLongDate,
  articleTitle,
  fillContractText,
  slashDate,
  type ContractPrintValues,
  type ContractTemplate,
} from "@/lib/hr/work-contract";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escaped text with **bold** spans and line breaks; grouped amounts kept left-to-right. */
function rich(value: string) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\d{1,3}(?: \d{3})+(?:\.\d+)?/g, '<bdi dir="ltr">$&</bdi>')
    .replace(/\n/g, "<br>");
}

function val(value: string) {
  return value.trim() ? `<strong>${escapeHtml(value)}</strong>` : `<span class="blank"></span>`;
}

function dateVal(iso: string, long = false) {
  if (!iso.trim()) return val("");
  return val(long ? arabicLongDate(iso) : slashDate(iso));
}

export function buildWorkContractHtml(v: ContractPrintValues, t: ContractTemplate) {
  const cdd = !v.is_cdi;
  const articles = t.articles.filter((a) => cdd || !a.cdd_only);
  let index = 0;
  const heading = () => `<h3>${articleTitle(index++)}:</h3>`;

  const reasons = t.cdd_reasons
    .map(
      (r, i) =>
        `<li><span class="num">${i + 1}-</span><span class="box">${v.cdd_reason === i + 1 ? "&#x2612;" : "&#x2610;"}</span>${rich(r)}</li>`,
    )
    .join("");

  const copies = t.copies.split("\n");
  const copiesHead = copies[0] ?? "";
  const copiesList = copies.slice(1).map((c) => `<div>${rich(c)}</div>`).join("");

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(cdd ? t.title_cdd : t.title_cdi)} ${escapeHtml(v.numero)} - ${escapeHtml(v.nom)}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap">
  <style>
    @page {
      size: A4 portrait;
      margin: 16mm 17mm 18mm 17mm;
      @bottom-center { content: counter(page) "/" counter(pages); font: 12px "Times New Roman", serif; }
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    body {
      direction: rtl;
      font-family: Amiri, "Traditional Arabic", "Sakkal Majalla", "Times New Roman", serif;
      font-size: 16px;
      line-height: 1.85;
    }
    h1 {
      text-align: center;
      font-size: 30px;
      margin: 0 0 2mm;
      line-height: 1.4;
    }
    h1 span { border-bottom: 2px solid #111; padding: 0 4mm 1mm; }
    .numero { text-align: center; font-size: 19px; margin: 0 0 3mm; }
    p { margin: 0 0 1.5mm; text-align: justify; }
    .party { font-weight: 700; font-size: 18px; margin: 2mm 0 1mm; }
    .party span { border-bottom: 1.5px solid #111; padding-bottom: 0.5mm; }
    .indent { text-indent: 8mm; }
    .row { display: grid; grid-template-columns: 1fr 1fr; column-gap: 8mm; }
    .line { margin: 0 0 0.8mm; }
    .center { text-align: center; }
    h3 { font-size: 17px; margin: 2.5mm 0 1mm; font-weight: 700; break-after: avoid; }
    .article p, ul.reasons li { break-inside: avoid; orphans: 2; widows: 2; }
    ul.reasons { list-style: none; margin: 1mm 0 0; padding: 0 12mm 0 0; }
    ul.reasons li { margin: 0 0 0.6mm; }
    ul.reasons .num { display: inline-block; min-width: 6mm; }
    ul.reasons .box { font-size: 18px; margin-left: 1.5mm; font-family: "Segoe UI Symbol", "DejaVu Sans", sans-serif; }
    .blank { display: inline-block; min-width: 35mm; border-bottom: 1px dotted #555; }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      margin-top: 8mm;
      min-height: 42mm;
      break-inside: avoid;
      font-weight: 700;
      font-size: 17px;
    }
    .signatures div:last-child { text-align: left; }
    .copies { display: grid; grid-template-columns: auto 1fr; column-gap: 10mm; margin-top: 4mm; break-inside: avoid; }
    .closing { text-align: center; margin: 5mm 0 0; }
  </style>
</head>
<body>
  <h1><span>${escapeHtml(cdd ? t.title_cdd : t.title_cdi)}</span></h1>
  <div class="numero">رقم: ${val(v.numero)}</div>
  <p>${rich(t.legal_intro)}</p>
  <p>${rich(cdd ? t.opening_cdd : t.opening_cdi)}</p>

  <div class="party"><span>مـن جـهـة:</span></div>
  <p class="indent">${rich(t.employer_block)}</p>

  <div class="party"><span>ومـن جهـة أخـرى:</span></div>
  <div class="line">السيّد (ة): ${val(v.nom)}</div>
  <div class="line">الرقم التسلسلي: ${val(v.matricule)}</div>
  <div class="row line"><div>المولود(ة) بتاريخ: ${dateVal(v.birth_date, true)}</div><div>بـ: ${val(v.birth_place)}</div></div>
  <div class="row line"><div>إبن (ة): ${val(v.father)}</div><div>و: ${val(v.mother)}</div></div>
  <div class="line">الحالة العائلية: ${val(v.marital)}</div>
  <div class="line">الحامل (ة) لـ: ${escapeHtml(v.id_piece)} رقم: ${val(v.id_number)} الصادر(ة) في: ${dateVal(v.id_issued_on)} عن سلطة الاصدار:</div>
  <div class="line">${val(v.id_issued_by)}</div>
  <div class="line">الساكن (ة) بـ: ${val(v.address)}</div>

  <div class="article">
    ${heading()}
    <div class="line center">يَشْغَل السيد(ة) المتعاقد معه منصب: ${val(v.poste)}</div>
    <div class="row line"><div>ابتداء من تاريخ: ${dateVal(v.start_date)}</div>${cdd ? `<div>إلى غاية: ${dateVal(v.end_date)}</div>` : "<div></div>"}</div>
  </div>

  ${
    cdd
      ? `<div class="article">
    ${heading()}
    <p>${rich(t.cdd_reason_intro)}</p>
    <ul class="reasons">${reasons}</ul>
  </div>`
      : ""
  }

  ${articles
    .map(
      (a) => `<div class="article">
    ${heading()}
    <p class="indent">${rich(fillContractText(a.body, v))}</p>
  </div>`,
    )
    .join("\n  ")}

  ${
    t.note.trim()
      ? `<div class="article"><h3>ملاحظة:</h3><p class="indent">${rich(t.note)}</p></div>`
      : ""
  }

  <p class="closing">${rich(t.closing)}</p>
  <div class="signatures"><div>${rich(t.sig_employee)}</div><div>${rich(t.sig_employer)}</div></div>
  <div class="copies"><div>${rich(copiesHead)}</div><div>${copiesList}</div></div>
</body>
</html>`;
}
