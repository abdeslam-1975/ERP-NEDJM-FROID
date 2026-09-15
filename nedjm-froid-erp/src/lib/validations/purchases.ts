import { z } from "zod";

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nullableDate = date.nullable().optional();
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((value) => value || null);

export const supplierSchema = z.object({
  id: uuid.optional(),
  code: z.string().trim().min(1).max(40).transform((value) => value.toUpperCase()),
  legal_name: z.string().trim().min(1).max(200),
  trade_name: optionalText(200),
  nif: optionalText(80),
  nis: optionalText(80),
  rc: optionalText(80),
  ai: optionalText(80),
  address: optionalText(500),
  city: optionalText(120),
  phone: optionalText(80),
  email: z.string().trim().email().max(200).or(z.literal("")).transform((value) => value || null),
  contact_name: optionalText(160),
  payment_terms_days: z.coerce.number().int().min(0).max(3650).default(0),
  bank_details: optionalText(1000),
  active: z.boolean().default(true),
  notes: optionalText(1000),
});

export const situationTypeSchema = z
  .object({
    id: uuid.optional(),
    code: z.string().trim().min(1).max(40).transform((value) => value.toUpperCase()),
    label_fr: z.string().trim().min(1).max(160),
    label_ar: optionalText(160),
    includes_supply: z.boolean().default(false),
    includes_installation: z.boolean().default(false),
    active: z.boolean().default(true),
    sort_order: z.coerce.number().int().default(0),
  })
  .refine((value) => value.includes_supply || value.includes_installation, {
    message: "Le type doit inclure fourniture et/ou pose.",
  });

const bracketSchema = z.object({
  from: z.coerce.number().min(0),
  to: z.coerce.number().min(0).nullable(),
  amount: z.coerce.number().min(0),
});

export const stampRuleSchema = z
  .object({
    id: uuid.optional(),
    code: z.string().trim().min(1).max(40).transform((value) => value.toUpperCase()),
    label_fr: z.string().trim().min(1).max(160),
    calculation_mode: z.enum(["FIXED", "PERCENT", "BRACKETS"]),
    calculation_base: z.enum(["HT", "TVA", "TTC"]),
    fixed_amount: z.coerce.number().min(0).nullable().optional(),
    rate: z.coerce.number().min(0).max(1).nullable().optional(),
    brackets: z.array(bracketSchema).default([]),
    payment_method_id: uuid.nullable().optional(),
    valid_from: nullableDate,
    valid_to: nullableDate,
    priority: z.coerce.number().int().default(100),
    active: z.boolean().default(true),
    legal_reference: optionalText(500),
  })
  .superRefine((value, ctx) => {
    if (value.calculation_mode === "FIXED" && value.fixed_amount == null) {
      ctx.addIssue({ code: "custom", message: "Montant fixe requis.", path: ["fixed_amount"] });
    }
    if (value.calculation_mode === "PERCENT" && value.rate == null) {
      ctx.addIssue({ code: "custom", message: "Taux requis.", path: ["rate"] });
    }
    if (value.calculation_mode === "BRACKETS" && value.brackets.length === 0) {
      ctx.addIssue({ code: "custom", message: "Au moins une tranche est requise.", path: ["brackets"] });
    }
  });

export const numberSequenceSchema = z.object({
  document_type: z.enum(["PROFORMA", "ORDER", "RECEIPT", "SUPPLIER_INVOICE"]),
  prefix: z.string().trim().min(1).max(20).transform((value) => value.toUpperCase()),
  padding: z.coerce.number().int().min(2).max(10),
  include_year: z.boolean(),
  next_value: z.coerce.number().int().positive(),
});

