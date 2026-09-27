import { z } from "zod";
import type { PenaltyRule } from "@/lib/contracts/attributes-schema";

export const EXTRACTION_TARGETS = [
  { value: "HEADER", label: "Montants et dates" },
  { value: "PENALTIES", label: "Pénalités" },
  { value: "TERMINATION", label: "Résiliation" },
  { value: "CLAUSES", label: "Autres clauses" },
] as const;

export type ExtractionTarget = (typeof EXTRACTION_TARGETS)[number]["value"];

export const extractionTargetSchema = z.enum(["HEADER", "PENALTIES", "TERMINATION", "CLAUSES"]);

export const HEADER_FIELDS = [
  { key: "start_date", label: "Date de début" },
  { key: "end_date", label: "Date de fin" },
  { key: "ods_date", label: "Date de l'ordre de service (ODS)" },
  { key: "total_amount_ht", label: "Montant total HT" },
  { key: "caution_rate", label: "Taux de caution" },
] as const;

export type HeaderKey = (typeof HEADER_FIELDS)[number]["key"];

const confidence = z.coerce.number().min(0).max(1).catch(0);
const optionalInt = z.coerce.number().int().min(0).nullable().catch(null);
const fraction = z.coerce.number().min(0).max(1).nullable().catch(null);
const shortText = (max: number) =>
  z
    .string()
    .nullable()
    .catch(null)
    .transform((value) => (value ? value.trim().slice(0, max) : null));

export const extractionSourceSchema = z.object({
  document: z.coerce.number().int().min(0).catch(0),
  page: z.coerce.number().int().min(1).nullable().catch(null),
  article: shortText(40),
  excerpt: z.string().catch("").transform((value) => value.trim().slice(0, 600)),
  confidence,
});

const headerFieldSchema = z
  .object({ value: z.string(), source: extractionSourceSchema })
  .nullable()
  .catch(null);

export const extractedPenaltySchema = z.object({
  preset_code: shortText(64),
  label: z.string().trim().min(1).max(200),
  mode: z.enum(["FIXED", "PCT_DAILY", "PCT_ITEM", "PROGRESSIVE"]),
  rate: fraction,
  fixed_amount: z.coerce.number().min(0).nullable().catch(null),
  grace_hours: optionalInt,
  grace_days: optionalInt,
  brackets: z
    .array(
      z.object({
        from_day: z.coerce.number().int().min(0),
        rate: z.coerce.number().min(0).max(1),
      }),
    )
    .catch([]),
  source: extractionSourceSchema,
});

export const extractedTerminationSchema = z.object({
  article_ref: shortText(40),
  notice_days: optionalInt,
  cure_days: optionalInt,
  client_convenience: z.boolean().nullable().catch(null),
  grounds: z.array(z.string().trim().min(1).max(300)).catch([]),
  financial_consequences: shortText(4000),
  caution_effect: z
    .enum(["NON_PRECISE", "RESTITUEE", "CONFISQUEE", "PARTIELLE"])
    .nullable()
    .catch(null),
  source: extractionSourceSchema,
});

export const extractedClauseSchema = z.object({
  category: z
    .enum([
      "RESILIATION",
      "FORCE_MAJEURE",
      "LITIGES",
      "ASSURANCE",
      "CONFIDENTIALITE",
      "REVISION_PRIX",
      "GARANTIE",
      "SOUS_TRAITANCE",
      "AUTRE",
    ])
    .catch("AUTRE"),
  article_ref: shortText(40),
  title: z.string().trim().min(1).max(200),
  content: z.string().catch("").transform((value) => value.trim().slice(0, 8000)),
  source: extractionSourceSchema,
});

/** Each list item is validated alone so one malformed proposal does not drop the others. */
function tolerantArray<T extends z.ZodTypeAny>(item: T) {
  return z
    .array(z.unknown())
    .catch([])
    .transform((rows) =>
      rows.flatMap((row) => {
        const parsed = item.safeParse(row);
        return parsed.success ? [parsed.data as z.infer<T>] : [];
      }),
    );
}

