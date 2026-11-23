/** Shapes aligned with sal_* tables (M1 schema). */

export type SalInvoiceStatus = "BROUILLON" | "EMISE" | "ANNULEE";

export type SalDocKindCode = "P" | "F" | "FP" | "RG" | "SIT";

export type SalInvoiceSource = "MANUAL" | "CONTRACT" | "IMPORT_EXCEL";

export type SalTaxMode = "TAXABLE" | "EXEMPT" | "MIXED";

export type SalDocKindRow = {
  code: SalDocKindCode | string;
  label_fr: string;
  label_ar: string | null;
  has_pose: boolean;
  is_rg_release: boolean;
  is_free_amount: boolean;
  active: boolean;
  sort_order: number;
};

export type SalInvoiceRow = {
  id: string;
  doc_kind: string;
  number: string;
  fiscal_year: number;
  issue_date: string;
  client_id: string;
  contract_id: string | null;
  client_name: string;
  client_address: string | null;
  client_nif: string | null;
  client_article: string | null;
  client_rc: string | null;
  client_phone: string | null;
  contract_ref: string | null;
  period_label: string | null;
  established_by: string | null;
  expected_bank_label: string | null;
  situation_type_id: string | null;
  tax_mode: SalTaxMode;
  tax_rate: number;
  exo_attestation_no: string | null;
  exo_attestation_date: string | null;
  currency: string;
  status: SalInvoiceStatus;
  total_ht: number;
  total_tva: number;
  retention_rate: number;
  retention_amount: number;
  stamp_rule_id: string | null;
  stamp_amount: number;
  net_payable: number;
  note: string | null;
  source: SalInvoiceSource;
  import_batch_id: string | null;
  issued_at: string | null;
  cancelled_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SalInvoiceLineRow = {
  id: string;
  invoice_id: string;
  line_no: number;
  item_code: string | null;
  designation: string;
  unit: string | null;
  qty: number;
  unit_price_ht: number;
  pose_price_ht: number;
  line_ht: number;
  tax_rate_id: string | null;
  source_invoice_ref: string | null;
  source_invoice_id: string | null;
  source_amount: number;
  created_at: string;
};

export type SalInvoicePaymentRow = {
  id: string;
  invoice_id: string;
  payment_date: string;
  account_id: string | null;
  payment_method_id: string | null;
  amount_ht: number;
  amount_tva: number;
  amount_ttc: number;
  direction: 1 | -1;
  financial_transaction_id: string | null;
  bank_line_id: string | null;
  reference: string | null;
  note: string | null;
  reversal_of: string | null;
  created_by: string | null;
  created_at: string;
};

export type SalesRegisterRow = {
  source: "SAL" | "CONTRACT";
  id: string;
  invoice_number: string;
  issue_date: string;
  doc_kind: string;
  status: string;
  client_id: string | null;
  client_name: string;
  contract_id: string | null;
  contract_ref: string | null;
  period_label: string | null;
  expected_bank_label: string | null;
  total_ht: number;
  total_tva: number;
  retention_amount: number;
  stamp_amount: number;
  net_payable: number;
  paid_ttc: number;
  due_ttc: number;
  last_payment_date: string | null;
  exo_attestation_no: string | null;
  fiscal_year: number;
  created_at: string;
};
