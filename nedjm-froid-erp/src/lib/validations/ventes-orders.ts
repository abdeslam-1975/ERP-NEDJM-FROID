import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.");
const money = z.coerce.number().min(0);
const rate = z.coerce.number().min(0).max(1);

export const salOrderLineSchema = z.object({
  item_code: z.string().trim().max(40).optional().default(""),
  designation: z.string().trim().min(1, "Désignation obligatoire.").max(500),
  unit: z.string().trim().max(20).optional().default("U"),
  qty: z.coerce.number().positive("Quantité obligatoire."),
  unit_price_ht: money.default(0),
  pose_price_ht: money.default(0),
});

export const salOrderSaveSchema = z.object({
  id: z.string().uuid().optional(),
  order_number: z.string().trim().max(40).optional().default(""),
  order_date: isoDate,
  client_id: z.string().uuid("Client obligatoire."),
  contract_id: z.string().uuid().nullable().optional(),
  client_name: z.string().trim().min(1, "Nom client obligatoire.").max(300),
  client_address: z.string().trim().max(500).optional().default(""),
  client_nif: z.string().trim().max(40).optional().default(""),
  client_article: z.string().trim().max(40).optional().default(""),
  client_rc: z.string().trim().max(40).optional().default(""),
  client_phone: z.string().trim().max(40).optional().default(""),
  contract_ref: z.string().trim().max(200).optional().default(""),
  payment_terms: z.string().trim().max(200).optional().default(""),
  delivery_delay: z.string().trim().max(200).optional().default(""),
  buyer_name: z.string().trim().max(160).optional().default(""),
  established_by: z.string().trim().max(160).optional().default(""),
  has_pose: z.boolean().default(false),
  tax_rate: rate.default(0.19),
  discount_amount: money.default(0),
  retention_rate: rate.default(0),
  stamp_amount: money.default(0),
  note: z.string().trim().max(500).optional().default(""),
  issue: z.boolean().default(false),
  lines: z.array(salOrderLineSchema).min(1, "Ajoutez au moins une ligne."),
});

export type SalOrderSaveInput = z.infer<typeof salOrderSaveSchema>;
