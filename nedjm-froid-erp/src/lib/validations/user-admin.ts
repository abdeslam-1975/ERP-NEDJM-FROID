import { z } from "zod";

const fullName = z.string().trim().min(2, "Nom complet requis").max(120);

const siteId = z
  .union([z.string().uuid(), z.literal(""), z.null()])
  .transform((v) => (v === "" || v == null ? null : v));

export const provisionUserSchema = z.object({
  full_name: fullName,
  email: z.string().trim().email("E-mail invalide").transform((v) => v.toLowerCase()),
  password: z
    .string()
    .min(8, "Mot de passe: 8 caractères minimum")
    .max(72),
  role_id: z.string().uuid("Rôle invalide"),
  site_id: siteId,
});

export const updateUserProfileSchema = z.object({
  user_id: z.string().uuid(),
  full_name: fullName,
  phone: z
    .string()
    .trim()
    .max(40)
    .nullish()
    .transform((v) => (v ? v : null)),
});

export const assignUserRoleSchema = z.object({
  user_id: z.string().uuid(),
  role_id: z.string().uuid("Rôle invalide"),
  site_id: siteId,
});

export const removeUserRoleSchema = z.object({
  assignment_id: z.string().uuid(),
});

export const resetPasswordSchema = z.object({
  user_id: z.string().uuid(),
  password: z.string().min(8).max(72),
});

export const setUserStatusSchema = z.object({
  user_id: z.string().uuid(),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
});

export const deleteUserSchema = z.object({
  user_id: z.string().uuid(),
});

export type ProvisionUserInput = z.infer<typeof provisionUserSchema>;
