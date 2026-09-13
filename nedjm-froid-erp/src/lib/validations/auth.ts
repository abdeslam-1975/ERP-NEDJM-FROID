import { z } from "zod";

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(8, "Mot de passe actuel trop court"),
    new_password: z
      .string()
      .min(8, "Nouveau mot de passe: 8 caractères minimum")
      .max(72, "Mot de passe trop long"),
    confirm_password: z.string().min(8, "Confirmation requise"),
  })
  .refine((v) => v.new_password === v.confirm_password, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirm_password"],
  })
  .refine((v) => v.new_password !== v.current_password, {
    message: "Le nouveau mot de passe doit être différent de l'actuel",
    path: ["new_password"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
