"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { requestRuleVerification } from "@/lib/actions/rule-proposals";
import { ACTION_LABEL, frMonth, ruleStatusLabel, ruleStatusTone, type RuleFamily } from "@/lib/rules/proposals";
import { Button } from "@/components/ui/button";
import { RhAlert, RhChip, RhField, rhInput } from "@/components/rh/rh-ui";
import { CitationsField } from "@/components/rules/legal-citations";
import type { CitationInput } from "@/lib/rules/legal-documents";

export const PROPOSALS_PATH = "/rh/legal/propositions";

export function QuickDialog({
  title,
  subtitle,
  children,
  footer,
  onClose,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border/60 bg-surface shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border/50 px-5 py-3">
          <div>
            <h3 className="text-base font-semibold">{title}</h3>
            {subtitle ? <div className="mt-0.5 text-xs text-foreground/55">{subtitle}</div> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-lg px-2 py-1 text-foreground/55 hover:bg-surface-muted"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border/50 px-5 py-3">{footer}</div>
      </div>
    </div>
  );
}

export type RuleSourceForm = { source_ref: string; text_effective_date: string; citations: CitationInput[] };

export const emptyRuleSource = (): RuleSourceForm => ({ source_ref: "", text_effective_date: "", citations: [] });

/**
 * Source asked by every screen proposing a legal rule, with its supporting documents from the register; the
 * effective month stays a separate choice (D2).
 */
export function RuleSourceFields({
  value,
  onChange,
  withDate = true,
  month,
}: {
  value: RuleSourceForm;
  onChange: (v: RuleSourceForm) => void;
  withDate?: boolean;
  month?: string | null;
}) {
  return (
    <div className="space-y-4">
      <div className={`grid gap-4 ${withDate ? "sm:grid-cols-[1fr_11rem]" : ""}`}>
        <RhField label="Source légale" required hint="Texte, article, n° et date du Journal officiel.">
          <input
            className={rhInput}
            value={value.source_ref}
            maxLength={500}
            placeholder="ex. LF 2026, art. 12 — JO n° 85 du 30/12/2025"
            onChange={(e) => onChange({ ...value, source_ref: e.target.value })}
          />
        </RhField>
        {withDate ? (
          <RhField label="Date d'effet du texte" required>
            <input
              className={rhInput}
              type="date"
              value={value.text_effective_date}
              onChange={(e) => onChange({ ...value, text_effective_date: e.target.value })}
            />
          </RhField>
        ) : null}
      </div>
      <CitationsField value={value.citations} onChange={(citations) => onChange({ ...value, citations })} month={month} />
    </div>
  );
}

/** Reminder shown in every proposal dialog. */
export function ProposalNotice() {
  return (
    <RhAlert tone="info">
      Ce changement devient une proposition : un approbateur la valide, puis le SUPER_ADMIN décide de sa date
      d&apos;application (D2). La paie ne change pas avant.
    </RhAlert>
  );
}

export type PendingProposalChip = {
  id: string;
  action: "SET" | "STOP" | "VERIFY";
  status: string;
  title: string;
  requested_month: string | null;
};

export function PendingProposalChips({ proposals }: { proposals: PendingProposalChip[] }) {
  if (!proposals.length) return null;
  return (
    <ul className="mt-1 space-y-1">
      {proposals.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center gap-1.5 text-xs">
          <RhChip tone={ruleStatusTone(p.status)}>{ruleStatusLabel(p.status)}</RhChip>
          <Link href={`${PROPOSALS_PATH}?id=${p.id}`} className="text-brand hover:underline">
            {ACTION_LABEL[p.action]}
            {p.action !== "VERIFY" && p.requested_month ? ` · demandé dès ${frMonth(p.requested_month)}` : ""}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function VerifiedChip({ verified }: { verified: boolean }) {
  return verified ? (
    <RhChip tone="success">Approuvée</RhChip>
  ) : (
    <span title="Valeur reprise avant le circuit d'approbation : à faire vérifier.">
      <RhChip tone="warning">Reprise non vérifiée</RhChip>
    </span>
  );
}

/** Existing value approved as reference without change (VERIFY proposal). */
export function VerifyRuleDialog({
  family,
  rowId,
  label,
  valueText,
  onClose,
  onDone,
}: {
  family: Exclude<RuleFamily, "IRG_ZONE_SCOPE">;
  rowId: string;
  label: string;
  valueText: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [source, setSource] = useState<RuleSourceForm>(emptyRuleSource);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function submit() {
    setError(null);
    start(async () => {
      const r = await requestRuleVerification({
        family,
        row_id: rowId,
        label,
        source_ref: source.source_ref,
        citations: source.citations,
      });
      if (!r.ok) return setError(r.error);
      setDone(r.data.message);
      onDone?.();
      router.refresh();
    });
  }

  return (
    <QuickDialog
      title={`Faire vérifier — ${label}`}
      subtitle={`Valeur actuelle : ${valueText}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Fermer
          </Button>
          {!done ? (
            <Button disabled={pending || source.source_ref.trim().length < 3 || !source.citations.length} onClick={submit}>
              Demander la vérification
            </Button>
          ) : null}
        </>
      }
    >
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {done ? (
        <RhAlert tone="success">{done}</RhAlert>
      ) : (
        <>
          <p className="text-sm text-foreground/70">
            La valeur ne change pas. Un approbateur la compare au texte cité et la confirme comme référence ; si elle a
            changé entre-temps, la demande devient caduque.
          </p>
          <RuleSourceFields value={source} onChange={setSource} withDate={false} />
        </>
      )}
    </QuickDialog>
  );
}
