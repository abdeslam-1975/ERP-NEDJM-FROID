import { z } from "zod";

export const AI_SUGGESTION_KINDS = ["LEGAL_VAR", "CNAS_RATES", "IRG_ZONE_SCOPE", "IRG_BAREME"] as const;
export type AiSuggestionKind = (typeof AI_SUGGESTION_KINDS)[number];

export const AI_CONFIDENCES = ["HIGH", "MEDIUM", "LOW"] as const;
export type AiConfidence = (typeof AI_CONFIDENCES)[number];

export const AI_ISSUE_KINDS = ["OCR", "AMBIGUITY", "MISSING", "OTHER"] as const;
export type AiIssueKind = (typeof AI_ISSUE_KINDS)[number];

/** Mirrors ref_legal_doc_ai_path. */
export const AI_PATHS = [
  "NOT_ACTIVE",
  "MANUAL",
  "TYPE_EXCLUDED",
  "AI_ALLOWED",
  "D15_PENDING",
  "D15_UNDECIDED",
  "D15_MANUAL",
  "D15_AI",
] as const;
export type AiPath = (typeof AI_PATHS)[number];

/** Mirrors ref_legal_doc_ai_type_allowed: official published texts only. */
export const AI_OFFICIAL_TYPES = [
  "LOI_FINANCES",
  "LOI_FINANCES_COMPL",
  "LOI",
  "ORDONNANCE",
  "DECRET_PRESIDENTIEL",
  "DECRET_EXECUTIF",
  "ARRETE",
  "DECISION",
  "CIRCULAIRE",
  "INSTRUCTION",
] as const;

export const isAiTypeAllowed = (docType: string) => (AI_OFFICIAL_TYPES as readonly string[]).includes(docType);

const AI_PATH_LABELS: Record<AiPath, string> = {
  NOT_ACTIVE: "Version retirée ou corrigée : seule la version en vigueur peut être analysée.",
  MANUAL: "Application entièrement antérieure à 2026 : saisie manuelle.",
  TYPE_EXCLUDED: "Convention, note interne ou autre texte : jamais envoyé à l'IA, saisie manuelle.",
  AI_ALLOWED: "Application à partir de 2026 : extraction IA possible.",
  D15_PENDING: "À cheval sur 2025 et 2026 : décision D15 en attente.",
  D15_UNDECIDED: "À cheval sur 2025 et 2026 : décision D15 à demander avant toute analyse.",
  D15_MANUAL: "Décision D15 : saisie manuelle.",
  D15_AI: "Décision D15 : extraction IA possible.",
};

export const aiPathLabel = (v: string) => AI_PATH_LABELS[v as AiPath] ?? v;
export const aiPathCanAnalyze = (v: string | null | undefined) => v === "AI_ALLOWED" || v === "D15_AI";
export const aiPathTone = (v: string | null | undefined): "success" | "warning" | "neutral" =>
  aiPathCanAnalyze(v) ? "success" : v === "D15_UNDECIDED" || v === "D15_PENDING" ? "warning" : "neutral";

export const AI_KIND_LABEL: Record<AiSuggestionKind, string> = {
  LEGAL_VAR: "Variable légale",
  CNAS_RATES: "Taux d'un régime CNAS",
  IRG_ZONE_SCOPE: "Wilayas d'une zone IRG",
  IRG_BAREME: "Barème IRG (lecture seule)",
};

export const AI_CONFIDENCE_LABEL: Record<AiConfidence, string> = {
  HIGH: "Confiance élevée",
  MEDIUM: "Confiance moyenne",
  LOW: "Confiance faible",
};

export const aiConfidenceTone = (c: AiConfidence): "success" | "warning" | "danger" =>
  c === "HIGH" ? "success" : c === "MEDIUM" ? "warning" : "danger";

export const AI_ISSUE_LABEL: Record<AiIssueKind, string> = {
  OCR: "Lecture (OCR)",
  AMBIGUITY: "Ambiguïté",
  MISSING: "Information manquante",
  OTHER: "Autre",
};

