import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { documentXmlToText, docxToText } from "@/lib/contracts/docx-text";

const xml = `<?xml version="1.0"?><w:document><w:body>
<w:p><w:r><w:t>Article 25 &#8211; R&#233;siliation</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Pr&#233;avis de </w:t></w:r><w:r><w:t>30 jours &amp; mise en demeure</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Absence</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>10 %</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
</w:body></w:document>`;

describe("docx text", () => {
  it("keeps paragraphs, entities and table cells", () => {
    const text = documentXmlToText(xml);
    expect(text).toContain("Article 25 – Résiliation");
    expect(text).toContain("Préavis de 30 jours & mise en demeure");
    expect(text).toContain("Absence");
    expect(text).toContain("10 %");
  });

  it("reads word/document.xml from a .docx archive", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", xml);
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    expect(await docxToText(bytes)).toContain("Résiliation");
  });

  it("rejects a file that is not a Word document", async () => {
    const zip = new JSZip();
    zip.file("other.txt", "x");
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    await expect(docxToText(bytes)).rejects.toThrow("Document Word illisible");
  });
});
