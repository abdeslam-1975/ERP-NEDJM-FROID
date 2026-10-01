import { describe, expect, it } from "vitest";
import { decodeBody, decodeEntities, extractLinks } from "@/lib/watch/links";

const PAGE = "https://www.joradp.dz/HFR/Index.htm";
const DOMAINS = ["joradp.dz", "mfdgi.gov.dz"];

describe("extractLinks", () => {
  it("keeps documents and article links on allowed domains, resolved against the page", () => {
    const html = `
      <a href="/FTP/jo-francais/2026/F2026012.pdf">JO n° 12</a>
      <a href='../HAR/Index.htm'>Accueil</a>
      <a href="https://www.mfdgi.gov.dz/index.php/actualites/123">Note relative au barème de l&#39;IRG &amp; abattements 2026</a>
      <a href="https://example.com/loi.pdf">Copie externe</a>
      <a href="http://www.joradp.dz/FTP/x.pdf">Non sécurisé</a>
      <a href="javascript:void(0)">Script</a>
      <a href="#haut">Haut de page</a>
      <a href="mailto:contact@joradp.dz">Contact</a>`;
    expect(extractLinks(html, PAGE, DOMAINS)).toEqual([
      { url: "https://www.joradp.dz/FTP/jo-francais/2026/F2026012.pdf", title: "JO n° 12" },
      { url: "https://www.mfdgi.gov.dz/index.php/actualites/123", title: "Note relative au barème de l'IRG & abattements 2026" },
    ]);
  });

  it("strips inner tags, uses the title attribute when the text is empty and keeps one entry per address", () => {
    const html = `
      <a href="/FTP/a.pdf" title="Décret exécutif n° 26-01"><img src="pdf.png"></a>
      <a href="/FTP/a.pdf#p2"><span>Décret exécutif</span> <b>n° 26-01 fixant le SNMG</b></a>`;
    expect(extractLinks(html, PAGE, DOMAINS)).toEqual([
      { url: "https://www.joradp.dz/FTP/a.pdf", title: "Décret exécutif n° 26-01 fixant le SNMG" },
    ]);
  });

  it("keeps Arabic titles and skips the page itself", () => {
    const html = `<a href="${PAGE}">صفحة الجريدة الرسمية الرئيسية للجمهورية</a>
      <a href="/FTP/jo-arabe/2026/A2026012.pdf">العدد 12 — قانون المالية</a>`;
    expect(extractLinks(html, PAGE, DOMAINS)).toEqual([
      { url: "https://www.joradp.dz/FTP/jo-arabe/2026/A2026012.pdf", title: "العدد 12 — قانون المالية" },
    ]);
  });
});

describe("decodeEntities / decodeBody", () => {
  it("decodes named and numeric entities", () => {
    expect(decodeEntities("a&nbsp;&lt;b&gt; &#233;t&#xE9; &unknown;")).toBe("a <b> été &unknown;");
  });

  it("decodes with the announced charset", () => {
    const latin1 = new Uint8Array([0x64, 0xe9, 0x63, 0x72, 0x65, 0x74]);
    expect(decodeBody(latin1, "text/html; charset=ISO-8859-1")).toBe("décret");
    expect(decodeBody(new TextEncoder().encode("décret"), "text/html")).toBe("décret");
  });
});
