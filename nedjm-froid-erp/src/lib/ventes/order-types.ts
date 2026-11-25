export type SalOrderStatus = "BROUILLON" | "EMIS" | "ANNULE";

export type VentesOrderLine = {
  id: string;
  lineNo: number;
  itemCode: string;
  designation: string;
  unit: string;
  qty: number;
  unitPriceHt: number;
  posePriceHt: number;
};

export type VentesOrder = {
  id: string;
  orderNumber: string;
  orderDate: string;
  clientId: string;
  contractId: string;
  clientName: string;
  clientAddress: string;
  nif: string;
  article: string;
  rc: string;
  phone: string;
  contractRef: string;
  paymentTerms: string;
  deliveryDelay: string;
  buyerName: string;
  establishedBy: string;
  hasPose: boolean;
  taxRate: number;
  discountAmount: number;
  retentionRate: number;
  stampAmount: number;
  note: string;
  lines: VentesOrderLine[];
  status: SalOrderStatus;
  persisted: boolean;
};

export type SalOrderRow = {
  id: string;
  order_number: string;
  fiscal_year: number;
  order_date: string;
  client_id: string;
  contract_id: string | null;
  client_name: string;
  client_address: string | null;
  client_nif: string | null;
  client_article: string | null;
  client_rc: string | null;
  client_phone: string | null;
  contract_ref: string | null;
  payment_terms: string | null;
  delivery_delay: string | null;
  buyer_name: string | null;
  established_by: string | null;
  has_pose: boolean;
  tax_rate: number;
  discount_amount: number;
  retention_rate: number;
  retention_amount: number;
  stamp_amount: number;
  total_ht: number;
  total_ht_net: number;
  total_tva: number;
  total_ttc: number;
  net_payable: number;
  amount_in_words: string | null;
  note: string | null;
  status: SalOrderStatus;
  issued_at: string | null;
  cancelled_at: string | null;
  created_at: string;
};

export type SalOrderLineRow = {
  id: string;
  order_id: string;
  line_no: number;
  item_code: string | null;
  designation: string;
  unit: string | null;
  qty: number;
  unit_price_ht: number;
  pose_price_ht: number;
  line_ht: number;
  line_tax_rate: number;
};

export function emptyOrderLine(lineNo: number): VentesOrderLine {
  return {
    id: `new-${Date.now()}-${lineNo}`,
    lineNo,
    itemCode: "",
    designation: "",
    unit: "U",
    qty: 1,
    unitPriceHt: 0,
    posePriceHt: 0,
  };
}

export function emptyOrder(today: string): VentesOrder {
  return {
    id: `draft-${Date.now()}`,
    orderNumber: "",
    orderDate: today,
    clientId: "",
    contractId: "",
    clientName: "",
    clientAddress: "",
    nif: "",
    article: "",
    rc: "",
    phone: "",
    contractRef: "",
    paymentTerms: "",
    deliveryDelay: "",
    buyerName: "",
    establishedBy: "",
    hasPose: false,
    taxRate: 0.19,
    discountAmount: 0,
    retentionRate: 0,
    stampAmount: 0,
    note: "",
    lines: [emptyOrderLine(1)],
    status: "BROUILLON",
    persisted: false,
  };
}