export const PERSONAL_DATA_CONFIRMATION =
  "Je confirme que ce document est un texte officiel publié et ne contient aucune donnée personnelle (nom, NIN, salaire, adresse d'un salarié…).";

export const AI_NOTICE =
  "L'analyse prépare des suggestions, jamais des règles : chaque suggestion est relue avec son extrait, corrigée si besoin, puis transformée en proposition par un humain. La proposition suit l'approbation habituelle et la décision D2 ; rien ne change sur la paie avant.";

// ---------------------------------------------------------------------------
// Excerpt check — mirrors ref_ai_normalize_text, ref_ai_excerpt_numbers, ref_ai_fold, ref_ai_payload_in_excerpt
// ---------------------------------------------------------------------------
const DIGIT_MAP: Record<string, string> = {};
for (let i = 0; i < 10; i++) {
  DIGIT_MAP[String.fromCharCode(0x0660 + i)] = String(i);
  DIGIT_MAP[String.fromCharCode(0x06f0 + i)] = String(i);
}
DIGIT_MAP["\u066B"] = ",";
DIGIT_MAP["\u066C"] = " ";
DIGIT_MAP["\u00A0"] = " ";
DIGIT_MAP["\u202F"] = " ";
DIGIT_MAP["\u2009"] = " ";

export function normalizeExcerpt(text: string | null | undefined): string {
  return Array.from(text ?? "", (ch) => DIGIT_MAP[ch] ?? ch).join("");
}

const NUMBER_TOKEN = /[0-9]{1,3}(?:[ .][0-9]{3})+(?![0-9])(?:,[0-9]+)?|[0-9]+(?:[.,][0-9]+)?/g;

/** Every number written in the text, with both readings of an ambiguous separator (24.000 → 24000 and 24). */
export function excerptNumbers(text: string | null | undefined): number[] {
  const out: number[] = [];
  for (const [tok] of normalizeExcerpt(text).matchAll(NUMBER_TOKEN)) {
    if (/^[0-9]{1,3}([ .][0-9]{3})+(,[0-9]+)?$/.test(tok)) {
      out.push(Number(tok.replace(/[ .]/g, "").replace(",", ".")));
      if (/^[0-9]{1,3}\.[0-9]{3}$/.test(tok)) out.push(Number(tok));
    } else if (/^[0-9]+,[0-9]+$/.test(tok)) {
      out.push(Number(tok.replace(",", ".")));
      if (/^[0-9]{1,3},[0-9]{3}$/.test(tok)) out.push(Number(tok.replace(",", "")));
    } else {
      out.push(Number(tok));
    }
  }
  return out;
}

const round6 = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

/** A rate stored as a fraction (0.09) is written as a percentage (9 %): both readings are accepted. */
export function numberInExcerpt(value: number | null | undefined, text: string | null | undefined): boolean {
  if (value == null || !Number.isFinite(value)) return false;
  const v = round6(value);
  const pct = round6(value * 100);
  return excerptNumbers(text).some((c) => round6(c) === v || round6(c) === pct);
}

const FOLD_FROM = "àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ'’-";
const FOLD_TO = "aaaeeeeiioouuucaaaeeeeiioouuuc   ";

