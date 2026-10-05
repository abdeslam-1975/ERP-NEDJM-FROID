import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const EDITION = "Édition octobre 2026";

const CHAPTERS = [
  "00-prise-en-main",
  "01-personnel",
  "02-temps-presence",
  "03-paie",
  "04-documents",
  "05-juridique",
  "06-parametres-administration",
  "annexe-a-decisions",
  "annexe-b-mois-de-paie",
  "annexe-c-glossaire",
  "annexe-d-messages",
];
const VIDEOS = CHAPTERS.filter((c) => /^\d/.test(c));

const slug = (text) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "-")
    .replace(/^-|-$/g, "");

function render(files, folder, prefix) {
  const toc = [];
  const used = new Set();
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        let id = `${prefix}-${slug(text)}`;
        while (used.has(id)) id += "-b";
        used.add(id);
        if (depth <= 2) toc.push({ depth, id, text });
        return `<h${depth} id="${id}" dir="auto">${text}</h${depth}>\n`;
      },
    },
  });
  const body = files
    .map((name) => {
      const md = readFileSync(join(root, folder, `${name}.md`), "utf8");
      const html = marked
        .parse(md)
        .replace(/<(p|li|td|th)>/g, '<$1 dir="auto">')
        .replace(/<blockquote>\s*<p dir="auto"><strong>Vidéo/g, '<blockquote class="video"><p dir="auto"><strong>Vidéo')
        .replace(/<p dir="auto"><strong>(Attention)<\/strong>/g, '<p dir="auto" class="label warn"><strong>$1</strong>')
        .replace(
          /<p dir="auto"><strong>(Où la trouver|À quoi ça sert|Avant de commencer|Étapes|Résultat|Voir aussi)<\/strong>/g,
          '<p dir="auto" class="label"><strong>$1</strong>',
        );
      return `<section class="chapter">${html}</section>`;
    })
    .join("\n");
  return { body, toc };
}

const CSS = `
@page { size: A4; margin: 18mm 16mm 20mm;
  @bottom-center { content: counter(page); font: 9pt "Segoe UI", sans-serif; color: #64748b; }
  @top-right { content: "NEDJM FROID ERP · Module Ressources Humaines"; font: 8pt "Segoe UI", sans-serif; color: #94a3b8; } }
@page :first { @bottom-center { content: none; } @top-right { content: none; } }
:root { --brand: #0b4f8a; --brand-2: #0e7490; --ink: #0f172a; --muted: #475569; --line: #e2e8f0; }
* { box-sizing: border-box; }
body { font: 10.5pt/1.55 "Segoe UI", "Tahoma", sans-serif; color: var(--ink); margin: 0; }
main { max-width: 900px; margin: 0 auto; padding: 0 24px; }
.cover { height: 257mm; display: flex; flex-direction: column; justify-content: space-between; padding: 30mm 10mm 12mm;
  background: linear-gradient(160deg, var(--brand), var(--brand-2)); color: #fff; border-radius: 6px; page-break-after: always; }
.cover .brand { font-size: 13pt; letter-spacing: .25em; text-transform: uppercase; opacity: .85; }
.cover h1 { font-size: 34pt; line-height: 1.1; margin: 10mm 0 4mm; border: 0; color: #fff; }
.cover .ar { font-size: 22pt; direction: rtl; opacity: .95; }
.cover .sub { font-size: 13pt; opacity: .9; margin-top: 8mm; max-width: 140mm; }
.cover .foot { display: flex; justify-content: space-between; font-size: 10pt; opacity: .85; }
nav.toc { page-break-after: always; }
nav.toc h2 { font-size: 20pt; color: var(--brand); border: 0; margin-top: 0; }
nav.toc ol { list-style: none; padding: 0; margin: 0; }
nav.toc li.d1 { font-weight: 700; margin-top: 10px; color: var(--brand); }
nav.toc li.d2 { margin-left: 18px; font-size: 9.5pt; color: var(--muted); }
nav.toc a { color: inherit; text-decoration: none; }
section.chapter { page-break-before: always; }
h1 { font-size: 22pt; color: var(--brand); border-bottom: 3px solid var(--brand); padding-bottom: 6px; margin: 0 0 14px; }
h2 { font-size: 14.5pt; color: var(--brand); margin: 26px 0 8px; padding: 6px 10px; background: #f1f5f9; border-left: 4px solid var(--brand); border-radius: 3px; page-break-after: avoid; }
h3 { font-size: 12pt; color: var(--brand-2); margin: 18px 0 6px; page-break-after: avoid; }
h4 { font-size: 11pt; margin: 14px 0 4px; }
p { margin: 6px 0; }
p.label { margin-top: 12px; }
p.label strong { color: var(--brand); text-transform: uppercase; font-size: 9pt; letter-spacing: .06em; }
p.label.warn strong { color: #b45309; }
p.label.warn + ul { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 8px 12px 8px 28px; }
blockquote { margin: 10px 0; padding: 8px 12px; background: #f8fafc; border-left: 4px solid #94a3b8; color: var(--muted); border-radius: 3px; }
blockquote.video { background: #ecfeff; border-left-color: var(--brand-2); color: #155e75; font-size: 9.5pt; }
table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 9.2pt; page-break-inside: auto; }
tr { page-break-inside: avoid; }
th { background: var(--brand); color: #fff; text-align: start; padding: 6px 8px; font-weight: 600; }
td { border-bottom: 1px solid var(--line); padding: 5px 8px; vertical-align: top; }
tr:nth-child(even) td { background: #f8fafc; }
code { font: 9pt Consolas, monospace; background: #f1f5f9; padding: 1px 4px; border-radius: 3px; }
pre { background: #f1f5f9; padding: 10px; border-radius: 6px; white-space: pre-wrap; }
ul, ol { margin: 4px 0; padding-inline-start: 24px; }
li { margin: 2px 0; }
li input[type=checkbox] { margin-inline-end: 6px; }
hr { border: 0; border-top: 1px solid var(--line); margin: 18px 0; }
[dir=rtl], td[dir=auto]:lang(ar) { text-align: right; }
.index td:first-child { white-space: nowrap; font-weight: 600; color: var(--brand); }
@media screen { body { background: #e2e8f0; } main { background: #fff; padding: 24px 40px; box-shadow: 0 0 20px #0002; }
  .cover { height: auto; min-height: 90vh; } }
`;