export const documentProfileSchema = z.object({
  id: uuid.optional(),
  code: z.string().trim().min(1).max(40).transform((value) => value.toUpperCase()),
  label_fr: z.string().trim().min(1).max(160),
  legal_name: z.string().trim().min(1).max(200),
  address: optionalText(500),
  city: optionalText(120),
  phone: optionalText(80),
  email: z.string().trim().email().max(200).or(z.literal("")).transform((value) => value || null),
  nif: optionalText(80),
  nis: optionalText(80),
  rc: optionalText(80),
  ai: optionalText(80),
  capital: optionalText(120),
  bank_details: optionalText(1000),
  footer: optionalText(1000),
  active: z.boolean().default(true),
  is_default: z.boolean().default(false),
});

export const purchasingLineSchema = z
  .object({
    item_code: z.string().trim().min(1).max(80).transform((value) => value.toUpperCase()),
    designation: z.string().trim().min(1).max(500),
    unit: z.string().trim().min(1).max(32).transform((value) => value.toUpperCase()),
    quantity: z.coerce.number().positive(),
    supply_unit_price_ht: z.coerce.number().min(0),
    installation_unit_price_ht: z.coerce.number().min(0),
    tax_rate_id: uuid.nullable().optional(),
    situation_type_id: uuid.nullable().optional(),
  })
  .refine(
    (value) => value.supply_unit_price_ht > 0 || value.installation_unit_price_ht > 0,
    { message: "Un prix fourniture ou pose est requis." },
  );

export const proformaSchema = z.object({
  supplier_id: uuid,
  site_id: uuid.nullable().optional(),
  proforma_number: z.string().trim().max(80).default(""),
  supplier_reference: optionalText(120),
  proforma_date: date,
  validity_date: nullableDate,
  currency_code: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  delivery_terms: optionalText(500),
  payment_terms: optionalText(500),
  attachment_url: z.string().trim().url().max(1000).or(z.literal("")).transform((value) => value || null),
  note: optionalText(1000),
  lines: z.array(purchasingLineSchema).min(1),
});

export const proformaStatusSchema = z.object({
  proforma_id: uuid,
  status: z.enum(["APPROVED", "CANCELLED"]),
});

export const orderFromProformaSchema = z.object({
  proforma_id: uuid,
  order_number: z.string().trim().max(80).default(""),
  order_date: date,
  expected_delivery_date: nullableDate,
  delivery_address: optionalText(500),
  document_profile_id: uuid.nullable().optional(),
  note: optionalText(1000),
});

export const receiptSchema = z.object({
  order_id: uuid,
  receipt_number: z.string().trim().max(80).default(""),
  receipt_date: date,
  delivery_note_number: optionalText(120),
  received_by_name: optionalText(160),
  note: optionalText(1000),
  lines: z
    .array(
      z
        .object({
          order_line_id: uuid,
          quantity: z.coerce.number().positive(),
          accepted_quantity: z.coerce.number().min(0),
          note: optionalText(500),
        })
        .refine((value) => value.accepted_quantity <= value.quantity, {
          message: "La quantité acceptée dépasse la quantité reçue.",
        }),
    )
    .min(1),
});

export const supplierInvoiceSchema = z.object({
  order_id: uuid,
  internal_number: z.string().trim().max(80).default(""),
  supplier_invoice_number: z.string().trim().min(1).max(120),
  invoice_date: date,
  due_date: nullableDate,
  retention_rate: z.coerce.number().min(0).max(1).default(0),
  retention_due_date: nullableDate,
  stamp_rule_id: uuid.nullable().optional(),
  receipt_ids: z.array(uuid).default([]),
  attachment_url: z.string().trim().url().max(1000).or(z.literal("")).transform((value) => value || null),
  note: optionalText(1000),
  lines: z
    .array(z.object({ order_line_id: uuid, quantity: z.coerce.number().positive() }))
    .min(1),
});

export const supplierPaymentSchema = z.object({
  invoice_id: uuid,
  account_id: uuid,
  payment_method_id: uuid,
  amount: z.coerce.number().positive(),
  payment_date: date,
  reference: optionalText(160),
  note: optionalText(500),
});

export const supplierPaymentReverseSchema = z.object({
  payment_id: uuid,
  reversal_date: date,
  reason: z.string().trim().min(3).max(500),
});

export const idSchema = uuid;
