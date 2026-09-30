"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { RhAlert, RhChip, RhField, RhModal, rhInput } from "@/components/rh/rh-ui";
import { DeclarationExportsTable, ExternalOperationsList } from "@/components/rh/external-registers";
import { getDeclarationExportPlan, requestDeclarationDecision } from "@/lib/actions/hr-declarations";
import { decisionStatusLabel } from "@/lib/decisions/catalog";
import {
  declarationKindLabel,
  declarationReasonLabel,
  monthsLabel,
  repriseBanner,
  type DeclarationKind,
  type DeclarationPlan,
} from "@/lib/hr/external-operations";

const D10_OPTIONS: Record<string, string> = {
  EXCLUDE: "Exclure les mois concernés",
  CONTROL: "État de contrôle interne",
  OFFICIAL: "Fichier officiel — risque de double déclaration",
};

export type DeclarationExportTarget = {
  kind: DeclarationKind;
  year: number;
  month: number | null;
  siteId: string | null;
  siteName?: string;
};

function exportQuery(t: DeclarationExportTarget, decisionId: string | null) {
  const q = new URLSearchParams({ kind: t.kind, year: String(t.year) });
  if (t.month) q.set("month", String(t.month));
  if (t.siteId) q.set("site", t.siteId);
  if (decisionId) q.set("decision", decisionId);
  return q.toString();
}