export function foldText(text: string | null | undefined): string {
  const mapped = Array.from(text ?? "", (ch) => {
    const i = FOLD_FROM.indexOf(ch);
    return i >= 0 ? FOLD_TO[i] : ch;
  }).join("");
  return mapped.toLowerCase().replace(/\s+/g, " ").trim();
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function payloadInExcerpt(
  kind: AiSuggestionKind,
  payload: Record<string, unknown>,
  excerpt: string | null | undefined,
  wilayaNames: ReadonlyMap<string, string>,
): boolean {
  if (!excerpt || !excerpt.trim()) return false;
  if (kind === "LEGAL_VAR") return isNum(payload.value) && numberInExcerpt(payload.value, excerpt);
  if (kind === "CNAS_RATES") {
    const rates = (["employee_pct", "employer_pct", "fos_pct"] as const).map((k) => payload[k]).filter(isNum);
    return rates.length > 0 && rates.every((r) => numberInExcerpt(r, excerpt));
  }
  if (kind === "IRG_ZONE_SCOPE") {
    const codes = Array.isArray(payload.wilayas) ? payload.wilayas.map(String) : [];
    if (!codes.length) return false;
    const folded = foldText(excerpt);
    return codes.every((c) => {
      const name = wilayaNames.get(c);
      return Boolean(name) && folded.includes(foldText(name));
    });
  }
  const brackets = Array.isArray(payload.brackets) ? (payload.brackets as Record<string, unknown>[]) : [];
  if (!brackets.length) return false;
  return brackets.every(
    (b) =>
      isNum(b.rate) &&
      numberInExcerpt(b.rate, excerpt) &&
      (!isNum(b.from) || b.from <= 0 || numberInExcerpt(b.from, excerpt)) &&
      (!isNum(b.to) || numberInExcerpt(b.to, excerpt)),
  );
}

// ---------------------------------------------------------------------------
// Gemini request
// ---------------------------------------------------------------------------
const NULLABLE_STRING = { type: ["string", "null"] };
const NULLABLE_NUMBER = { type: ["number", "null"] };

export const LEGAL_AI_JSON_SCHEMA = {
  type: "object",
  properties: {
    document: {
      type: "object",
      properties: {
        reference: NULLABLE_STRING,
        title: NULLABLE_STRING,
        publication_date: NULLABLE_STRING,
        effective_date: NULLABLE_STRING,
        readable: { type: "boolean" },
        quality_notes: NULLABLE_STRING,
      },
      required: ["reference", "title", "publication_date", "effective_date", "readable", "quality_notes"],
    },
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: [...AI_ISSUE_KINDS] },
          text: { type: "string" },
        },
        required: ["kind", "text"],
      },
    },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: [...AI_SUGGESTION_KINDS] },
          target_code: NULLABLE_STRING,
          value: NULLABLE_NUMBER,
          employee_pct: NULLABLE_NUMBER,
          employer_pct: NULLABLE_NUMBER,
          fos_pct: NULLABLE_NUMBER,
          wilayas: { type: "array", items: { type: "string" } },
          brackets: {
            type: "array",
            items: {
              type: "object",
              properties: { from: { type: "number" }, to: NULLABLE_NUMBER, rate: { type: "number" } },
              required: ["from", "to", "rate"],
            },
          },
          value_as_written: NULLABLE_STRING,
          effective_date: NULLABLE_STRING,
          article: NULLABLE_STRING,
          page: { type: ["integer", "null"] },
          excerpt: { type: "string" },
          confidence: { type: "string", enum: [...AI_CONFIDENCES] },
          notes: NULLABLE_STRING,
        },
        required: [
          "kind",
          "target_code",
          "value",
          "employee_pct",
          "employer_pct",
          "fos_pct",
          "wilayas",
          "brackets",
          "value_as_written",
          "effective_date",
          "article",
          "page",
          "excerpt",
          "confidence",
          "notes",
        ],
      },
    },
  },
  required: ["document", "issues", "suggestions"],
} as const;

export type AiTargetVar = { id: string; key: string; label: string; fraction: boolean; current: number | null };
export type AiTargetRegime = {
  id: string;
  code: string;
  label: string;
  employee_pct: number | null;
  employer_pct: number | null;
  fos_pct: number | null;
};
export type AiTargets = {
  vars: AiTargetVar[];
  regimes: AiTargetRegime[];
  zones: { code: string; label: string }[];
  wilayas: { code: string; name_fr: string }[];
};

