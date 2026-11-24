import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.");
const money = z.coerce.number().min(0);
const rate = z.coerce.number().min(0).max(1);

export const salInvoiceLineSchema = z.object({
  item_code: z.string().trim().max(40).optional().default(""),
  designation: z.string().trim().min(1, "Désignation obligatoire.").max(500),
  unit: z.string().trim().max(20).optional().default(""),
  qty: z.coerce.number().min(0).default(0),
  unit_price_ht: money.default(0),
  pose_price_ht: money.default(0),
  source_invoice_ref: z.string().trim().max(80).optional().default(""),
  source_amount: money.default(0),
});

export const salInvoiceSaveSchema = z
  .object({
    id: z.string().uuid().optional(),
    doc_kind: z.enum(["P", "F", "FP", "SIT"], {
      message: "Type de facture non supporté (RG = phase M5).",
    }),
    number: z.string().trim().max(40).optional().default(""),
    issue_date: isoDate,
    client_id: z.string().uuid("Client obligatoire."),
    contract_id: z.string().uuid().nullable().optional(),
    client_name: z.string().trim().min(1, "Nom client obligatoire.").max(300),
    client_address: z.string().trim().max(500).optional().default(""),
    client_nif: z.string().trim().max(40).optional().default(""),
    client_article: z.string().trim().max(40).optional().default(""),
    client_rc: z.string().trim().max(40).optional().default(""),
    client_phone: z.string().trim().max(40).optional().default(""),
    contract_ref: z.string().trim().max(200).optional().default(""),
    period_label: z.string().trim().max(200).optional().default(""),
    established_by: z.string().trim().max(160).optional().default(""),
    expected_bank_label: z.string().trim().max(160).optional().default(""),
    tax_rate: rate.default(0),
    retention_rate: rate.default(0),
    stamp_amount: money.default(0),
    exo_attestation_no: z.string().trim().max(80).optional().default(""),
    exo_attestation_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional()
      .or(z.literal("").transform(() => null)),
    note: z.string().trim().max(500).optional().default(""),
    issue: z.boolean().default(false),
    lines: z.array(salInvoiceLineSchema).min(1, "Ajoutez au moins une ligne."),
  })
  .superRefine((value, ctx) => {
    if (value.doc_kind === "SIT") return;
    for (let i = 0; i < value.lines.length; i += 1) {
      if (!(value.lines[i].qty > 0)) {
        ctx.addIssue({
          code: "custom",
          message: `Ligne ${i + 1}: quantité obligatoire.`,
          path: ["lines", i, "qty"],
        });
      }
    }
  });

export type SalInvoiceSaveInput = z.infer<typeof salInvoiceSaveSchema>;

/** Encaissement interne Ventes — pas de lien Banque/Caisse/fin_transactions. */
export const salPaymentSchema = z.object({
  invoice_id: z.string().uuid("Facture invalide."),
  payment_date: isoDate,
  amount_ttc: z.coerce.number().positive("Montant invalide."),
  account_label: z.string().trim().max(160).optional().default(""),
  method_label: z.string().trim().max(80).optional().default(""),
  reference: z.string().trim().max(160).optional().default(""),
  note: z.string().trim().max(500).optional().default(""),
});

export type SalPaymentInput = z.infer<typeof salPaymentSchema>;

