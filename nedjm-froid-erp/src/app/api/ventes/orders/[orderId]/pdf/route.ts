import { NextResponse } from "next/server";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { createClient } from "@/lib/supabase/server";
import {
  buildSalesOrderPdf,
  salesOrderPdfFilename,
} from "@/lib/ventes/order-pdf";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ orderId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const workspace = await getWorkspaceProfile();
  if (!workspace) {
    return NextResponse.json({ error: "Session requise." }, { status: 401 });
  }

  const { orderId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return NextResponse.json({ error: "Bon de commande invalide." }, { status: 400 });
  }

  const supabase = await createClient();
  const can = await supabase.rpc("sal_can", { p_action: "read" });
  if (can.error || !can.data) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const { data: order, error } = await supabase
    .from("sal_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!order) {
    return NextResponse.json({ error: "Bon de commande introuvable." }, { status: 404 });
  }

  const { data: lines, error: linesError } = await supabase
    .from("sal_order_lines")
    .select("*")
    .eq("order_id", orderId)
    .order("line_no");
  if (linesError) return NextResponse.json({ error: linesError.message }, { status: 500 });

  const issuer = {
    legal_name: "NEDJM FROID",
    address: null as string | null,
    city: null as string | null,
    phone: null as string | null,
    nif: null as string | null,
    rc: null as string | null,
  };

  const pdf = await buildSalesOrderPdf({
    order_number: String(order.order_number),
    order_date: String(order.order_date).slice(0, 10),
    payment_terms: (order.payment_terms as string | null) ?? null,
    delivery_delay: (order.delivery_delay as string | null) ?? null,
    buyer_name: (order.buyer_name as string | null) ?? null,
    established_by: (order.established_by as string | null) ?? null,
    contract_ref: (order.contract_ref as string | null) ?? null,
    note: (order.note as string | null) ?? null,
    status: String(order.status),
    has_pose: !!order.has_pose,
    client: {
      legal_name: String(order.client_name),
      address: (order.client_address as string | null) ?? null,
      nif: (order.client_nif as string | null) ?? null,
      article: (order.client_article as string | null) ?? null,
      rc: (order.client_rc as string | null) ?? null,
      phone: (order.client_phone as string | null) ?? null,
    },
    issuer,
    lines: (lines ?? []).map((l) => ({
      item_code: String(l.item_code ?? ""),
      designation: String(l.designation),
      unit: String(l.unit ?? ""),
      quantity: Number(l.qty) || 0,
      unit_price_ht: Number(l.unit_price_ht) || 0,
      pose_price_ht: Number(l.pose_price_ht) || 0,
      line_ht: Number(l.line_ht) || 0,
    })),
    tax_rate: Number(order.tax_rate) || 0,
    discount_amount: Number(order.discount_amount) || 0,
    total_ht: Number(order.total_ht) || 0,
    total_ht_net: Number(order.total_ht_net) || 0,
    total_tva: Number(order.total_tva) || 0,
    total_ttc: Number(order.total_ttc) || 0,
    retention_amount: Number(order.retention_amount) || 0,
    stamp_amount: Number(order.stamp_amount) || 0,
    net_payable: Number(order.net_payable) || 0,
    amount_in_words: (order.amount_in_words as string | null) ?? null,
  });

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${salesOrderPdfFilename(String(order.order_number))}"`,
    },
  });
}
