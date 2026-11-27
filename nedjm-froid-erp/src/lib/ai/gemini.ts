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

const STRUCTURED_FALLBACKS = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-flash-lite-latest"];

/** Models tried in order when reading a document. A busy model is skipped for the next one. */
export function structuredModels(): string[] {
  return [...new Set([geminiModel(), ...STRUCTURED_FALLBACKS])];
}

/** One structured call: the model must answer with JSON matching `schema`. A busy model is retried once, then the next model answers. */
export async function generateStructured(input: { parts: GeminiPart[]; schema: object }): Promise<unknown> {
  const models = structuredModels();
  let last: unknown = new OverloadError("Gemini est surchargé en ce moment. Réessayez dans une minute.");
  for (let index = 0; index < models.length; index++) {
    const attempts = index === 0 ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await callOnce(input, models[index]);
      } catch (error) {
        last = error;
        if (!(error instanceof OverloadError)) throw error;
        if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 1_500));
      }
    }
  }
  throw last;
}

class OverloadError extends Error {}

async function callOnce(input: { parts: GeminiPart[]; schema: object }, model: string): Promise<unknown> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("Clé Gemini absente (variable GEMINI_API_KEY).");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
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
    if (response.status === 429 || response.status === 503 || /unavailable|overloaded|resource exhausted/i.test(reason)) {
      throw new OverloadError("Gemini est surchargé en ce moment. Réessayez dans une minute.");
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

export type GeminiChatPart = {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  functionResponse?: { name: string; id?: string; response: Record<string, unknown> };
  /** Must be sent back unchanged with the model turn that carried it. */
  thoughtSignature?: string;
};

export type GeminiContent = { role: "user" | "model"; parts: GeminiChatPart[] };

export type GeminiFunctionDeclaration = { name: string; description: string; parameters?: object };

const CHAT_TIMEOUT_MS = 30_000;

/**
 * Chat models in order of preference. Thought signatures are model-bound, so a question runs on one model;
 * when that model is overloaded or out of quota the caller restarts the question on the next one.
 */
export function assistantModels(): string[] {
  const preferred = process.env.GEMINI_ASSISTANT_MODEL?.trim() || "gemini-3.5-flash";
  return [...new Set([preferred, "gemini-3.5-flash-lite", "gemini-flash-lite-latest"])];
}

export function isGeminiOverload(error: unknown): boolean {
  return error instanceof OverloadError;
}

const CHAT_RETRY_DELAY_MS = 1_500;

/** One chat step with function calling; an overload is retried once on the same model. */
export async function generateChatTurn(input: {
  system: string;
  contents: GeminiContent[];
  functions: GeminiFunctionDeclaration[];
  model: string;
  /** Forces a text answer: the tools stay declared (the history refers to them) but cannot be called. */
  answerNow?: boolean;
}): Promise<GeminiChatPart[]> {
  try {
    return await chatOnce(input.model, input);
  } catch (error) {
    if (!(error instanceof OverloadError)) throw error;
    await new Promise((resolve) => setTimeout(resolve, CHAT_RETRY_DELAY_MS));
    return chatOnce(input.model, input);
  }
}

async function chatOnce(
  model: string,
  input: { system: string; contents: GeminiContent[]; functions: GeminiFunctionDeclaration[]; answerNow?: boolean },
): Promise<GeminiChatPart[]> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("Clé Gemini absente (variable GEMINI_API_KEY).");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: input.contents,
        ...(input.functions.length
          ? {
              tools: [{ functionDeclarations: input.functions }],
              ...(input.answerNow ? { toolConfig: { functionCallingConfig: { mode: "NONE" } } } : {}),
            }
          : {}),
        generationConfig: { temperature: 0.2 },
      }),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    if (controller.signal.aborted) throw new OverloadError("Gemini n'a pas répondu à temps.");
    throw new Error(`Gemini injoignable : ${error instanceof Error ? error.message : "erreur réseau"}`);
  } finally {
    clearTimeout(timer);
  }

  const body = (await response.json().catch(() => ({}))) as {
    candidates?: { content?: { parts?: GeminiChatPart[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
    error?: { message?: string };
  };
  if (!response.ok) {
    const reason = body.error?.message ?? `HTTP ${response.status}`;
    if (response.status === 400 && /api key/i.test(reason)) throw new Error("Clé Gemini refusée. Vérifiez GEMINI_API_KEY.");
    if (response.status === 429) throw new OverloadError("Quota Gemini atteint. Réessayez dans une minute.");
    if (response.status === 503 || response.status === 500) {
      throw new OverloadError("Gemini est surchargé en ce moment. Réessayez dans une minute.");
    }
    throw new Error(`Gemini : ${reason}`);
  }
  if (body.promptFeedback?.blockReason) throw new Error(`Gemini a refusé la question (${body.promptFeedback.blockReason}).`);
  const parts = body.candidates?.[0]?.content?.parts ?? [];
  if (!parts.length) {
    throw new Error(`Gemini n'a renvoyé aucune réponse (${body.candidates?.[0]?.finishReason ?? "réponse vide"}).`);
  }
  return parts;
}
