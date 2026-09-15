import { NextResponse } from "next/server";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import {
  buildPurchaseOrderPdf,
  purchaseOrderPdfFilename,
} from "@/lib/purchases/purchase-order-pdf";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ orderId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return NextResponse.json({ error: "Session requise." }, { status: 401 });
  const { orderId } = await context.params;
  const supabase = await createClient();
  const { data: order, error } = await supabase
    .from("pur_orders")
    .select(`
      order_number, order_date, expected_delivery_date, delivery_address,
      payment_terms, note, status, issuer_snapshot, total_ht, total_tva, total_ttc,
      supplier:pur_suppliers!inner(legal_name, address, city, phone, nif, rc),
      lines:pur_order_lines(
        item_code, designation, unit, quantity, supply_unit_price_ht,
        installation_unit_price_ht, total_ht, tax_rate, tax_amount, sort_order
      )
    `)
    .eq("id", orderId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  if (!order) return NextResponse.json({ error: "Bon de commande introuvable." }, { status: 404 });
  const supplier = Array.isArray(order.supplier) ? order.supplier[0] : order.supplier;
  if (!supplier) return NextResponse.json({ error: "Fournisseur introuvable." }, { status: 404 });
  const issuer =
    order.issuer_snapshot && typeof order.issuer_snapshot === "object" && !Array.isArray(order.issuer_snapshot)
      ? (order.issuer_snapshot as Record<string, string | null>)
      : {};

  const pdf = await buildPurchaseOrderPdf({
    order_number: order.order_number,
    order_date: order.order_date,
    expected_delivery_date: order.expected_delivery_date,
    delivery_address: order.delivery_address,
    payment_terms: order.payment_terms,
    note: order.note,
    status: order.status,
    issuer,
    supplier,
    lines: (order.lines ?? []).map((line) => ({
      ...line,
      quantity: Number(line.quantity),
      supply_unit_price_ht: Number(line.supply_unit_price_ht),
      installation_unit_price_ht: Number(line.installation_unit_price_ht),
      total_ht: Number(line.total_ht),
      tax_rate: Number(line.tax_rate),
      tax_amount: Number(line.tax_amount),
    })),
    total_ht: Number(order.total_ht),
    total_tva: Number(order.total_tva),
    total_ttc: Number(order.total_ttc),
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${purchaseOrderPdfFilename(order.order_number)}"`,
      "Cache-Control": "no-store",
    },
  });
}
