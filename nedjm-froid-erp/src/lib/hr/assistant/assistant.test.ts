import { describe, expect, it } from "vitest";
import { parseBlocks, parseInline, safeHref } from "@/lib/hr/assistant/markdown";
import { buildAssistantPrompt } from "@/lib/hr/assistant/prompt";

describe("assistant markdown", () => {
  it("keeps only in-app links", () => {
    expect(safeHref("/rh/employes?q=07%2F24")).toBe("/rh/employes?q=07%2F24");
    expect(safeHref("//evil.example")).toBeNull();
    expect(safeHref("https://evil.example")).toBeNull();
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(parseInline("voir [ici](https://x.y) et [la fiche](/rh/employes)")).toEqual([
      { kind: "text", text: "voir " },
      { kind: "text", text: "ici" },
      { kind: "text", text: " et " },
      { kind: "link", text: "la fiche", href: "/rh/employes" },
    ]);
  });

  it("parses bold, lists and paragraphs", () => {
    const blocks = parseBlocks("Bonjour **Ali**\n\n- un\n- deux\n1. trois\nfin");
    expect(blocks.map((b) => b.kind)).toEqual(["p", "ul", "ol", "p"]);
    expect(blocks[0]).toEqual({
      kind: "p",
      lines: [[{ kind: "text", text: "Bonjour " }, { kind: "bold", children: [{ kind: "text", text: "Ali" }] }]],
    });
    expect(blocks[1]).toMatchObject({ kind: "ul", items: [[{ text: "un" }], [{ text: "deux" }]] });
    expect(parseInline("*ملاحظة:* ok")).toEqual([
      { kind: "italic", children: [{ kind: "text", text: "ملاحظة:" }] },
      { kind: "text", text: " ok" },
    ]);
  });

  it("keeps links inside bold text", () => {
    expect(parseInline("**[CHINE ABOUBAKR](/rh/employes?q=47%2F26)**")).toEqual([
      { kind: "bold", children: [{ kind: "link", text: "CHINE ABOUBAKR", href: "/rh/employes?q=47%2F26" }] },
    ]);
  });
});

describe("assistant prompt", () => {
  const base = {
    userName: "Test",
    roles: ["Pointeur"],
    today: "2026-10-03",
    currentPath: "/rh/presence",
    toolNames: ["resume_presence"],
  };

  it("leaves out the guide and pages the user cannot open", () => {
    const prompt = buildAssistantPrompt({
      ...base,
      canSee: (p) => p === "/rh" || p.startsWith("/rh/presence"),
      canSeeSalary: false,
    });
    expect(prompt).toContain("## Temps & présence (pointage) (/rh/presence)");
    expect(prompt).not.toContain("## Calcul de la paie");
    expect(prompt).not.toContain("- Paie · الأجور : /rh/paie");
    expect(prompt).toContain("SECTIONS RH NON AUTORISÉES");
    expect(prompt).toContain("NON autorisés");
    expect(prompt).toContain("Présence / pointage (/rh/presence)");
  });

  it("states salary access for salary roles", () => {
    const prompt = buildAssistantPrompt({ ...base, canSee: () => true, canSeeSalary: true });
    expect(prompt).toContain("Montants de salaire : autorisés");
    expect(prompt).not.toContain("SECTIONS RH NON AUTORISÉES");
    expect(prompt).toContain("## Calcul de la paie");
  });
});
