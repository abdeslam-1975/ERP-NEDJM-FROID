import PDFDocument from "pdfkit";

export type PurchaseOrderPdfInput = {
  order_number: string;
  order_date: string;
  expected_delivery_date: string | null;
  delivery_address: string | null;
  payment_terms: string | null;
  note: string | null;
  status: string;
  issuer: Record<string, string | null>;
  supplier: {
    legal_name: string;
    address: string | null;
    city: string | null;
    phone: string | null;
    nif: string | null;
    rc: string | null;
  };
  lines: {
    item_code: string;
    designation: string;
    unit: string;
    quantity: number;
    supply_unit_price_ht: number;
    installation_unit_price_ht: number;
    total_ht: number;
    tax_rate: number;
    tax_amount: number;
  }[];
  total_ht: number;
  total_tva: number;
  total_ttc: number;
};

const money = (value: number) =>
  new Intl.NumberFormat("fr-DZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

export async function buildPurchaseOrderPdf(input: PurchaseOrderPdfInput): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 42,
    info: { Title: `Bon de commande ${input.order_number}` },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const issuerName = input.issuer.legal_name?.trim() || "[Profil d’impression non configuré]";
  doc.font("Helvetica-Bold").fontSize(14).text(issuerName);
  doc.font("Helvetica").fontSize(8).fillColor("#444444");
  [
    input.issuer.address,
    input.issuer.city,
    input.issuer.phone ? `Tél. ${input.issuer.phone}` : null,
    input.issuer.nif ? `NIF ${input.issuer.nif}` : null,
    input.issuer.rc ? `RC ${input.issuer.rc}` : null,
    input.issuer.nis ? `NIS ${input.issuer.nis}` : null,
    input.issuer.ai ? `AI ${input.issuer.ai}` : null,
  ].filter(Boolean).forEach((line) => doc.text(String(line)));

  doc.fillColor("#000000").font("Helvetica-Bold").fontSize(17).text("BON DE COMMANDE", { align: "right" });
  doc.font("Helvetica").fontSize(10)
    .text(`N° ${input.order_number}`, { align: "right" })
    .text(`Date ${input.order_date}`, { align: "right" })
    .text(`Statut ${input.status}`, { align: "right" });

  doc.moveDown().font("Helvetica-Bold").fontSize(10).text("Fournisseur");
  doc.font("Helvetica").text(input.supplier.legal_name);
  if (input.supplier.address) doc.text(`${input.supplier.address}${input.supplier.city ? `, ${input.supplier.city}` : ""}`);
  if (input.supplier.nif) doc.text(`NIF ${input.supplier.nif}`);
  if (input.supplier.rc) doc.text(`RC ${input.supplier.rc}`);
  if (input.supplier.phone) doc.text(`Tél. ${input.supplier.phone}`);

  const tableTop = doc.y + 14;
  const columns = { code: 42, designation: 95, qty: 275, supply: 320, install: 390, tax: 460, total: 500 };
  doc.font("Helvetica-Bold").fontSize(7);
  doc.text("Code", columns.code, tableTop, { width: 48 });
  doc.text("Désignation", columns.designation, tableTop, { width: 170 });
  doc.text("Qté", columns.qty, tableTop, { width: 40, align: "right" });
  doc.text("P.U fourn.", columns.supply, tableTop, { width: 65, align: "right" });
  doc.text("P.U pose", columns.install, tableTop, { width: 65, align: "right" });
  doc.text("TVA", columns.tax, tableTop, { width: 38, align: "right" });
  doc.text("Total HT", columns.total, tableTop, { width: 53, align: "right" });
  doc.moveTo(42, tableTop + 12).lineTo(553, tableTop + 12).strokeColor("#999999").stroke();

  let y = tableTop + 18;
  doc.font("Helvetica").fontSize(7.5).fillColor("#000000");
  for (const line of input.lines) {
    if (y > 700) {
      doc.addPage();
      y = 42;
    }
    doc.text(line.item_code, columns.code, y, { width: 48 });
    doc.text(line.designation.slice(0, 80), columns.designation, y, { width: 170 });
    doc.text(`${line.quantity} ${line.unit}`, columns.qty, y, { width: 40, align: "right" });
    doc.text(money(line.supply_unit_price_ht), columns.supply, y, { width: 65, align: "right" });
    doc.text(money(line.installation_unit_price_ht), columns.install, y, { width: 65, align: "right" });
    doc.text(`${(line.tax_rate * 100).toFixed(2)}%`, columns.tax, y, { width: 38, align: "right" });
    doc.text(money(line.total_ht), columns.total, y, { width: 53, align: "right" });
    y += 17;
  }

  doc.y = y + 8;
  doc.moveTo(310, doc.y).lineTo(553, doc.y).strokeColor("#999999").stroke();
  doc.moveDown(0.6);
  const totalsX = 380;
  const totalLine = (label: string, value: number, bold = false) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).text(label, totalsX, doc.y, { width: 75 });
    doc.text(`${money(value)} DA`, 455, doc.y, { width: 98, align: "right" });
    doc.moveDown(0.5);
  };
  totalLine("Total HT", input.total_ht);
  totalLine("Total TVA", input.total_tva);
  totalLine("Total TTC", input.total_ttc, true);

  doc.moveDown();
  doc.font("Helvetica").fontSize(8);
  if (input.expected_delivery_date) doc.text(`Livraison prévue : ${input.expected_delivery_date}`);
  if (input.delivery_address) doc.text(`Adresse de livraison : ${input.delivery_address}`);
  if (input.payment_terms) doc.text(`Conditions de paiement : ${input.payment_terms}`);
  if (input.note) doc.text(`Observation : ${input.note}`);
  if (input.issuer.footer) doc.moveDown().fillColor("#555555").text(input.issuer.footer);

  doc.end();
  return done;
}

export function purchaseOrderPdfFilename(orderNumber: string): string {
  return `Bon_de_commande_${orderNumber.replace(/\//g, "-").replace(/[^\w.-]+/g, "_")}.pdf`;
}
