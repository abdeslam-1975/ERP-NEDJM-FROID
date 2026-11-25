import PDFDocument from "pdfkit";
import { frenchAmountWords } from "@/lib/hr/doc-format";

export type SalesOrderPdfInput = {
  order_number: string;
  order_date: string;
  payment_terms: string | null;
  delivery_delay: string | null;
  buyer_name: string | null;
  established_by: string | null;
  contract_ref: string | null;
  note: string | null;
  status: string;
  has_pose: boolean;
  client: {
    legal_name: string;
    address: string | null;
    nif: string | null;
    article: string | null;
    rc: string | null;
    phone: string | null;
  };
  issuer: Record<string, string | null>;
  lines: {
    item_code: string;
    designation: string;
    unit: string;
    quantity: number;
    unit_price_ht: number;
    pose_price_ht: number;
    line_ht: number;
  }[];
  tax_rate: number;
  discount_amount: number;
  total_ht: number;
  total_ht_net: number;
  total_tva: number;
  total_ttc: number;
  retention_amount: number;
  stamp_amount: number;
  net_payable: number;
  amount_in_words: string | null;
};

const money = (value: number) =>
  new Intl.NumberFormat("fr-DZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

export async function buildSalesOrderPdf(input: SalesOrderPdfInput): Promise<Buffer> {
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

  const issuerName = input.issuer.legal_name?.trim() || "NEDJM FROID";
  doc.font("Helvetica-Bold").fontSize(14).text(issuerName);
  doc.font("Helvetica").fontSize(8).fillColor("#444444");
  [
    input.issuer.address,
    input.issuer.city,
    input.issuer.phone ? `Tél. ${input.issuer.phone}` : null,
    input.issuer.nif ? `NIF ${input.issuer.nif}` : null,
    input.issuer.rc ? `RC ${input.issuer.rc}` : null,
  ]
    .filter(Boolean)
    .forEach((line) => doc.text(String(line)));

  doc.fillColor("#000000").font("Helvetica-Bold").fontSize(17).text("BON DE COMMANDE", {
    align: "right",
  });
  doc
    .font("Helvetica")
    .fontSize(10)
    .text(`N° ${input.order_number}`, { align: "right" })
    .text(`Date ${input.order_date}`, { align: "right" })
    .text(`Statut ${input.status}`, { align: "right" });

  doc.moveDown().font("Helvetica-Bold").fontSize(10).text("Doit");
  doc.font("Helvetica").text(input.client.legal_name);
  if (input.client.address) doc.text(input.client.address);
  if (input.client.nif) doc.text(`ID Fiscal ${input.client.nif}`);
  if (input.client.article) doc.text(`Article ${input.client.article}`);
  if (input.client.rc) doc.text(`RC ${input.client.rc}`);
  if (input.client.phone) doc.text(`Tél. ${input.client.phone}`);

  doc.moveDown(0.5).font("Helvetica").fontSize(9);
  if (input.payment_terms) doc.text(`Paiement : ${input.payment_terms}`);
  if (input.delivery_delay) doc.text(`Délai de livraison : ${input.delivery_delay}`);
  if (input.contract_ref) doc.text(`Réf. : ${input.contract_ref}`);
  if (input.established_by) doc.text(`Établie par : ${input.established_by}`);
  if (input.buyer_name) doc.text(`Acheteur : ${input.buyer_name}`);

  const tableTop = doc.y + 14;
  const columns = input.has_pose
    ? { n: 42, code: 62, designation: 110, qty: 280, unit: 320, supply: 360, pose: 430, total: 500 }
    : { n: 42, code: 62, designation: 110, qty: 300, unit: 345, supply: 390, pose: 0, total: 480 };

  doc.font("Helvetica-Bold").fontSize(7);
  doc.text("N°", columns.n, tableTop, { width: 18 });
  doc.text("Item", columns.code, tableTop, { width: 42 });
  doc.text("Désignation", columns.designation, tableTop, { width: input.has_pose ? 160 : 180 });
  doc.text("Qté", columns.qty, tableTop, { width: 36, align: "right" });
  doc.text("U", columns.unit, tableTop, { width: 28 });
  doc.text("P.U HT", columns.supply, tableTop, { width: 60, align: "right" });
  if (input.has_pose) {
    doc.text("P.U Pose", columns.pose, tableTop, { width: 60, align: "right" });
  }
  doc.text("Montant", columns.total, tableTop, { width: 55, align: "right" });
  doc.moveTo(42, tableTop + 12).lineTo(553, tableTop + 12).strokeColor("#999999").stroke();

  let y = tableTop + 18;
  doc.font("Helvetica").fontSize(7.5).fillColor("#000000");
  input.lines.forEach((line, idx) => {
    if (y > 700) {
      doc.addPage();
      y = 42;
    }
    doc.text(String(idx + 1), columns.n, y, { width: 18 });
    doc.text(line.item_code || "", columns.code, y, { width: 42 });
    doc.text(line.designation.slice(0, 90), columns.designation, y, {
      width: input.has_pose ? 160 : 180,
    });
    doc.text(String(line.quantity), columns.qty, y, { width: 36, align: "right" });
    doc.text(line.unit || "", columns.unit, y, { width: 28 });
    doc.text(money(line.unit_price_ht), columns.supply, y, { width: 60, align: "right" });
    if (input.has_pose) {
      doc.text(money(line.pose_price_ht), columns.pose, y, { width: 60, align: "right" });
    }
    doc.text(money(line.line_ht), columns.total, y, { width: 55, align: "right" });
    y += 16;
  });

  doc.y = y + 10;
  doc.moveTo(310, doc.y).lineTo(553, doc.y).strokeColor("#999999").stroke();
  doc.moveDown(0.5);
  const totalsX = 360;
  const totalLine = (label: string, value: number, bold = false) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).text(label, totalsX, doc.y, {
      width: 95,
    });
    doc.text(`${money(value)} DA`, 455, doc.y, { width: 98, align: "right" });
    doc.moveDown(0.45);
  };
  totalLine("Total HT", input.total_ht);
  if (input.discount_amount > 0) totalLine("Remise", input.discount_amount);
  if (input.discount_amount > 0) totalLine("Total HT - Remise", input.total_ht_net);
  totalLine(`Total TVA (${(input.tax_rate * 100).toFixed(0)} %)`, input.total_tva);
  totalLine("Total TTC", input.total_ttc);
  if (input.retention_amount > 0) totalLine("R. de garantie", input.retention_amount);
  if (input.stamp_amount > 0) totalLine("Timbre", input.stamp_amount);
  totalLine("Net à payer", input.net_payable, true);

  const words = input.amount_in_words?.trim() || frenchAmountWords(input.net_payable);
  doc.moveDown();
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#111111")
    .text(`Arrêtée le présent bon de commande à la somme de : ${words}.`);

  if (input.note) {
    doc.moveDown().fillColor("#555555").fontSize(8).text(`Observation : ${input.note}`);
  }

  doc.end();
  return done;
}

export function salesOrderPdfFilename(orderNumber: string): string {
  return `Bon_de_commande_${orderNumber.replace(/\//g, "-").replace(/[^\w.-]+/g, "_")}.pdf`;
}