function page({ title, titleAr, subtitle, toc, body, extra = "" }) {
  const tocHtml = toc
    .map((t) => `<li class="d${t.depth}"><a href="#${t.id}">${t.text}</a></li>`)
    .join("\n");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title><style>${CSS}</style></head>
<body><main>
<div class="cover"><div><div class="brand">NEDJM FROID ERP</div><h1>${title}</h1><div class="ar">${titleAr}</div>
<p class="sub">${subtitle}</p></div><div class="foot"><span>Module Ressources Humaines</span><span>${EDITION}</span></div></div>
<nav class="toc"><h2>Sommaire</h2><ol>${tocHtml}</ol></nav>
${extra}
${body}
</main></body></html>`;
}

const manual = render(CHAPTERS, "chapitres", "m");
writeFileSync(
  join(root, "Manuel-RH.html"),
  page({
    title: "Manuel d'utilisation",
    titleAr: "دليل استعمال وحدة الموارد البشرية",
    subtitle:
      "Toutes les fonctions du module Ressources Humaines, fiche par fiche : où les trouver, ce qu'il faut avant de commencer, les étapes et le résultat. Chaque fiche renvoie à sa vidéo.",
    toc: manual.toc,
    body: manual.body,
  }),
);

const videos = render(VIDEOS, "videos", "v");
const rows = [];
for (const name of VIDEOS) {
  const md = readFileSync(join(root, "videos", `${name}.md`), "utf8").replace(/\r\n/g, "\n");
  for (const m of md.matchAll(/^## (V\d+\.\d+)\s*[—-]\s*(.+)\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)) {
    const duration = /\*\*Durée cible\*\*\s*:\s*([^·\n]+)/.exec(m[3])?.[1]?.trim() ?? "";
    const fiche = /\*\*Fiche[^*]*\*\*\s*:\s*([^\n·]+)/.exec(m[3])?.[1]?.trim() ?? "";
    rows.push(`<tr><td>${m[1]}</td><td dir="auto">${m[2].trim()}</td><td>${duration}</td><td>${fiche}</td></tr>`);
  }
}
const index = `<section class="chapter index"><h1>Catalogue des vidéos</h1>
<p>${rows.length} vidéos. Chaque vidéo correspond à la fiche du manuel indiquée. Les scripts détaillés (actions à l'écran, voix off en arabe, durées) suivent.</p>
<table><thead><tr><th>Vidéo</th><th>Titre</th><th>Durée</th><th>Fiche</th></tr></thead><tbody>${rows.join("")}</tbody></table></section>`;
writeFileSync(
  join(root, "Videos-RH-scripts.html"),
  page({
    title: "Vidéos tutorielles — scripts",
    titleAr: "سيناريوهات الفيديوهات التعليمية",
    subtitle:
      "Le scénario de chaque vidéo : ce qu'on montre à l'écran, la voix off en arabe et la durée de chaque séquence, avec les données fictives à préparer avant l'enregistrement.",
    toc: [{ depth: 1, id: "v-catalogue", text: "Catalogue des vidéos" }, ...videos.toc],
    body: videos.body,
    extra: index.replace('<h1>', '<h1 id="v-catalogue">'),
  }),
);
console.log(`manual: ${manual.toc.filter((t) => t.depth === 2).length} sections · videos: ${rows.length}`);
