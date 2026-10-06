"use server";

import { z } from "zod";
import {
  assistantModels,
  generateChatTurn,
  geminiConfigured,
  isGeminiOverload,
  type GeminiChatPart,
  type GeminiContent,
} from "@/lib/ai/gemini";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { HR_SALARY_VALUE_ROLES, workspaceHasRole } from "@/lib/auth/require-roles";
import { buildAssistantPrompt } from "@/lib/hr/assistant/prompt";
import { assistantTools, runAssistantTool, type AssistantAccess } from "@/lib/hr/assistant/tools";
import { todayIsoAlgiers } from "@/lib/hr/mission-order";
import { getUiLayout } from "@/lib/ui/layout";
import { isPathBlocked } from "@/lib/ui/resolve";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

const MAX_STEPS = 7;
const HISTORY = 12;

const inputSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().trim().min(1).max(2000) }))
    .min(1)
    .max(40)
    .refine((list) => list[list.length - 1]?.role === "user", "La dernière entrée doit être une question."),
  pathname: z.string().max(200).nullable().optional(),
});

/** Answers an HR question with the guide and read-only tools, limited to what the signed-in user may see. */
export async function askHrAssistant(input: unknown): Promise<ActionResult<{ answer: string }>> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Question invalide." };
  const workspace = await getWorkspaceProfile();
  if (!workspace) return { ok: false, error: "Session expirée : reconnectez-vous." };
  const layout = await getUiLayout();
  if (isPathBlocked(layout, "/rh")) return { ok: false, error: "Le module RH ne fait pas partie de vos accès." };
  if (!geminiConfigured()) return { ok: false, error: "Assistant indisponible : clé Gemini absente (GEMINI_API_KEY)." };

  const access: AssistantAccess = {
    canSee: (path) => !isPathBlocked(layout, path),
    canSeeSalary: workspace.isSuperAdmin || workspaceHasRole(workspace, HR_SALARY_VALUE_ROLES),
  };
  const tools = assistantTools(access);
  const byName = new Map(tools.map((t) => [t.declaration.name, t]));
  const pathname = parsed.data.pathname?.split("?")[0] ?? null;
  const system = buildAssistantPrompt({
    canSee: access.canSee,
    canSeeSalary: access.canSeeSalary,
    userName: workspace.fullName,
    roles: [...new Set(workspace.roles.map((r) => r.roleLabelFr))],
    today: todayIsoAlgiers(),
    currentPath: pathname,
    toolNames: tools.map((t) => t.declaration.name),
  });

  const history: GeminiContent[] = parsed.data.messages.slice(-HISTORY).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.text }],
  }));
  const functions = tools.map((t) => t.declaration);

  async function answerWith(model: string): Promise<ActionResult<{ answer: string }>> {
    const contents = [...history];
    for (let step = 0; step < MAX_STEPS; step++) {
      const parts = await generateChatTurn({ system, contents, functions, model, answerNow: step === MAX_STEPS - 1 });
      const calls = parts.filter((p) => p.functionCall);
      if (!calls.length) {
        const answer = parts
          .map((p) => p.text ?? "")
          .join("")
          .trim();
        return answer ? { ok: true, data: { answer } } : { ok: false, error: "L'assistant n'a pas pu répondre. Reformulez la question." };
      }
      contents.push({ role: "model", parts });
      const responses: GeminiChatPart[] = await Promise.all(
        calls.map(async ({ functionCall }) => {
          const call = functionCall!;
          const tool = byName.get(call.name);
          const response = tool
            ? await runAssistantTool(tool, call.args ?? {}, access)
            : { erreur: "Cet outil ne fait pas partie des droits de l'utilisateur." };
          return { functionResponse: { name: call.name, ...(call.id ? { id: call.id } : {}), response } };
        }),
      );
      contents.push({ role: "user", parts: responses });
    }
    return { ok: false, error: "Question trop large : précisez (employé, chantier ou mois)." };
  }

  let lastError: unknown = null;
  for (const model of assistantModels()) {
    try {
      return await answerWith(model);
    } catch (error) {
      lastError = error;
      if (!isGeminiOverload(error)) break;
    }
  }
  return { ok: false, error: lastError instanceof Error ? lastError.message : "Assistant indisponible." };
}
