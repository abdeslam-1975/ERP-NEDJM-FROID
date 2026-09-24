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
  last_name: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .transform((v) => v.toLocaleUpperCase("fr-DZ")),
  first_name: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .transform((v) => v.toLocaleUpperCase("fr-DZ")),
  nss: z.preprocess(
    (v) => {
      if (v == null || v === "") return null;
      const d = String(v).replace(/\D/g, "").slice(0, 12);
      return d === "" ? null : d;
    },
    z
      .union([
        z.null(),
        z.string().length(12, { message: "N° NSS : exactement 12 chiffres." }),
      ])
      .optional(),
  ),
  nin: z.preprocess(
    (v) => {
      if (v == null || v === "") return null;
      const d = String(v).replace(/\D/g, "").slice(0, 18);
      return d === "" ? null : d;
    },
    z
      .union([
        z.null(),
        z.string().length(18, { message: "NIN : exactement 18 chiffres." }),
      ])
      .optional(),
  ),
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
  irg_category: z.preprocess(
    (v) => (v === "" || v == null ? "STANDARD" : v),
    irgCategorySchema,
  ),
  status: hrEmployeeStatusSchema.default("ACTIVE"),
});

export const hrEmployeeIdSchema = z.object({
  id: z.string().uuid(),
});