export const extractionResultSchema = z.object({
  header: z
    .object({
      start_date: headerFieldSchema,
      end_date: headerFieldSchema,
      ods_date: headerFieldSchema,
      total_amount_ht: headerFieldSchema,
      caution_rate: headerFieldSchema,
    })
    .nullable()
    .catch(null),
  penalties: tolerantArray(extractedPenaltySchema),
  penalty_cap: z
    .object({ rate: z.coerce.number().min(0).max(1), source: extractionSourceSchema })
    .nullable()
    .catch(null),
  termination: extractedTerminationSchema.nullable().catch(null),
  clauses: tolerantArray(extractedClauseSchema),
  warnings: z.array(z.string()).catch([]),
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;
export type ExtractionSource = z.infer<typeof extractionSourceSchema>;
export type ExtractedPenalty = z.infer<typeof extractedPenaltySchema>;
export type ExtractedClause = z.infer<typeof extractedClauseSchema>;

/** Keeps only the sections the user asked for. */
export function restrictToTargets(
  result: ExtractionResult,
  targets: readonly ExtractionTarget[],
): ExtractionResult {
  const has = (target: ExtractionTarget) => targets.includes(target);
  return {
    header: has("HEADER") ? result.header : null,
    penalties: has("PENALTIES") ? result.penalties : [],
    penalty_cap: has("PENALTIES") ? result.penalty_cap : null,
    termination: has("TERMINATION") ? result.termination : null,
    clauses: has("CLAUSES") ? result.clauses : [],
    warnings: result.warnings,
  };
}

const NULLABLE_STRING = { type: ["string", "null"] };
const NULLABLE_INT = { type: ["integer", "null"] };
const NULLABLE_NUMBER = { type: ["number", "null"] };

const SOURCE_JSON = {
  type: "object",
  properties: {
    document: { type: "integer", description: "Numéro du document fourni (1, 2, ...). 0 pour le texte collé." },
    page: { ...NULLABLE_INT, description: "Page dans ce document, si visible." },
    article: { ...NULLABLE_STRING, description: "Référence de l'article, ex. « Art. 25 »." },
    excerpt: { type: "string", description: "Citation exacte du passage, 300 caractères maximum." },
    confidence: { type: "number", description: "Confiance entre 0 et 1." },
  },
  required: ["document", "page", "article", "excerpt", "confidence"],
};

const HEADER_FIELD_JSON = {
  type: ["object", "null"],
  properties: { value: { type: "string" }, source: SOURCE_JSON },
  required: ["value", "source"],
};

export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    header: {
      type: ["object", "null"],
      properties: {
        start_date: HEADER_FIELD_JSON,
        end_date: HEADER_FIELD_JSON,
        ods_date: HEADER_FIELD_JSON,
        total_amount_ht: HEADER_FIELD_JSON,
        caution_rate: HEADER_FIELD_JSON,
      },
      required: ["start_date", "end_date", "ods_date", "total_amount_ht", "caution_rate"],
    },
    penalties: {
      type: "array",
      items: {
        type: "object",
        properties: {
          preset_code: NULLABLE_STRING,
          label: { type: "string" },
          mode: { type: "string", enum: ["FIXED", "PCT_DAILY", "PCT_ITEM", "PROGRESSIVE"] },
          rate: NULLABLE_NUMBER,
          fixed_amount: NULLABLE_NUMBER,
          grace_hours: NULLABLE_INT,
          grace_days: NULLABLE_INT,
          brackets: {
            type: "array",
            items: {
              type: "object",
              properties: { from_day: { type: "integer" }, rate: { type: "number" } },
              required: ["from_day", "rate"],
            },
          },
          source: SOURCE_JSON,
        },
        required: [
          "preset_code",
          "label",
          "mode",
          "rate",
          "fixed_amount",
          "grace_hours",
          "grace_days",
          "brackets",
          "source",
        ],
      },
    },
    penalty_cap: {
      type: ["object", "null"],
      properties: { rate: { type: "number" }, source: SOURCE_JSON },
      required: ["rate", "source"],
    },
    termination: {
      type: ["object", "null"],
      properties: {
        article_ref: NULLABLE_STRING,
        notice_days: NULLABLE_INT,
        cure_days: NULLABLE_INT,
        client_convenience: { type: ["boolean", "null"] },
        grounds: { type: "array", items: { type: "string" } },
        financial_consequences: NULLABLE_STRING,
        caution_effect: {
          type: ["string", "null"],
          description: "RESTITUEE, CONFISQUEE, PARTIELLE, NON_PRECISE ou null.",
        },
        source: SOURCE_JSON,
      },
      required: [
        "article_ref",
        "notice_days",
        "cure_days",
        "client_convenience",
        "grounds",
        "financial_consequences",
        "caution_effect",
        "source",
      ],
    },
    clauses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: [
              "RESILIATION",
              "FORCE_MAJEURE",
              "LITIGES",
              "ASSURANCE",
              "CONFIDENTIALITE",
              "REVISION_PRIX",
              "GARANTIE",
              "SOUS_TRAITANCE",
              "AUTRE",
            ],
          },
          article_ref: NULLABLE_STRING,
          title: { type: "string" },
          content: { type: "string" },
          source: SOURCE_JSON,
        },
        required: ["category", "article_ref", "title", "content", "source"],
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["header", "penalties", "penalty_cap", "termination", "clauses", "warnings"],
};

