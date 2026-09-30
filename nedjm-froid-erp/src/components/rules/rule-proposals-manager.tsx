"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveRuleProposal,
  rejectRuleProposal,
  requestRuleApplication,
  submitRuleProposal,
  withdrawRuleProposal,
  type RuleAccess,
} from "@/lib/actions/rule-proposals";
import {
  ACTION_LABEL,
  CONTRIBUTOR_ROLE_LABEL,
  FAMILY_LABEL,
  applicationMonthError,
  applicationMonthsForDate,
  approvalCheck,
  frDay,
  frMonth,
  ruleStatusLabel,
  ruleStatusTone,
  type RuleProposalView,
} from "@/lib/rules/proposals";
import { RuleDiff } from "@/components/rules/rule-content";
import { QuickDialog } from "@/components/rules/rule-ui";
import { CitationsList } from "@/components/rules/legal-citations";
import { earliestOpen, firstOpenFor, isMonthClosed, type PayrollChainState } from "@/lib/hr/payroll-chains";
import { Button } from "@/components/ui/button";
import { RhAlert, RhChip, RhField, RhPageHeader, RhPanel, RhTabs, rhInput } from "@/components/rh/rh-ui";

type View = "open" | "submitted" | "approved" | "all";

type Dialog =
  | { kind: "approve"; p: RuleProposalView }
  | { kind: "reject"; p: RuleProposalView }
  | { kind: "withdraw"; p: RuleProposalView }
  | { kind: "apply"; p: RuleProposalView }
  | null;

function matches(view: View, p: RuleProposalView) {
  if (view === "submitted") return p.status === "SUBMITTED";
  if (view === "approved") return p.status === "APPROVED";
  if (view === "open") return p.status === "DRAFT" || p.status === "SUBMITTED" || p.status === "APPROVED";
  return true;
}

