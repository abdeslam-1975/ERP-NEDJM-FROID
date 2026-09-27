"use client";

import { Button } from "@/components/ui/button";

export function LegalOverrideDialog({
  lines,
  pending,
  onRespect,
  onAuthorize,
  onClose,
}: {
  lines: string[];
  pending: boolean;
  onRespect: () => void;
  onAuthorize: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Écart à la réglementation"
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border/60 bg-surface shadow-2xl"
      >
        <div className="border-b border-border/50 px-5 py-3">
          <h3 className="text-base font-semibold">Écart à la réglementation</h3>
          <p className="mt-1 text-xs text-foreground/60">
            La valeur proposée s&apos;écarte du barème légal en vigueur. Le dépassement est enregistré dans le journal d&apos;audit.
          </p>
        </div>
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4 text-sm">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border/50 px-5 py-3">
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Fermer
          </Button>
          <Button variant="secondary" disabled={pending} onClick={onRespect}>
            Respecter la réglementation
          </Button>
          <Button disabled={pending} onClick={onAuthorize}>
            Autoriser le dépassement
          </Button>
        </div>
      </div>
    </div>
  );
}