export function buildLegalExtractionPrompt(input: {
  doc: { doc_type: string; title: string; reference: string; applies_from: string; applies_to: string | null };
  targets: AiTargets;
}): string {
  const t = input.targets;
  const vars = t.vars
    .map((v) => `- ${v.key} : ${v.label} (${v.fraction ? "taux, valeur en fraction : 9 % → 0.09" : "valeur telle quelle"})`)
    .join("\n");
  const regimes = t.regimes.map((r) => `- ${r.code} : ${r.label}`).join("\n");
  const zones = t.zones.map((z) => `- ${z.code} : ${z.label}`).join("\n");
  const wilayas = t.wilayas.map((w) => `${w.code} ${w.name_fr}`).join(" ; ");
  return `Tu lis un texte juridique algérien officiel (${input.doc.doc_type}, ${input.doc.reference} — ${input.doc.title}), appliqué ${
    input.doc.applies_to ? `du ${input.doc.applies_from} au ${input.doc.applies_to}` : `à partir du ${input.doc.applies_from}`
  }. Le document peut être en français, en arabe ou bilingue, et peut être une image numérisée.

Ta tâche : relever UNIQUEMENT les valeurs écrites dans le document qui concernent la paie, pour qu'un humain les vérifie.

Règles strictes :
1. N'invente rien, ne calcule rien, ne déduis rien. Si une valeur n'est pas écrite, ne la propose pas.
2. Pour chaque suggestion, recopie dans "excerpt" le passage exact du document (mot pour mot, 10 à 2000 caractères) qui contient la valeur. Indique l'article et la page si le document les donne, sinon null.
3. "value_as_written" : la valeur telle qu'elle est écrite (ex. « 9 % », « 24.000 DA »).
4. N'écris jamais de formule, d'expression ou de code : uniquement des nombres et du texte.
5. "confidence" : HIGH si la valeur est lisible et sans ambiguïté, MEDIUM si un doute existe, LOW si la lecture est incertaine.
6. Signale dans "issues" chaque zone illisible (OCR), chaque ambiguïté (AMBIGUITY) et chaque information attendue mais absente (MISSING), par exemple une date d'effet non précisée.
7. "effective_date" : date d'effet écrite dans le texte (AAAA-MM-JJ), sinon null.
8. Mets à null ou [] les champs qui ne concernent pas le type de la suggestion.

Types de suggestion :
- LEGAL_VAR : une variable légale de la liste ci-dessous ("target_code" = sa clé, "value" = la valeur dans l'unité indiquée).
${vars || "- (aucune variable)"}
- CNAS_RATES : taux d'un régime CNAS ("target_code" = code du régime, "employee_pct", "employer_pct", "fos_pct" en pourcentage 0 à 100, null si non écrit).
${regimes || "- (aucun régime)"}
- IRG_ZONE_SCOPE : liste des wilayas d'une zone IRG ("target_code" = code de la zone, "wilayas" = codes à deux chiffres des wilayas citées par leur nom).
${zones || "- (aucune zone)"}
  Wilayas : ${wilayas}
- IRG_BAREME : tranches d'un barème IRG ("brackets" = de, à (null pour la dernière), taux en %). Elles seront affichées pour une saisie manuelle.

Si le document ne contient aucune de ces valeurs, renvoie une liste de suggestions vide et explique-le dans "issues".`;
}

const nullableString = z
  .string()
  .nullish()
  .transform((v) => (v && v.trim() ? v.trim() : null));
const nullableNumber = z
  .number()
  .nullish()
  .transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : null));

const rawSuggestionSchema = z.object({
  kind: z.enum(AI_SUGGESTION_KINDS),
  target_code: nullableString,
  value: nullableNumber,
  employee_pct: nullableNumber,
  employer_pct: nullableNumber,
  fos_pct: nullableNumber,
  wilayas: z.array(z.string()).nullish().transform((v) => v ?? []),
  brackets: z
    .array(z.object({ from: z.number().nullish(), to: z.number().nullish(), rate: z.number().nullish() }))
    .nullish()
    .transform((v) => v ?? []),
  value_as_written: nullableString,
  effective_date: nullableString,
  article: nullableString,
  page: z.number().int().nullish().catch(null),
  excerpt: z.string().nullish().transform((v) => (v ?? "").trim()),
  confidence: z.enum(AI_CONFIDENCES).catch("LOW"),
  notes: nullableString,
});

