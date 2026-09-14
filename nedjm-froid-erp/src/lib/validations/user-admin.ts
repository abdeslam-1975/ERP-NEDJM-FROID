import { z } from "zod";

export const provisionUserSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, "Nom complet requis")
    .max(120),
  email: z.string().trim().email("E-mail invalide").transform((v) => v.toLowerCase()),
  password: z
    .string()
    .min(8, "Mot de passe: 8 caractères minimum")
    .max(72),
  role_id: z.string().uuid("Rôle invalide"),
  site_id: z
    .union([z.string().uuid(), z.literal(""), z.null()])
    .transform((v) => (v === "" || v == null ? null : v)),
});

export const resetPasswordSchema = z.object({
  user_id: z.string().uuid(),
  password: z.string().min(8).max(72),
});

export const setUserStatusSchema = z.object({
  user_id: z.string().uuid(),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
});

export type ProvisionUserInput = z.infer<typeof provisionUserSchema>;
