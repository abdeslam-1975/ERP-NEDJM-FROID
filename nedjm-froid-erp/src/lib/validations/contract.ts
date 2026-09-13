import { z } from "zod";

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
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date début invalide"),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date fin invalide"),
    ods_date: z
      .union([
        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        z.literal(""),
        z.null(),
      ])
      .transform((v) => (v === "" || v == null ? null : v)),
    total_amount_ht: z.coerce.number().min(0),
    caution_rate: z.coerce.number().min(0).max(1),
    caution_amount: z.coerce.number().min(0),
    status: contractStatusSchema.default("BROUILLON"),
    attributes: z.record(z.string(), z.unknown()).default({}),
  })
  .refine((v) => v.end_date >= v.start_date, {
    message: "La date de fin doit être ≥ date de début",
    path: ["end_date"],
  });

export const contractItemSchema = z.object({
  contract_id: z.string().uuid(),
  item_type: z.enum(["LABOR", "SPARE_PART"]),
  item_code: z.string().trim().min(1).max(64),
  designation: z.string().trim().min(1).max(500),
  unit: z.string().trim().min(1).max(32).default("U"),
  quantity: z.coerce.number().min(0),
  unit_price_ht: z.coerce.number().min(0),
  total_price_ht: z.coerce.number().min(0),
  sort_order: z.coerce.number().int().default(0),
});

export type ContractUpsertInput = z.infer<typeof contractUpsertSchema>;