const issueSchema = z.object({
  kind: z.enum(AI_ISSUE_KINDS).catch("OTHER"),
  text: z
    .string()
    .trim()
    .min(1)
    .transform((v) => v.slice(0, 1000)),
});

export const legalAiResultSchema = z.object({
  document: z
    .object({
      reference: nullableString,
      title: nullableString,
      publication_date: nullableString,
      effective_date: nullableString,
      readable: z.boolean().catch(true),
      quality_notes: nullableString,
    })
    .catch({ reference: null, title: null, publication_date: null, effective_date: null, readable: true, quality_notes: null }),
  issues: z
    .array(z.unknown())
    .catch([])
    .transform((list) =>
      list
        .flatMap((i) => {
          const r = issueSchema.safeParse(i);
          return r.success ? [r.data] : [];
        })
        .slice(0, 200),
    ),
  suggestions: z
    .array(z.unknown())
    .catch([])
    .transform((list) =>
      list.flatMap((s) => {
        const r = rawSuggestionSchema.safeParse(s);
        return r.success ? [r.data] : [];
      }),
    ),
});
export type LegalAiResult = z.infer<typeof legalAiResultSchema>;
export type LegalAiRawSuggestion = LegalAiResult["suggestions"][number];

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const isoOrNull = (v: string | null) => (v && ISO_DAY.test(v) ? v : null);

const pctText = (n: number) => `${String(round6(n)).replace(".", ",")} %`;

/** Warnings only (unit, gap with the value in force, scale continuity, dates): they never block a conversion. */
export function coherenceWarnings(
  s: { kind: AiSuggestionKind; target_code: string | null; payload: Record<string, unknown>; effective_date: string | null },
  ctx: { targets: AiTargets; appliesFrom: string },
): string[] {
  const out: string[] = [];
  if (!s.effective_date) out.push("Date d'effet non indiquée par le texte : à vérifier avant de proposer.");
  else if (s.effective_date < ctx.appliesFrom) {
    out.push("Date d'effet antérieure au début de la période d'application du document.");
  }
  if (s.kind === "LEGAL_VAR") {
    const v = ctx.targets.vars.find((x) => x.key === s.target_code);
    const value = s.payload.value;
    if (!isNum(value)) out.push("Valeur numérique absente.");
    else if (v) {
      if (v.fraction && value > 1) {
        out.push(`Unité à vérifier : ${v.key} est un taux enregistré en fraction (9 % s'écrit 0,09), la valeur lue est ${value}.`);
      }
      if (v.current != null && round6(v.current) === round6(value)) out.push("Identique à la valeur en vigueur.");
      else if (v.current != null && v.current > 0 && Math.abs(value - v.current) / v.current > 0.5) {
        out.push(`Écart important avec la valeur en vigueur (${v.current} → ${value}).`);
      }
    }
  } else if (s.kind === "CNAS_RATES") {
    const r = ctx.targets.regimes.find((x) => x.code === s.target_code);
    const keys = ["employee_pct", "employer_pct", "fos_pct"] as const;
    if (!keys.some((k) => isNum(s.payload[k]))) out.push("Aucun taux lu.");
    if (keys.some((k) => isNum(s.payload[k]) && (s.payload[k] as number) > 50)) {
      out.push("Taux supérieur à 50 % : vérifiez qu'il s'agit bien d'un pourcentage.");
    }
    if (r && keys.every((k) => (isNum(s.payload[k]) ? round6(s.payload[k] as number) : null) === (r[k] == null ? null : round6(r[k]!)))) {
      out.push("Identique aux taux en vigueur.");
    }
  } else if (s.kind === "IRG_ZONE_SCOPE") {
    const codes = Array.isArray(s.payload.wilayas) ? s.payload.wilayas : [];
    if (!codes.length) out.push("Aucune wilaya reconnue dans la liste du référentiel.");
  } else {
    const b = (Array.isArray(s.payload.brackets) ? s.payload.brackets : []) as { from: number | null; to: number | null; rate: number | null }[];
    if (!b.length) out.push("Aucune tranche lue.");
    for (let i = 0; i < b.length; i++) {
      if (b[i].rate == null) out.push(`Tranche ${i + 1} : taux absent.`);
      if (i > 0) {
        const prevTo = b[i - 1].to;
        const from = b[i].from;
        if (prevTo == null || from == null || (from !== prevTo && Math.abs(from - prevTo) > 1)) {
          out.push(`Tranches ${i} et ${i + 1} non contiguës : à vérifier.`);
        }
        const prevRate = b[i - 1].rate;
        const rate = b[i].rate;
        if (prevRate != null && rate != null && rate < prevRate) out.push(`Tranche ${i + 1} : taux inférieur à la tranche précédente.`);
      }
    }
    if (b.length && b[b.length - 1].to != null) out.push("Dernière tranche bornée : le barème n'a pas de tranche ouverte.");
  }
  return out;
}

