import { z } from "zod";
import {
  cautionSyncSchema,
  contractAttributesSchema,
  contreLineSchema,
  penaltyRuleSchema,
  totalModeSchema,
} from "@/lib/contracts/attributes-schema";

export const contractStatusSchema = z.enum([
  "BROUILLON",
  "VALIDE",
  "EN_COURS",
  "CLOTURE",
  "ANNULE",
]);

export const contractUpsertSchema = z
  .object({
    id: z.string().uuid().optional(),
    contract_number: z.string().trim().min(2).max(80),
    client_name: z.string().trim().min(2).max(200),
    site_id: z.string().uuid("Site invalide"),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    ods_date: z
      .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()])
      .transform((v) => (v === "" || v == null ? null : v)),
    total_amount_ht: z.coerce.number().min(0),
    caution_rate: z.coerce.number().min(0).max(1),
    caution_amount: z.coerce.number().min(0),
    status: contractStatusSchema.default("BROUILLON"),
    total_mode: totalModeSchema.default("AUTO"),
    caution_sync: cautionSyncSchema.default("FROM_RATE"),
    tva_exempt: z.boolean().default(false),
    tva_articles: z.string().default("12,16"),
    tva_standard_rate: z.coerce.number().min(0).max(1).default(0.19),
    attributes_patch: contractAttributesSchema.partial().optional(),
  })
  .refine((v) => v.end_date >= v.start_date, {
    message: "La date de fin doit être ≥ date de début",
    path: ["end_date"],
  });

export const contractItemSchema = z.object({
  id: z.string().uuid().optional(),
  contract_id: z.string().uuid(),
  item_type: z.enum(["LABOR", "SPARE_PART"]),
  item_code: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .transform((v) => v.toUpperCase()),
  designation: z.string().trim().min(1).max(500),
  unit: z.string().trim().min(1).max(32).default("U"),
  quantity: z.coerce.number().min(0),
  unit_price_ht: z.coerce.number().min(0),
  sort_order: z.coerce.number().int().default(0),
});

export const contractItemDeleteSchema = z.object({
  id: z.string().uuid(),
  contract_id: z.string().uuid(),
});

export const canvaImportSchema = z.object({
  contract_id: z.string().uuid(),
  labor: z.array(
    z.object({
      item_code: z.string().min(1),
      designation: z.string().min(1),
      unit: z.string().default("JOUR"),
      quantity: z.coerce.number().min(0),
      unit_price_ht: z.coerce.number().min(0),
      total_price_ht: z.coerce.number().min(0).optional(),
    }),
  ),
  spares: z.array(
    z.object({
      item_code: z.string().min(1),
      designation: z.string().min(1),
      unit: z.string().default("U"),
      quantity: z.coerce.number().min(0),
      unit_price_ht: z.coerce.number().min(0),
      total_price_ht: z.coerce.number().min(0).optional(),
    }),
  ),
});

export const attributesReplaceSchema = z.object({
  contract_id: z.string().uuid(),
  attributes: contractAttributesSchema,
});

export const consumptionPostSchema = z.object({
  contract_id: z.string().uuid(),
  contract_item_id: z.string().uuid(),
  direction: z.enum(["CONSUME", "REVERSE"]),
  quantity: z.coerce.number().positive(),
  movement_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  note: z.string().trim().max(500).optional(),
});

export const invoiceDraftSchema = z.object({
  contract_id: z.string().uuid(),
  invoice_number: z.string().trim().min(2).max(80),
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(500).optional(),
  lines: z
    .array(
      z.object({
        contract_item_id: z.string().uuid(),
        quantity: z.coerce.number().positive(),
      }),
    )
    .min(1),
});

export const invoiceIdSchema = z.object({
  invoice_id: z.string().uuid(),
  contract_id: z.string().uuid(),
});

export const paymentPostSchema = z.object({
  contract_id: z.string().uuid(),
  amount_ht: z.coerce.number().positive(),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  method: z.enum(["VIREMENT", "CHEQUE", "ESPECES", "AUTRE"]).default("VIREMENT"),
  invoice_id: z.string().uuid().optional().nullable(),
  reference: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
});

export const penaltyApplySchema = z.object({
  contract_id: z.string().uuid(),
  rule_code: z.string().trim().min(1).max(64),
  rule_label: z.string().trim().min(1).max(200),
  amount_ht: z.coerce.number().min(0),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().trim().max(500).optional(),
});

export const contractCloseSchema = z.object({
  contract_id: z.string().uuid(),
  force: z.boolean().default(false),
});

export { contreLineSchema, penaltyRuleSchema, contractAttributesSchema };