const TARGET_INSTRUCTIONS: Record<ExtractionTarget, string> = {
  HEADER:
    "header : date de début, date de fin, date de l'ordre de service (ODS), montant total HT et taux de caution. Dates au format AAAA-MM-JJ. Montant en chiffres sans séparateur de milliers ni devise (ex. 281195650.00). Taux de caution en fraction (5 % → 0.05).",
  PENALTIES:
    "penalties : chaque pénalité distincte. mode = PCT_DAILY si exprimée en % du montant ou taux journalier, PCT_ITEM si en % de la valeur d'un article ou d'une pièce, FIXED si montant fixe en DA (fixed_amount), PROGRESSIVE si le taux change selon le nombre de jours (brackets : from_day et rate). rate en fraction (10 % → 0.1). Délai de grâce en heures (grace_hours) ou en jours (grace_days) selon le texte. penalty_cap : plafond global des pénalités en fraction du montant du contrat.",
  TERMINATION:
    "termination : article, préavis en jours (notice_days), délai de mise en demeure en jours (cure_days), client_convenience = true si le client peut résilier sans faute du prestataire, motifs (grounds), conséquences financières, effet sur la caution (RESTITUEE, CONFISQUEE, PARTIELLE ou NON_PRECISE).",
  CLAUSES:
    "clauses : autres clauses (force majeure, litiges, assurances, confidentialité, révision des prix, garantie, sous-traitance, autre) avec un intitulé court et un résumé fidèle du contenu.",
};

export function buildExtractionPrompt(input: {
  targets: readonly ExtractionTarget[];
  documentLabels: string[];
  presets: Pick<PenaltyRule, "code" | "label" | "mode">[];
  hasPastedText: boolean;
}): string {
  const docs = input.documentLabels.length
    ? input.documentLabels.map((label, i) => `Document ${i + 1} : ${label}`).join("\n")
    : "Aucun fichier.";
  const presets = input.presets.length
    ? input.presets.map((p) => `- ${p.code} : ${p.label} (${p.mode})`).join("\n")
    : "- aucune";
  return [
    "Tu analyses des extraits d'un contrat de prestation de service (maintenance) en Algérie, rédigés en français ou en arabe.",
    "Règles strictes :",
    "1. N'extrais que ce qui est écrit dans les documents fournis. N'invente jamais une valeur. Si une information est absente, mets null ou une liste vide.",
    "2. Pour chaque valeur, indique la source : numéro du document, page si visible, article, citation exacte du passage (300 caractères maximum) et une confiance entre 0 et 1.",
    "3. Si un passage est illisible ou ambigu, baisse la confiance et explique-le dans warnings (en français).",
    "4. Ne remplis que les sections demandées ci-dessous. Les autres sections restent null ou vides.",
    "",
    "Sections demandées :",
    ...input.targets.map((target) => `- ${TARGET_INSTRUCTIONS[target]}`),
    "",
    "Pénalités déjà définies dans l'ERP. Si une pénalité du texte correspond à l'une d'elles, mets son code dans preset_code, sinon preset_code = null :",
    presets,
    "",
    "Documents fournis :",
    docs,
    input.hasPastedText ? "Un texte collé par l'utilisateur est aussi fourni (document 0)." : "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}