/** Gemini answer → suggestions sent to ref_legal_ai_extraction_save (targets are resolved by the database). */
export function toSaveSuggestions(result: LegalAiResult, ctx: { targets: AiTargets; appliesFrom: string }) {
  const knownWilayas = new Set(ctx.targets.wilayas.map((w) => w.code));
  return result.suggestions.slice(0, 100).map((s) => {
    const target = s.kind === "LEGAL_VAR" ? (s.target_code?.toUpperCase() ?? null) : s.target_code;
    let payload: Record<string, unknown>;
    if (s.kind === "LEGAL_VAR") payload = { value: s.value };
    else if (s.kind === "CNAS_RATES") payload = { employee_pct: s.employee_pct, employer_pct: s.employer_pct, fos_pct: s.fos_pct };
    else if (s.kind === "IRG_ZONE_SCOPE") {
      payload = { wilayas: [...new Set(s.wilayas.map((w) => w.trim().padStart(2, "0")).filter((w) => knownWilayas.has(w)))].sort() };
    } else {
      payload = {
        brackets: s.brackets.slice(0, 50).map((b) => ({ from: b.from ?? null, to: b.to ?? null, rate: b.rate ?? null })),
      };
    }
    const effective = isoOrNull(s.effective_date);
    return {
      kind: s.kind,
      target_code: target,
      payload,
      value_as_written: s.value_as_written?.slice(0, 200) ?? null,
      effective_date: effective,
      article: s.article?.slice(0, 120) ?? null,
      page: s.page != null && s.page >= 1 && s.page <= 5000 ? s.page : null,
      excerpt: s.excerpt.slice(0, 2000) || null,
      confidence: s.confidence,
      notes: s.notes?.slice(0, 1000) ?? null,
      warnings: coherenceWarnings({ kind: s.kind, target_code: target, payload, effective_date: effective }, ctx),
    };
  });
}

// ---------------------------------------------------------------------------
// Stored rows
// ---------------------------------------------------------------------------
export type AiSuggestionStatus = "OPEN" | "CONVERTED" | "DISMISSED";

export type AiSuggestionView = {
  id: string;
  seq: number;
  kind: AiSuggestionKind;
  target_code: string | null;
  target_id: string | null;
  target_key: string | null;
  target_label: string | null;
  payload: Record<string, unknown>;
  value_as_written: string | null;
  effective_date: string | null;
  article: string | null;
  page: number | null;
  excerpt: string | null;
  confidence: AiConfidence;
  notes: string | null;
  excerpt_match: boolean;
  warnings: string[];
  status: AiSuggestionStatus;
  proposal_id: string | null;
  final: Record<string, unknown> | null;
  decided_at: string | null;
  dismiss_reason: string | null;
};

export type AiExtractionView = {
  id: string;
  document_id: string;
  root_id: string;
  model: string;
  entry_path: string;
  d15_decision_id: string | null;
  document_info: Record<string, unknown>;
  issues: { kind: AiIssueKind; text: string }[];
  suggestion_count: number;
  status: "OPEN" | "CLOSED";
  created_at: string;
  created_by_name: string | null;
  suggestions: AiSuggestionView[];
};

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : fallback;

