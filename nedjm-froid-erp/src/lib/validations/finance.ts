import { z } from "zod";

const uuid = z.string().uuid();
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => v || null);

export const financeAccountSchema = z.object({
  id: uuid.optional(),
  code: z.string().trim().min(1).max(40).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1).max(160),
  account_type: z.enum(["BANK", "CASH"]),
  site_id: uuid.nullable().optional(),
  currency_code: z.string().trim().length(3).transform((v) => v.toUpperCase()),
  bank_name: optionalText(160),
  account_number: optionalText(120),
  rib: optionalText(120),
  opening_balance: z.coerce.number(),
  opening_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  allow_negative: z.boolean().default(false),
  active: z.boolean().default(true),
  notes: optionalText(500),
});

export const financeTaxRateSchema = z.object({
  id: uuid.optional(),
  code: z.string().trim().min(1).max(32).transform((v) => v.toUpperCase()),
  label_fr: z.string().trim().min(1).max(120),
  rate: z.coerce.number().min(0).max(1),
  active: z.boolean().default(true),
  is_default: z.boolean().default(false),
  valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  valid_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export const financeMethodSchema = z.object({
  id: uuid.optional(),
  code: z.string().trim().min(1).max(32).transform((v) => v.toUpperCase()),
  label_fr: z.string().trim().min(1).max(120),
  account_scope: z.enum(["BANK", "CASH", "BOTH"]),
  legacy_contract_method: z
    .enum(["VIREMENT", "CHEQUE", "ESPECES", "AUTRE"])
    .nullable()
    .optional(),
  active: z.boolean().default(true),
  sort_order: z.coerce.number().int().default(0),
});

export const financeCategorySchema = z.object({
  id: uuid.optional(),
  code: z.string().trim().min(1).max(40).transform((v) => v.toUpperCase()),
  label_fr: z.string().trim().min(1).max(160),
  direction: z.enum(["IN", "OUT", "BOTH"]),
  account_scope: z.enum(["BANK", "CASH", "BOTH"]),
  active: z.boolean().default(true),
  sort_order: z.coerce.number().int().default(0),
});

export const financeMovementSchema = z.object({
  account_id: uuid,
  direction: z.enum(["IN", "OUT"]),
  amount: z.coerce.number().positive(),
  movement_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(1).max(500),
  category_id: uuid.nullable().optional(),
  payment_method_id: uuid.nullable().optional(),
  reference: optionalText(160),
  counterparty: optionalText(200),
});

export const financeTransferSchema = z.object({
  from_account_id: uuid,
  to_account_id: uuid,
  amount: z.coerce.number().positive(),
  movement_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(1).max(500),
  reference: optionalText(160),
});

export const financeReverseSchema = z.object({
  transaction_id: uuid,
  reversal_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(3).max(500),
});

export const financeReconcileSchema = z.object({
  transaction_id: uuid,
  reconciled: z.boolean(),
  reference: optionalText(160),
});

export const cashAdvanceSchema = z.object({
  cash_account_id: uuid,
  beneficiary_name: z.string().trim().min(1).max(200),
  beneficiary_employee_id: uuid.nullable().optional(),
  amount: z.coerce.number().positive(),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  purpose: z.string().trim().min(1).max(500),
});

export const cashAdvanceExpenseSchema = z.object({
  advance_id: uuid,
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category_id: uuid,
  amount: z.coerce.number().positive(),
  description: z.string().trim().min(1).max(500),
  receipt_reference: optionalText(160),
  attachment_url: z.string().trim().url().max(1000).nullable().optional(),
});

export const cashAdvanceSettleSchema = z.object({
  advance_id: uuid,
  return_amount: z.coerce.number().min(0),
  settlement_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: optionalText(500),
});

export const cashAdvanceCancelSchema = z.object({
  advance_id: uuid,
  cancellation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(3).max(500),
});

export const financeConfigDeleteSchema = z.object({
  entity: z.enum(["tax_rate", "payment_method", "category"]),
  id: uuid,
});

