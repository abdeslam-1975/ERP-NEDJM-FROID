import PDFDocument from "pdfkit";
import type { ContractAttributes } from "@/lib/contracts/attributes-schema";

export type InvoicePdfLine = {
  item_code: string;
  designation: string;
  unit: string;
  quantity: number;
  unit_price_ht: number;
  total_price_ht: number;
  tax_rate: number;
  tax_amount: number;
};

export type InvoicePdfInput = {
  invoice_number: string;
  invoice_date: string;
  status: "BROUILLON" | "EMISE" | "ANNULEE";
  note: string | null;
  total_ht: number;
  tva_rate: number;
  tva_amount: number;
  total_ttc: number;
  tax_mode: "TAXABLE" | "EXEMPT" | "MIXED";
  tax_breakdown: { rate: number; base_ht: number; tax_amount: number }[];
  exemption_certificate_number: string | null;
  exemption_certificate_date: string | null;
  exemption_note: string | null;
  lines: InvoicePdfLine[];
  contract_number: string;
  client_name: string;
  site_name: string | null;
  issuer: ContractAttributes["issuer"];
  tva_exempt: boolean;
  tva_articles: string[];
};

function money(n: number): string {
  return new Intl.NumberFormat("fr-DZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function nonEmpty(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
}

/** Build a French A4 invoice PDF buffer (UI-driven issuer letterhead). */
export async function buildInvoicePdf(
  input: InvoicePdfInput,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 48,
    info: {
      Title: `Facture ${input.invoice_number}`,
      Author: nonEmpty(input.issuer.legal_name) ?? "ERP Contrats",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const issuerName =
    nonEmpty(input.issuer.legal_name) ?? "[Émetteur — renseigner attributes.issuer]";
  doc.font("Helvetica-Bold").fontSize(14).text(issuerName, { align: "left" });
  doc.font("Helvetica").fontSize(9).fillColor("#333333");

  const issuerLines = [
    nonEmpty(input.issuer.address),
    nonEmpty(input.issuer.city),
    nonEmpty(input.issuer.phone) ? `Tél. ${input.issuer.phone}` : null,
    nonEmpty(input.issuer.email),
    nonEmpty(input.issuer.nif) ? `NIF ${input.issuer.nif}` : null,
    nonEmpty(input.issuer.rc) ? `RC ${input.issuer.rc}` : null,
    nonEmpty(input.issuer.ai) ? `AI ${input.issuer.ai}` : null,
    nonEmpty(input.issuer.nis) ? `NIS ${input.issuer.nis}` : null,
    nonEmpty(input.issuer.capital) ? `Capital ${input.issuer.capital}` : null,
  ].filter(Boolean) as string[];

  for (const line of issuerLines) {
    doc.text(line);
  }

  doc.moveDown(1.2);
  doc
    .fillColor("#000000")
    .font("Helvetica-Bold")
    .fontSize(16)
    .text("FACTURE", { align: "right" });
  doc
    .font("Helvetica")
    .fontSize(10)
    .text(`N° ${input.invoice_number}`, { align: "right" })
    .text(`Date ${input.invoice_date}`, { align: "right" })
    .text(`Statut ${input.status}`, { align: "right" });

  if (input.status !== "EMISE") {
    doc
      .moveDown(0.4)
      .font("Helvetica-Bold")
      .fillColor(input.status === "ANNULEE" ? "#b91c1c" : "#a16207")
      .fontSize(11)
      .text(
        input.status === "ANNULEE"
          ? "DOCUMENT ANNULÉ — non opposable"
          : "BROUILLON — non émis",
        { align: "right" },
      )
      .fillColor("#000000");
  }

  doc.moveDown(1);
  doc.font("Helvetica-Bold").fontSize(11).text("Client");
  doc.font("Helvetica").fontSize(10);
  doc.text(input.client_name);
  if (nonEmpty(input.site_name)) doc.text(`Site : ${input.site_name}`);
  doc.text(`Contrat : ${input.contract_number}`);

  doc.moveDown(1);
  const tableTop = doc.y;
  const cols = {
    code: 48,
    designation: 110,
    qty: 320,
    unit: 360,
    pu: 400,
    total: 480,
  };

  doc.font("Helvetica-Bold").fontSize(8);
  doc.text("Code", cols.code, tableTop, { width: 55 });
  doc.text("Désignation", cols.designation, tableTop, { width: 200 });
  doc.text("Qté", cols.qty, tableTop, { width: 35, align: "right" });
  doc.text("Unité", cols.unit, tableTop, { width: 35 });
  doc.text("PU HT", cols.pu, tableTop, { width: 70, align: "right" });
  doc.text("Total HT", cols.total, tableTop, { width: 70, align: "right" });
  doc
    .moveTo(48, tableTop + 12)
    .lineTo(547, tableTop + 12)
    .strokeColor("#999999")
    .stroke();

  let y = tableTop + 18;
  doc.font("Helvetica").fontSize(8).strokeColor("#000000");

  for (const line of input.lines) {
    if (y > 700) {
      doc.addPage();
      y = 48;
    }
    const designation = line.designation.slice(0, 80);
    doc.text(line.item_code, cols.code, y, { width: 55 });
    doc.text(designation, cols.designation, y, { width: 200 });
    doc.text(String(line.quantity), cols.qty, y, {
      width: 35,
      align: "right",
    });
    doc.text(line.unit, cols.unit, y, { width: 35 });
    doc.text(money(line.unit_price_ht), cols.pu, y, {
      width: 70,
      align: "right",
    });
    doc.text(money(line.total_price_ht), cols.total, y, {
      width: 70,
      align: "right",
    });
    y += 16;
  }

  doc.y = y + 8;
  doc
    .moveTo(48, doc.y)
    .lineTo(547, doc.y)
    .strokeColor("#999999")
    .stroke();
  doc.moveDown(0.8);
  doc.font("Helvetica").fontSize(10).fillColor("#000000");

  const totalsX = 360;
  doc.text("Total HT", totalsX, doc.y, { width: 90 });
  doc.text(`${money(input.total_ht)} DA`, 450, doc.y, {
    width: 97,
    align: "right",
  });
  doc.moveDown(0.6);

  if (input.tva_amount <= 0) {
    const arts =
      input.tva_articles.length > 0
        ? ` (art. ${input.tva_articles.join(", ")})`
        : "";
    doc.text(`TVA exonérée${arts}`, totalsX, doc.y, { width: 180 });
    doc.moveDown(0.6);
  } else if (
    input.tax_breakdown.filter((row) => row.rate > 0).length <= 1 &&
    !input.tax_breakdown.some((row) => row.rate === 0)
  ) {
    doc.text(`TVA (${(input.tva_rate * 100).toFixed(2)} %)`, totalsX, doc.y, {
      width: 90,
    });
    doc.text(`${money(input.tva_amount)} DA`, 450, doc.y, {
      width: 97,
      align: "right",
    });
    doc.moveDown(0.6);
  } else {
    for (const row of input.tax_breakdown) {
      if (row.rate === 0) {
        doc.text(`Base exonérée : ${money(row.base_ht)} DA`, totalsX, doc.y, {
          width: 187,
        });
      } else {
        doc.text(
          `TVA ${(row.rate * 100).toFixed(2)}% / base ${money(row.base_ht)}`,
          totalsX,
          doc.y,
          { width: 150 },
        );
        doc.text(`${money(row.tax_amount)} DA`, 500, doc.y, {
          width: 47,
          align: "right",
        });
      }
      doc.moveDown(0.5);
    }
  }

  doc.font("Helvetica-Bold");
  doc.text("Total TTC", totalsX, doc.y, { width: 90 });
  doc.text(`${money(input.total_ttc)} DA`, 450, doc.y, {
    width: 97,
    align: "right",
  });

  if (nonEmpty(input.exemption_certificate_number)) {
    doc.moveDown(1);
    doc.font("Helvetica").fontSize(8).text(
      `Attestation d'exonération : ${input.exemption_certificate_number}` +
        (input.exemption_certificate_date
          ? ` du ${input.exemption_certificate_date}`
          : ""),
    );
    if (nonEmpty(input.exemption_note)) doc.text(input.exemption_note!);
  }

  if (nonEmpty(input.note)) {
    doc.moveDown(1.2);
    doc.font("Helvetica-Bold").fontSize(10).text("Note");
    doc.font("Helvetica").fontSize(9).text(input.note!);
  }

  doc.moveDown(2);
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#666666")
    .text(
      "Document généré depuis le hub contrats. Identifiants légaux émetteur = attributes.issuer (UI).",
      { align: "left" },
    );

  doc.end();
  return done;
}

export function invoicePdfFilename(invoiceNumber: string): string {
  const safe = invoiceNumber.replace(/[^\w./-]+/g, "_").replace(/\//g, "-");
  return `Facture_${safe}.pdf`;
}