export function parseAiSuggestion(raw: unknown): AiSuggestionView | null {
  const r = obj(raw);
  const id = str(r?.id);
  if (!r || !id) return null;
  return {
    id,
    seq: Number(r.seq) || 0,
    kind: oneOf(AI_SUGGESTION_KINDS, r.kind, "LEGAL_VAR"),
    target_code: str(r.target_code),
    target_id: str(r.target_id),
    target_key: str(r.target_key),
    target_label: str(r.target_label),
    payload: obj(r.payload) ?? {},
    value_as_written: str(r.value_as_written),
    effective_date: str(r.effective_date)?.slice(0, 10) ?? null,
    article: str(r.article),
    page: typeof r.page === "number" ? r.page : null,
    excerpt: str(r.excerpt),
    confidence: oneOf(AI_CONFIDENCES, r.confidence, "LOW"),
    notes: str(r.notes),
    excerpt_match: r.excerpt_match === true,
    warnings: Array.isArray(r.warnings) ? r.warnings.filter((w): w is string => typeof w === "string") : [],
    status: oneOf(["OPEN", "CONVERTED", "DISMISSED"] as const, r.status, "OPEN"),
    proposal_id: str(r.proposal_id),
    final: obj(r.final),
    decided_at: str(r.decided_at),
    dismiss_reason: str(r.dismiss_reason),
  };
}

export function parseAiExtraction(raw: unknown, suggestions: unknown[]): AiExtractionView | null {
  const r = obj(raw);
  const id = str(r?.id);
  if (!r || !id) return null;
  const creator = Array.isArray(r.creator) ? obj(r.creator[0]) : obj(r.creator);
  return {
    id,
    document_id: str(r.document_id) ?? "",
    root_id: str(r.root_id) ?? "",
    model: str(r.model) ?? "",
    entry_path: str(r.entry_path) ?? "",
    d15_decision_id: str(r.d15_decision_id),
    document_info: obj(r.document_info) ?? {},
    issues: Array.isArray(r.issues)
      ? r.issues.flatMap((i) => {
          const x = obj(i);
          const text = str(x?.text);
          return x && text ? [{ kind: oneOf(AI_ISSUE_KINDS, x.kind, "OTHER"), text }] : [];
        })
      : [],
    suggestion_count: Number(r.suggestion_count) || 0,
    status: r.status === "CLOSED" ? "CLOSED" : "OPEN",
    created_at: str(r.created_at) ?? "",
    created_by_name: str(creator?.full_name),
    suggestions: suggestions
      .map(parseAiSuggestion)
      .filter((s): s is AiSuggestionView => s !== null)
      .sort((a, b) => a.seq - b.seq),
  };
}

/** Short text of a suggested value, in the unit the screen shows. */
export function suggestionValueText(s: { kind: AiSuggestionKind; payload: Record<string, unknown> }, fraction: boolean): string {
  const p = s.payload;
  if (s.kind === "LEGAL_VAR") {
    if (!isNum(p.value)) return "—";
    return fraction ? `${pctText(p.value * 100)} (${String(p.value).replace(".", ",")})` : String(p.value).replace(".", ",");
  }
  if (s.kind === "CNAS_RATES") {
    const t = (v: unknown) => (isNum(v) ? pctText(v) : "non écrit");
    return `salarié ${t(p.employee_pct)} · employeur ${t(p.employer_pct)} · FOS ${t(p.fos_pct)}`;
  }
  if (s.kind === "IRG_ZONE_SCOPE") {
    const codes = Array.isArray(p.wilayas) ? p.wilayas.map(String) : [];
    return codes.length ? `${codes.length} wilaya(s) : ${codes.join(", ")}` : "aucune wilaya reconnue";
  }
  const b = Array.isArray(p.brackets) ? p.brackets.length : 0;
  return `${b} tranche(s)`;
}

export type AiProposalInfo = {
  proposal_id: string;
  suggestion_id: string;
  extraction_id: string;
  document_id: string;
  model: string;
  confidence: AiConfidence;
  excerpt_match: boolean;
  payload_edited: boolean;
  excerpt_edited: boolean;
  warnings: string[];
};