function dateTime(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

export function RuleProposalsManager({
  proposals,
  access,
  focusId,
  initialView,
  showAll,
}: {
  proposals: RuleProposalView[];
  access: RuleAccess;
  focusId: string | null;
  initialView: View;
  showAll: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>(initialView);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [info, setInfo] = useState<{ text: string; decisionId?: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const counts = useMemo(
    () => ({
      open: proposals.filter((p) => matches("open", p)).length,
      submitted: proposals.filter((p) => matches("submitted", p)).length,
      approved: proposals.filter((p) => matches("approved", p)).length,
      all: proposals.length,
    }),
    [proposals],
  );
  const shown = proposals.filter((p) => matches(view, p));

  function submit(p: RuleProposalView) {
    setError(null);
    start(async () => {
      const r = await submitRuleProposal(p.id);
      if (!r.ok) return setError(r.error);
      setInfo({ text: `« ${p.title} » soumise pour approbation.` });
      router.refresh();
    });
  }

  function done(text: string, decisionId?: string | null) {
    setDialog(null);
    setError(null);
    setInfo({ text, decisionId });
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <RhPageHeader
        title="Propositions légales"
        description="Chaque changement de taux, de barème ou de zone IRG passe ici : soumission, approbation par une autre personne (le SUPER_ADMIN peut approuver sa propre proposition, c'est alors signalé), puis décision de la date d'application (D2). Rien ne change sur la paie avant cette décision."
      />
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {info ? (
        <RhAlert tone="success">
          {info.text}{" "}
          {info.decisionId ? (
            <Link href={`/decisions/${info.decisionId}`} className="font-medium underline">
              Ouvrir la décision D2
            </Link>
          ) : null}
        </RhAlert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <RhTabs
          items={[
            { id: "open", label: `En cours (${counts.open})` },
            { id: "submitted", label: `À approuver (${counts.submitted})` },
            { id: "approved", label: `Approuvées, date à décider (${counts.approved})` },
            { id: "all", label: `Toutes (${counts.all})` },
          ]}
          value={view}
          onChange={(id) => setView(id as View)}
        />
        <Link
          href={showAll ? "/rh/legal/propositions" : "/rh/legal/propositions?tout=1"}
          className="text-sm text-brand hover:underline"
        >
          {showAll ? "Masquer les propositions closes anciennes" : "Afficher tout l'historique"}
        </Link>
      </div>

      {!shown.length ? (
        <RhAlert tone="info">Aucune proposition dans cette vue.</RhAlert>
      ) : null}

      {shown.map((p) => {
        const check = approvalCheck({
          status: p.status,
          canApprove: access.canApprove,
          isSuperAdmin: access.isSuperAdmin,
          isContributor: p.is_contributor,
        });
        const canWithdraw =
          (p.status === "DRAFT" || p.status === "SUBMITTED" || p.status === "APPROVED") &&
          (access.isSuperAdmin || access.canApprove || (access.canPropose && p.is_contributor));
        const canDate =
          p.status === "APPROVED" && p.action !== "VERIFY" && (access.canApprove || access.canDecideApplication);
        return (
          <RhPanel key={p.id}>
            <div
              id={`p-${p.id}`}
              className={`space-y-3 ${focusId === p.id ? "rounded-xl ring-2 ring-brand/40 ring-offset-4" : ""}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <RhChip tone={ruleStatusTone(p.status)}>{ruleStatusLabel(p.status)}</RhChip>
                    <RhChip>{FAMILY_LABEL[p.family]}</RhChip>
                    <RhChip>{ACTION_LABEL[p.action]}</RhChip>
                    {p.origin === "AI" ? <RhChip tone="warning">Brouillon IA, relu par un humain</RhChip> : null}
                    {p.self_approved ? <RhChip tone="danger">Auto-approbation SUPER_ADMIN</RhChip> : null}
                  </div>
                  <h3 className="mt-1.5 font-semibold">{p.title}</h3>
                  <p className="text-xs text-foreground/60">{p.target_label}</p>
                </div>
                <div className="text-right text-xs text-foreground/60">
                  <p>Créée le {dateTime(p.created_at)}</p>
                  {p.created_by_name ? <p>par {p.created_by_name}</p> : null}
                </div>
              </div>

              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-xs text-foreground/55">Source légale</dt>
                  <dd>{p.source_ref || "—"}</dd>
                </div>
                {p.action !== "VERIFY" ? (
                  <>
                    <div>
                      <dt className="text-xs text-foreground/55">Date d&apos;effet du texte</dt>
                      <dd>{frDay(p.text_effective_date)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-foreground/55">Mois demandé</dt>
                      <dd>{frMonth(p.requested_month)}</dd>
                    </div>
                  </>
                ) : null}
                <div>
                  <dt className="text-xs text-foreground/55">
                    {p.status === "APPLIED" ? "Appliquée" : p.reviewed_at ? "Examinée" : "Soumise"}
                  </dt>
                  <dd>
                    {p.status === "APPLIED" && p.applied_month
                      ? `dès ${frMonth(p.applied_month)}`
                      : p.reviewed_at
                        ? `${dateTime(p.reviewed_at)}${p.reviewed_by_name ? ` · ${p.reviewed_by_name}` : ""}`
                        : dateTime(p.submitted_at)}
                  </dd>
                </div>
              </dl>

              <RuleDiff family={p.family} action={p.action} current={p.current} proposed={p.proposed} />

              <CitationsList citations={p.citations} warnings={p.citation_warnings} />

              {p.contributors.length ? (
                <p className="text-xs text-foreground/60">
                  Contributeurs :{" "}
                  {p.contributors
                    .map((c) => `${c.name} (${CONTRIBUTOR_ROLE_LABEL[c.role] ?? c.role})`)
                    .join(", ")}
                  {p.is_contributor ? " — vous en faites partie." : ""}
                </p>
              ) : null}
              {p.review_note ? <p className="text-sm">Note de l&apos;approbateur : {p.review_note}</p> : null}
              {p.closed_reason && p.status !== "APPLIED" ? (
                <p className="text-sm text-foreground/70">Motif de clôture : {p.closed_reason}</p>
              ) : null}
              {p.application_decision_id ? (
                <p className="text-sm">
                  <Link href={`/decisions/${p.application_decision_id}`} className="text-brand hover:underline">
                    Décision D2 de date d&apos;application
                  </Link>
                  {p.application_decision_status ? ` · ${p.application_decision_status.toLowerCase()}` : ""}
                </p>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2">
                {p.status === "DRAFT" && access.canPropose && (p.is_contributor || access.isSuperAdmin) ? (
                  <Button disabled={pending} onClick={() => submit(p)}>
                    Soumettre
                  </Button>
                ) : null}
                {p.status === "SUBMITTED" ? (
                  <>
                    <Button
                      disabled={pending || !check.allowed}
                      title={check.reason ?? undefined}
                      onClick={() => setDialog({ kind: "approve", p })}
                    >
                      Approuver
                    </Button>
                    {access.canApprove ? (
                      <Button variant="secondary" disabled={pending} onClick={() => setDialog({ kind: "reject", p })}>
                        Rejeter
                      </Button>
                    ) : null}
                  </>
                ) : null}
                {canDate ? (
                  <Button disabled={pending} onClick={() => setDialog({ kind: "apply", p })}>
                    {p.application_decision_id ? "Changer la date d'application" : "Choisir la date d'application"}
                  </Button>
                ) : null}
                {canWithdraw ? (
                  <Button
                    variant="ghost"
                    className="text-red-700"
                    disabled={pending}
                    onClick={() => setDialog({ kind: "withdraw", p })}
                  >
                    Retirer
                  </Button>
                ) : null}
              </div>
              {p.status === "SUBMITTED" && !check.allowed && check.reason ? (
                <p className="text-right text-xs text-foreground/55">{check.reason}</p>
              ) : null}
            </div>
          </RhPanel>
        );
      })}

      {dialog?.kind === "approve" ? (
        <ApproveDialog
          p={dialog.p}
          selfApproval={
            approvalCheck({
              status: dialog.p.status,
              canApprove: access.canApprove,
              isSuperAdmin: access.isSuperAdmin,
              isContributor: dialog.p.is_contributor,
            }).selfApproval
          }
          onClose={() => setDialog(null)}
          onDone={done}
        />
      ) : null}
      {dialog?.kind === "reject" || dialog?.kind === "withdraw" ? (
        <ReasonDialog kind={dialog.kind} p={dialog.p} onClose={() => setDialog(null)} onDone={done} />
      ) : null}
      {dialog?.kind === "apply" ? (
        <ApplicationDialog
          p={dialog.p}
          chain={access.chain}
          onClose={() => setDialog(null)}
          onDone={done}
        />
      ) : null}
    </div>
  );
}

function ApproveDialog({
  p,
  selfApproval,
  onClose,
  onDone,
}: {
  p: RuleProposalView;
  selfApproval: boolean;
  onClose: () => void;
  onDone: (text: string, decisionId?: string | null) => void;
}) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [confirmSelf, setConfirmSelf] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function approve() {
    setError(null);
    start(async () => {
      const r = await approveRuleProposal({ id: p.id, note });
      if (!r.ok) return setError(r.error);
      const flag = r.data.self_approved ? " (auto-approbation SUPER_ADMIN, tracée)" : "";
      if (r.data.status === "APPLIED") return onDone(`Valeur approuvée comme référence${flag}.`);
      if (r.data.month_closed) {
        return onDone(
          `Proposition approuvée${flag}, sans effet : le mois demandé est déjà clos. Choisissez une date d'application.`,
        );
      }
      onDone(
        `Proposition approuvée${flag}, sans effet tant que le SUPER_ADMIN n'a pas décidé sa date d'application.`,
        r.data.decision_id,
      );
    });
  }

  return (
    <QuickDialog
      title="Approuver la proposition"
      subtitle={p.title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Fermer
          </Button>
          <Button disabled={pending || (selfApproval && !confirmSelf)} onClick={approve}>
            Approuver
          </Button>
        </>
      }
    >
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {p.action === "VERIFY" ? (
        <RhAlert tone="info">
          Vous confirmez que la valeur affichée correspond au texte cité. Elle devient la référence approuvée, sans
          changer de montant.
        </RhAlert>
      ) : (
        <RhAlert tone="info">
          L&apos;approbation ne change pas encore la paie : la date d&apos;application est décidée ensuite (D2).
        </RhAlert>
      )}
      <CitationsList citations={p.citations} warnings={p.citation_warnings} />
      {selfApproval ? (
        <label className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/60 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
          <input type="checkbox" checked={confirmSelf} onChange={(e) => setConfirmSelf(e.target.checked)} />
          <span>
            Vous avez contribué à cette proposition. En tant que SUPER_ADMIN vous pouvez l&apos;approuver ; elle sera
            marquée « auto-approbation SUPER_ADMIN » dans l&apos;historique et sur la décision.
          </span>
        </label>
      ) : null}
      <RhField label="Note (facultative)">
        <textarea className={`${rhInput} min-h-20`} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
      </RhField>
    </QuickDialog>
  );
}

function ReasonDialog({
  kind,
  p,
  onClose,
  onDone,
}: {
  kind: "reject" | "withdraw";
  p: RuleProposalView;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const min = kind === "reject" ? 10 : 5;

  function send() {
    setError(null);
    start(async () => {
      const r = kind === "reject" ? await rejectRuleProposal({ id: p.id, text }) : await withdrawRuleProposal({ id: p.id, text });
      if (!r.ok) return setError(r.error);
      onDone(kind === "reject" ? `« ${p.title} » rejetée.` : `« ${p.title} » retirée.`);
    });
  }

  return (
    <QuickDialog
      title={kind === "reject" ? "Rejeter la proposition" : "Retirer la proposition"}
      subtitle={p.title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Fermer
          </Button>
          <Button variant="danger" disabled={pending || text.trim().length < min} onClick={send}>
            {kind === "reject" ? "Rejeter" : "Retirer"}
          </Button>
        </>
      }
    >
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {p.family === "IRG_BAREME" || p.family === "IRG_RULES" ? (
        <p className="text-sm text-foreground/70">Le brouillon IRG redevient modifiable.</p>
      ) : null}
      {p.application_decision_id ? (
        <p className="text-sm text-foreground/70">La décision D2 en attente sera close.</p>
      ) : null}
      <RhField label={`Motif (${min} caractères min.)`} required>
        <textarea className={`${rhInput} min-h-20`} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} />
      </RhField>
    </QuickDialog>
  );
}

function ApplicationDialog({
  p,
  chain,
  onClose,
  onDone,
}: {
  p: RuleProposalView;
  chain: PayrollChainState;
  onClose: () => void;
  onDone: (text: string, decisionId?: string | null) => void;
}) {
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"month" | "date">("month");
  const earliest = earliestOpen(chain);
  const defaultMonth =
    p.requested_month && !isMonthClosed(chain, p.requested_month) ? p.requested_month : (earliest ?? "");
  const [month, setMonth] = useState(defaultMonth);
  const [date, setDate] = useState(p.text_effective_date ?? "");
  const [attached, setAttached] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const options = mode === "date" && date ? applicationMonthsForDate(date) : null;
  const chosen = mode === "month" ? month : (attached ?? options?.suggested ?? "");
  const firstOpen = chosen ? firstOpenFor(chain, chosen) : earliest;
  const problem = chosen ? applicationMonthError({ month: chosen, firstOpen, date: mode === "date" ? date : null }) : null;
  const bounded = chain.mode === "SEPARATE" && chosen !== "" && chosen < chain.operationalStart;

  function send() {
    setError(null);
    start(async () => {
      const r = await requestRuleApplication({
        id: p.id,
        month: chosen,
        date: mode === "date" ? date : null,
        first_open: firstOpen,
      });
      if (!r.ok) return setError(r.error);
      onDone(
        `Décision D2 en attente : application à partir de la paie de ${frMonth(chosen)}. Le SUPER_ADMIN la confirme dans l'écran Décisions.`,
        r.data.decision_id,
      );
    });
  }

  return (
    <QuickDialog
      title="Date d'application (D2)"
      subtitle={p.title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Fermer
          </Button>
          <Button disabled={pending || !chosen || !!problem} onClick={send}>
            Demander la décision
          </Button>
        </>
      }
    >
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      <p className="text-sm text-foreground/70">
        Date d&apos;effet du texte : <b>{frDay(p.text_effective_date)}</b> · mois demandé :{" "}
        <b>{frMonth(p.requested_month)}</b>
        {chain.mode === "SEPARATE" ? (
          <>
            {" "}
            · reprise ouverte à partir de <b>{frMonth(chain.externalOpen ?? "2026-01-01")}</b>, paie opérationnelle à
            partir de <b>{frMonth(chain.operationalOpen)}</b>
          </>
        ) : earliest ? (
          <>
            {" "}
            · premier mois non validé : <b>{frMonth(earliest)}</b>
          </>
        ) : null}
        .
      </p>
      {bounded ? (
        <RhAlert tone="info">
          Chaînes de clôture séparées (D6) : appliquée à un mois de reprise, la règle s&apos;arrête au 31/08/2026 et ne
          change pas la paie opérationnelle.
        </RhAlert>
      ) : null}
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === "month"} onChange={() => setMode("month")} />À partir d&apos;un mois
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === "date"} onChange={() => setMode("date")} />À partir d&apos;une date
        </label>
      </div>
      {mode === "month" ? (
        <RhField label="Paie concernée à partir de" required>
          <input
            type="month"
            className={rhInput}
            value={month.slice(0, 7)}
            min={earliest?.slice(0, 7)}
            onChange={(e) => setMonth(e.target.value ? `${e.target.value}-01` : "")}
          />
        </RhField>
      ) : (
        <div className="space-y-3">
          <RhField label="Date" required hint="Le mois n'est jamais découpé : choisissez à quelle paie la date se rattache.">
            <input
              type="date"
              className={rhInput}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setAttached(null);
              }}
            />
          </RhField>
          {options ? (
            <div className="space-y-1 rounded-xl border border-border/60 p-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={chosen === options.suggested}
                  onChange={() => setAttached(options.suggested)}
                />
                Paie de {frMonth(options.suggested)}
                {options.alternative ? " (mois suivant la date, recommandé : pas de rétroactivité implicite)" : ""}
              </label>
              {options.alternative ? (
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={chosen === options.alternative}
                    onChange={() => setAttached(options.alternative)}
                  />
                  Paie de {frMonth(options.alternative)} (mois de la date, en entier)
                </label>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      {chosen && !problem ? (
        <RhAlert tone="info">
          La règle s&apos;appliquera à partir de la paie de <b>{frMonth(chosen)}</b>
          {mode === "date" && date ? ` (date ${frDay(date)})` : ""}. La décision D2 affiche les bulletins concernés par
          statut ; les bulletins validés ou clôturés restent inchangés.
        </RhAlert>
      ) : null}
      {problem ? <RhAlert tone="warning">{problem}</RhAlert> : null}
    </QuickDialog>
  );
}
