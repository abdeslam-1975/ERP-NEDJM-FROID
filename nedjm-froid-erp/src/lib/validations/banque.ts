import { z } from "zod";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => v || null);
const money = z.coerce.number().min(0);

export const banqueLineSchema = z
  .object({
    id: uuid.optional(),
    account_id: uuid,
    op_date: isoDate,
    affectation: z.string().trim().max(160).optional().default(""),
    libelle: z.string().trim().min(1).max(500),
    debit: money.default(0),
    credit: money.default(0),
    frais: money.default(0),
    bc_label: z.string().trim().max(200).optional().default(""),
    bc_url: optionalText(1_500_000),
    mode_label: z.string().trim().max(200).optional().default(""),
    mode_url: optionalText(1_500_000),
    fac_label: z.string().trim().max(200).optional().default(""),
    fac_url: optionalText(1_500_000),
    line_kind: z.enum(["MANUAL", "CAUTION", "VIREMENT", "IMPORT"]).default("MANUAL"),
    value_date: isoDate.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.debit > 0 && value.credit > 0) {
      ctx.addIssue({
        code: "custom",
        message: "Débit et crédit ne peuvent pas être saisis ensemble.",
        path: ["credit"],
      });
    }
    if (value.debit === 0 && value.credit === 0 && value.frais === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Saisissez un montant.",
        path: ["debit"],
      });
    }
  });

export const banqueVirementSchema = z
  .object({
    from_account_id: uuid,
    to_account_id: uuid,
    amount: z.coerce.number().positive(),
    op_date: isoDate,
  })
  .refine((v) => v.from_account_id !== v.to_account_id, {
    message: "Banques source et destination identiques.",
    path: ["to_account_id"],
  });

export const banqueRapprochementSchema = z.object({
  line_id: uuid,
  reconciled: z.boolean(),
  value_date: isoDate.optional(),
});

export const banqueImportSchema = z.object({
  account_id: uuid,
  rows: z
    .array(
      z.object({
        dateOp: isoDate,
        dateVal: isoDate.optional(),
        libelle: z.string().trim().min(1).max(500),
        debit: money.default(0),
        credit: money.default(0),
      }),
    )
    .min(1),
});

export const banqueListItemSchema = z.object({
  list_key: z.enum(["AFFECTATION", "FOURNISSEUR", "MODE"]),
  label: z.string().trim().min(1).max(160),
});

export const banqueAccountIdSchema = z.object({
  account_id: uuid.nullable().optional(),
});
