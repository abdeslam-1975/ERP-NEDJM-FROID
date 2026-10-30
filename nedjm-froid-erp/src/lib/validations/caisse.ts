import { z } from "zod";

export const CAISSE_DEFAULT_OPENING_DATE = "2025-12-31";
export const CAISSE_DEFAULT_BOX_CODE = "PRINCIPALE";

const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.");

export const caisseOpeningDateSchema = dateText;

export const caisseBuyerSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Code requis.")
    .max(40)
    .transform((value) => value.toUpperCase()),
  fullName: z.string().trim().min(1, "Nom requis.").max(200),
});

export const caisseOpeningsSaveSchema = z.object({
  boxId: z.string().uuid(),
  openingDate: dateText,
  buyers: z
    .array(
      z.object({
        buyerId: z.string().uuid(),
        amount: z.number().finite().min(0).max(999_999_999_999.99),
      }),
    )
    .max(500),
});