/** Every declaration export goes through this dialog: plan (D10 guard), registers, then the file. */
export function DeclarationExportDialog({
  target,
  onClose,
  onDone,
}: {
  target: DeclarationExportTarget;
  onClose: () => void;
  onDone?: (message: string) => void;
}) {
  const [plan, setPlan] = useState<DeclarationPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [requested, setRequested] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [exporting, setExporting] = useState(false);

  const decided = plan?.open_decision?.status === "DECIDED" ? plan.open_decision : null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await getDeclarationExportPlan({
        kind: target.kind,
        year: target.year,
        month: target.month,
        site_id: target.siteId,
      });
      if (cancelled) return;
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (r.data.open_decision?.status === "DECIDED") {
        const withDecision = await getDeclarationExportPlan({
          kind: target.kind,
          year: target.year,
          month: target.month,
          site_id: target.siteId,
          decision_id: r.data.open_decision.id,
        });
        if (cancelled) return;
        setPlan(withDecision.ok ? withDecision.data : r.data);
        if (!withDecision.ok) setError(withDecision.error);
        return;
      }
      setPlan(r.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [target]);

  function requestD10() {
    setError(null);
    start(async () => {
      const r = await requestDeclarationDecision({
        kind: target.kind,
        year: target.year,
        month: target.month,
        site_id: target.siteId,
        reason,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setRequested(r.data.id);
    });
  }

  async function produce() {
    if (!plan) return;
    setError(null);
    setExporting(true);
    try {
      const res = await fetch(`/api/rh/declarations?${exportQuery(target, decided?.id ?? null)}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `Export impossible (${res.status}).`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (target.kind === "g50") {
        window.open(url, "_blank", "noopener");
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        const fileName =
          /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "declaration";
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
      }
      onDone?.("Fichier produit et inscrit au registre des exports de déclaration.");
      onClose();
    } catch {
      setError("Export impossible : connexion interrompue. · تعذّر التصدير.");
    } finally {
      setExporting(false);
    }
  }

  const period = target.month ? `${String(target.month).padStart(2, "0")}/${target.year}` : `Année ${target.year}`;
  const reprise = plan?.required_months.some((m) => (plan.month_reasons[String(m)] ?? []).includes("EXTERNAL_PERIOD"));
  const needsDecision = Boolean(plan && plan.required_months.length);
  const officialBefore = plan?.prior_exports.filter((e) => e.nature === "OFFICIAL") ?? [];

  return (
    <RhModal
      title={`${declarationKindLabel(target.kind)} · ${period}`}
      subtitle={target.siteName ?? (target.siteId ? "Chantier" : "Tous les chantiers")}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
          {plan && !plan.blocked ? (
            <Button disabled={exporting || pending} onClick={produce}>
              {decided
                ? `Produire (D10 · ${D10_OPTIONS[decided.option ?? ""] ?? decided.option}) — une seule fois`
                : target.kind === "g50"
                  ? "Produire et imprimer"
                  : "Produire le fichier"}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-3 p-2 text-sm">
        {reprise ? <RhAlert tone="warning">{repriseBanner("declaration")}</RhAlert> : null}
        {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
        {!plan && !error ? <p className="text-foreground/60">Vérification du registre et des décisions…</p> : null}
        {plan ? (
          <>
            {needsDecision ? (
              <div className="space-y-1">
                <p className="font-semibold">Mois soumis à décision D10</p>
                <ul className="space-y-0.5">
                  {plan.required_months.map((m) => (
                    <li key={m} className="flex flex-wrap items-center gap-2">
                      <span>{monthsLabel(plan.year, [m])}</span>
                      {(plan.month_reasons[String(m)] ?? []).map((r) => (
                        <RhChip key={r} tone="warning">
                          {declarationReasonLabel(r)}
                        </RhChip>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {plan.blocked ? (
              <RhAlert tone="danger">{plan.message ?? "Export bloqué : décision D10 requise."}</RhAlert>
            ) : decided ? (
              <RhAlert tone={plan.option === "OFFICIAL" ? "danger" : "info"}>
                Décision D10 : {D10_OPTIONS[plan.option ?? ""] ?? plan.option}. Mois inclus : {monthsLabel(plan.year, plan.months)}
                {plan.excluded_months.length ? ` · exclus : ${monthsLabel(plan.year, plan.excluded_months)}` : ""}
                {plan.nature === "CONTROL" ? " · fichier marqué « ÉTAT DE CONTRÔLE — non déclaratif »" : ""}.
              </RhAlert>
            ) : null}

            {plan.blocked && plan.open_decision?.status === "PENDING" ? (
              <RhAlert tone="info">
                Décision D10 {decisionStatusLabel("PENDING").toLowerCase()}.{" "}
                <Link href={`/decisions/${plan.open_decision.id}`} className="font-semibold underline">
                  Ouvrir la décision
                </Link>
              </RhAlert>
            ) : null}

            {plan.blocked && !plan.open_decision ? (
              requested ? (
                <RhAlert tone="success">
                  Décision D10 demandée : aucun fichier tant qu&apos;elle n&apos;est pas tranchée.{" "}
                  <Link href={`/decisions/${requested}`} className="font-semibold underline">
                    Ouvrir la décision
                  </Link>
                </RhAlert>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <RhField label="Motif de la demande D10" hint="10 à 500 caractères">
                    <input
                      className={`${rhInput} min-w-80`}
                      value={reason}
                      maxLength={500}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </RhField>
                  <Button variant="secondary" disabled={pending || reason.trim().length < 10} onClick={requestD10}>
                    Demander la décision D10
                  </Button>
                </div>
              )
            ) : null}

            {officialBefore.length ? (
              <RhAlert tone="warning">
                {officialBefore.length} fichier(s) officiel(s) déjà produit(s) dans l&apos;application sur cette période : vérifiez
                qu&apos;il ne s&apos;agit pas d&apos;une double déclaration.
              </RhAlert>
            ) : null}

            <div>
              <p className="mb-1 font-semibold">Registre des exports de l&apos;application</p>
              <DeclarationExportsTable exports={plan.prior_exports} emptyLabel="Aucun fichier produit sur cette période." />
            </div>
            <div>
              <p className="mb-1 font-semibold">Déclarations externes enregistrées</p>
              <ExternalOperationsList operations={plan.external_operations} emptyLabel="Aucune déclaration externe enregistrée." />
            </div>
          </>
        ) : null}
      </div>
    </RhModal>
  );
}
