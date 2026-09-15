import { z } from "zod";

export const hrEmployeeStatusSchema = z.enum([
  "INVITED",
  "ACTIVE",
  "SUSPENDED",
  "DISABLED",
  "INACTIVE",
]);

export const irgCategorySchema = z.enum(["STANDARD", "DISABLED_OR_RETIREE"]);

export const hrEmployeeUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  matricule: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .transform((v) => v.toUpperCase()),
  last_name: z.string().trim().min(1).max(100),
  first_name: z.string().trim().min(1).max(100),
  nss: z
    .string()
    .trim()
    .max(32)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  nin: z
    .string()
    .trim()
    .max(32)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  birth_date: z
    .union([
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      z.literal(""),
      z.null(),
    ])
    .optional()
    .transform((v) => (v ? v : null)),
  hired_at: z
    .union([
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      z.literal(""),
      z.null(),
    ])
    .optional()
    .transform((v) => (v ? v : null)),
  irg_category: irgCategorySchema.default("STANDARD"),
  status: hrEmployeeStatusSchema.default("ACTIVE"),
});

export const hrEmployeeIdSchema = z.object({
  id: z.string().uuid(),
});
