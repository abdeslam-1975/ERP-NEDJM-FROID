import { NextResponse } from "next/server";
import { requireContractAccess } from "@/lib/auth/require-roles";
import {
  buildInvoicePdf,
  invoicePdfFilename,
} from "@/lib/contracts/invoice-pdf";
import { normalizeContractAttributes } from "@/lib/contracts/attributes-schema";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ invoiceId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const gate = await requireContractAccess();
  if (!gate.ok) {
    const status = gate.error.includes("Session") ? 401 : 403;
    return NextResponse.json({ error: gate.error }, { status });
  }

  const { invoiceId } = await context.params;
  if (!invoiceId) {
    return NextResponse.json({ error: "invoiceId requis" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: inv, error } = await supabase
    .from("contract_invoices")
    .select(
      `
      id, invoice_number, invoice_date, status, total_ht,
      tva_rate, tva_amount, total_ttc, tax_mode, tax_breakdown,
      exemption_certificate_number, exemption_certificate_date, exemption_note, note,
      total_supply_ht, total_installation_ht, retention_rate, retention_amount,
      retention_status, retention_due_date, stamp_amount, net_payable,
      situation:ref_situation_types(label_fr),
      contract:ref_contracts!inner (
        id, contract_number, client_name, attributes,
        site:ref_sites ( name_fr )
      ),
      lines:contract_invoice_lines (
        item_code, designation, unit, quantity, unit_price_ht, total_price_ht,
        supply_unit_price_ht, installation_unit_price_ht,
        tax_rate, tax_amount
      )
    `,
    )
    .eq("id", invoiceId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!inv) {
    return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });
  }

  const contractRaw = Array.isArray(inv.contract)
    ? inv.contract[0]
    : inv.contract;
  if (!contractRaw) {
    return NextResponse.json(
      { error: "Contrat lié introuvable" },
      { status: 404 },
    );
  }

  const siteRaw = Array.isArray(contractRaw.site)
    ? contractRaw.site[0]
    : contractRaw.site;
  const attrs = normalizeContractAttributes(contractRaw.attributes);
  const status = String(inv.status) as "BROUILLON" | "EMISE" | "ANNULEE";

  const pdf = await buildInvoicePdf({
    invoice_number: String(inv.invoice_number),
    invoice_date: String(inv.invoice_date),
    status,
    note: inv.note ?? null,
    total_ht: Number(inv.total_ht),
    tva_rate: Number(inv.tva_rate ?? 0),
    tva_amount: Number(inv.tva_amount ?? 0),
    total_ttc: Number(inv.total_ttc ?? inv.total_ht ?? 0),
    tax_mode: String(inv.tax_mode ?? "TAXABLE") as
      | "TAXABLE"
      | "EXEMPT"
      | "MIXED",
    tax_breakdown: Array.isArray(inv.tax_breakdown)
      ? (inv.tax_breakdown as Array<Record<string, unknown>>).map((row) => ({
          rate: Number(row.rate ?? 0),
          base_ht: Number(row.base_ht ?? 0),
          tax_amount: Number(row.tax_amount ?? 0),
        }))
      : [],
    exemption_certificate_number:
      inv.exemption_certificate_number ?? null,
    exemption_certificate_date: inv.exemption_certificate_date ?? null,
    exemption_note: inv.exemption_note ?? null,
    situation_label: (
      Array.isArray(inv.situation) ? inv.situation[0] : inv.situation
    )?.label_fr ?? null,
    total_supply_ht: Number(inv.total_supply_ht ?? inv.total_ht),
    total_installation_ht: Number(inv.total_installation_ht ?? 0),
    retention_rate: Number(inv.retention_rate ?? 0),
    retention_amount: Number(inv.retention_amount ?? 0),
    retention_status: String(inv.retention_status ?? "NONE") as
      | "NONE"
      | "HELD"
      | "RELEASED",
    retention_due_date: inv.retention_due_date ?? null,
    stamp_amount: Number(inv.stamp_amount ?? 0),
    net_payable: Number(inv.net_payable ?? inv.total_ttc ?? inv.total_ht),
    lines: ((inv.lines ?? []) as Array<Record<string, unknown>>).map((l) => ({
      item_code: String(l.item_code ?? ""),
      designation: String(l.designation ?? ""),
      unit: String(l.unit ?? ""),
      quantity: Number(l.quantity ?? 0),
      unit_price_ht: Number(l.unit_price_ht ?? 0),
      supply_unit_price_ht: Number(l.supply_unit_price_ht ?? l.unit_price_ht ?? 0),
      installation_unit_price_ht: Number(l.installation_unit_price_ht ?? 0),
      total_price_ht: Number(l.total_price_ht ?? 0),
      tax_rate: Number(l.tax_rate ?? 0),
      tax_amount: Number(l.tax_amount ?? 0),
    })),
    contract_number: String(contractRaw.contract_number),
    client_name: String(contractRaw.client_name),
    site_name: siteRaw?.name_fr ? String(siteRaw.name_fr) : null,
    issuer: attrs.issuer,
    tva_exempt: attrs.financial.tva_exempt || Number(inv.tva_amount ?? 0) <= 0,
    tva_articles: attrs.financial.tva_articles,
  });

  const filename = invoicePdfFilename(String(inv.invoice_number));
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
