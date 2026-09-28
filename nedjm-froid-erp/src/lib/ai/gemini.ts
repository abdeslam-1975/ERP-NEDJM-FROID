const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.8-flash";
const TIMEOUT_MS = 100_000;

export type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

export function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
};

/** One structured call: the model must answer with JSON matching `schema`. */
export async function generateStructured(input: {
  parts: GeminiPart[];
  schema: object;
}): Promise<unknown> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("Clé Gemini absente (variable GEMINI_API_KEY).");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${encodeURIComponent(geminiModel())}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: input.parts }],
        generationConfig: {
          temperature: 0,
          responseFormat: {
            text: { mimeType: "APPLICATION_JSON", schema: input.schema },
          },
        },
      }),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Gemini n'a pas répondu à temps. Réessayez avec un extrait plus court.");
    throw new Error(`Gemini injoignable : ${error instanceof Error ? error.message : "erreur réseau"}`);
  } finally {
    clearTimeout(timer);
  }

  const body = (await response.json().catch(() => ({}))) as GeminiResponse;
  if (!response.ok) {
    const reason = body.error?.message ?? `HTTP ${response.status}`;
    if (response.status === 400 && /api key/i.test(reason)) {
      throw new Error("Clé Gemini refusée. Vérifiez GEMINI_API_KEY.");
    }
    if (response.status === 429) {
      throw new Error("Quota Gemini atteint. Réessayez dans quelques minutes.");
    }
    throw new Error(`Gemini : ${reason}`);
  }
  if (body.promptFeedback?.blockReason) {
    throw new Error(`Gemini a refusé le document (${body.promptFeedback.blockReason}).`);
  }

  const candidate = body.candidates?.[0];
  const text = candidate?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  if (!text.trim()) {
    throw new Error(`Gemini n'a renvoyé aucun résultat (${candidate?.finishReason ?? "réponse vide"}).`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Réponse Gemini illisible (JSON invalide).");
  }
}
