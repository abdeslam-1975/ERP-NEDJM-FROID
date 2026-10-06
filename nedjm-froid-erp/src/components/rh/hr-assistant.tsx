"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ArrowUp, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { useUiLayout } from "@/components/layout/ui-layout-context";
import { askHrAssistant } from "@/lib/actions/hr-assistant";
import type { AssistantMessage } from "@/lib/hr/assistant/prompt";
import { parseBlocks, type Inline } from "@/lib/hr/assistant/markdown";
import { isPathBlocked } from "@/lib/ui/resolve";

const STORAGE_KEY = "nf-hr-assistant";

const SUGGESTIONS: { path: string; text: string }[] = [
  { path: "/rh/employes", text: "Comment importer l'ancienne base des employés ?" },
  { path: "/rh/employes", text: "Quels contrats se terminent dans les 30 prochains jours ?" },
  { path: "/rh/presence", text: "Résumé du pointage de ce mois par chantier" },
  { path: "/rh/documents", text: "من هم العمال في مهمة اليوم؟" },
  { path: "/rh/conges", text: "كيف يُحسب رصيد العطلة السنوية؟" },
  { path: "/rh/paie", text: "Quelles sont les étapes de la paie du mois ?" },
];

function readStored(): AssistantMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? (value as AssistantMessage[]).slice(-40) : [];
  } catch {
    return [];
  }
}

function InlineText({ parts, onNavigate }: { parts: Inline[]; onNavigate: () => void }) {
  return parts.map((p, i) =>
    p.kind === "bold" ? (
      <strong key={i} className="font-semibold text-foreground">
        <InlineText parts={p.children} onNavigate={onNavigate} />
      </strong>
    ) : p.kind === "italic" ? (
      <em key={i}>
        <InlineText parts={p.children} onNavigate={onNavigate} />
      </em>
    ) : p.kind === "code" ? (
      <code key={i} className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[0.85em]">
        {p.text}
      </code>
    ) : p.kind === "link" ? (
      <Link key={i} href={p.href} onClick={onNavigate} className="font-semibold text-brand underline-offset-2 hover:underline">
        {p.text}
      </Link>
    ) : (
      <span key={i}>{p.text}</span>
    ),
  );
}

function Answer({ text, onNavigate }: { text: string; onNavigate: () => void }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <div className="space-y-2">
      {blocks.map((b, i) =>
        b.kind === "h" ? (
          <p key={i} className="font-semibold text-foreground">
            <InlineText parts={b.inline} onNavigate={onNavigate} />
          </p>
        ) : b.kind === "p" ? (
          <p key={i}>
            {b.lines.map((line, j) => (
              <span key={j}>
                {j ? <br /> : null}
                <InlineText parts={line} onNavigate={onNavigate} />
              </span>
            ))}
          </p>
        ) : (
          <ul key={i} className={`space-y-1 ps-5 ${b.kind === "ol" ? "list-decimal" : "list-disc"}`}>
            {b.items.map((item, j) => (
              <li key={j}>
                <InlineText parts={item} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

/** AI help for the HR module: explains the screens and looks up data, within the user's own rights. */
export function HrAssistant() {
  const pathname = usePathname();
  const layout = useUiLayout();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>(readStored);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);

  const suggestions = useMemo(() => SUGGESTIONS.filter((s) => !isPathBlocked(layout, s.path)).slice(0, 4), [layout]);

  useEffect(() => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
  }, [messages]);

  useEffect(() => {
    scroller?.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
  }, [scroller, messages, pending]);

  if (isPathBlocked(layout, "/rh")) return null;

  function send(text: string) {
    const question = text.trim();
    if (!question || pending) return;
    const next: AssistantMessage[] = [...messages, { role: "user", text: question.slice(0, 2000) }];
    setMessages(next);
    setDraft("");
    setError(null);
    startTransition(async () => {
      const res = await askHrAssistant({ messages: next, pathname });
      if (res.ok) {
        setMessages([...next, { role: "assistant", text: res.data.answer }]);
        return;
      }
      setMessages(messages);
      setDraft(question);
      setError(res.error);
    });
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-foreground/60 transition hover:bg-brand/[0.08] hover:text-brand"
        aria-label="Assistant RH"
        title="Assistant RH · المساعد"
      >
        <Sparkles className="h-[18px] w-[18px]" aria-hidden />
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/20 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content className="fixed top-3 right-3 bottom-3 z-50 flex w-[min(30rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-border/70 bg-surface shadow-[0_24px_80px_-20px_rgba(15,23,42,0.45)] outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-right-8 data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-right-8">
          <header className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
              <Sparkles className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="font-display text-base font-semibold tracking-tight">
                Assistant RH · <span dir="rtl">المساعد</span>
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-xs text-foreground/55">
                Lecture seule, selon vos droits d&apos;accès
              </DialogPrimitive.Description>
            </div>
            {messages.length ? (
              <button
                type="button"
                onClick={() => {
                  setMessages([]);
                  setError(null);
                }}
                className="inline-flex size-9 items-center justify-center rounded-xl text-foreground/55 transition hover:bg-surface-muted hover:text-foreground"
                title="Nouvelle conversation"
                aria-label="Nouvelle conversation"
              >
                <RotateCcw className="size-4" />
              </button>
            ) : null}
            <DialogPrimitive.Close
              className="inline-flex size-9 items-center justify-center rounded-xl text-foreground/55 transition hover:bg-surface-muted hover:text-foreground"
              aria-label="Fermer"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </header>

          <div ref={setScroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm leading-relaxed">
            {!messages.length ? (
              <div className="space-y-4">
                <p className="text-foreground/70">
                  Posez une question sur le fonctionnement du module ou cherchez une information (employé, contrat, pointage,
                  congé, document).
                </p>
                <p className="text-foreground/70" dir="rtl">
                  اسأل عن طريقة عمل الموديل أو ابحث عن معلومة: عامل، عقد، حضور، عطلة، وثيقة.
                </p>
                <div className="flex flex-col gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s.text}
                      type="button"
                      dir="auto"
                      onClick={() => send(s.text)}
                      className="rounded-xl border border-border/70 px-3 py-2 text-start text-foreground/80 transition hover:border-brand/40 hover:bg-brand-muted hover:text-brand"
                    >
                      {s.text}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <p dir="auto" className="max-w-[85%] rounded-2xl rounded-br-md bg-brand px-3 py-2 whitespace-pre-wrap text-white">
                    {m.text}
                  </p>
                </div>
              ) : (
                <div key={i} dir="auto" data-assistant-answer className="max-w-[95%] rounded-2xl rounded-bl-md bg-surface-muted px-3 py-2 text-foreground/85">
                  <Answer text={m.text} onNavigate={() => setOpen(false)} />
                </div>
              ),
            )}
            {pending ? (
              <p className="flex items-center gap-2 text-foreground/55">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Recherche… · جارٍ البحث
              </p>
            ) : null}
            {error ? (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-700 dark:text-red-300">{error}</p>
            ) : null}
          </div>

          <form
            className="flex items-end gap-2 border-t border-border/60 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              dir="auto"
              rows={2}
              maxLength={2000}
              placeholder="Votre question… · سؤالك"
              aria-label="Question à l'assistant"
              className="max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/20"
            />
            <button
              type="submit"
              disabled={pending || !draft.trim()}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand text-white transition hover:opacity-90 disabled:opacity-40"
              aria-label="Envoyer"
            >
              <ArrowUp className="size-4" />
            </button>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
