import { describe, expect, it } from "vitest";
import { geminiModel, structuredModels } from "@/lib/ai/gemini";

describe("structuredModels", () => {
  it("starts with the configured model and keeps a different model behind it", () => {
    const models = structuredModels();
    expect(models[0]).toBe(geminiModel());
    expect(new Set(models).size).toBe(models.length);
    expect(models.length).toBeGreaterThan(1);
  });
});
