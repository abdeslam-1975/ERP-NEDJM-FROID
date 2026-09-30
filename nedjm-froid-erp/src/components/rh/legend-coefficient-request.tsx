"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { requestLegendCoefficientChange, type LegendRow } from "@/lib/actions/hr-catalogs";
import { Button } from "@/components/ui/button";
import {
  formatLegendCoefficient,
  sanitizeLegendCoefficientInput,
  scheduledLegendCoefficients,
} from "@/lib/hr/legend-coefficient";
import { RhAlert, RhField, rhInput } from "@/components/rh/rh-ui";

function nextMonth(): string {
  const d = new Date();
  const m = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
}

const monthLabel = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** D14: a new coefficient takes effect only from the month chosen by the decision maker. */
export function LegendCoefficientRequest({ legend }: { legend: LegendRow | null }) {
  const [coefficient, setCoefficient] = useState("");
  const [month, setMonth] = useState(nextMonth);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [decisionId, setDecisionId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!legend) return null;
  const today = new Date().toISOString().slice(0, 10);
  const scheduled = scheduledLegendCoefficients(legend.coefficient_versions, today);

  return (
    <div className="mt-4 rounded-2xl border border-border/70 bg-surface-muted/40 p-3">
      <p className="text-sm font-semibold">
        Changer le coefficient de {legend.code} (en vigueur ce mois : {formatLegendCoefficient(legend.coefficient)})
      </p>
      <p className="mt-1 text-xs text-foreground/60">
        Le changement est une demande : il ne s&apos;applique qu&apos;après la décision D14, à partir du mois choisi. Les
        mois déjà validés ou clôturés gardent l&apos;ancien coefficient ; les paies brouillon concernées seront signalées
        (recalcul sur décision D3).
      </p>
      {scheduled.length ? (
        <p className="mt-1 text-xs text-foreground/70">
          Déjà programmé :{" "}
          {scheduled.map((v) => `${formatLegendCoefficient(v.coefficient)} à partir de ${monthLabel(v.effective_from)}`).join(" ; ")}
        </p>
      ) : null}
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <RhField label="Nouveau coefficient" required>
          <input
            className={rhInput}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,5"
            value={coefficient}
            onChange={(e) => setCoefficient(sanitizeLegendCoefficientInput(e.target.value))}
          />
        </RhField>
        <RhField label="Mois d'effet demandé" required>
          <input className={rhInput} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </RhField>
        <div className="sm:col-span-2">
          <RhField label="Motif (10 caractères minimum)" required>
            <input className={rhInput} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          </RhField>
        </div>
      </div>
      {error ? (
        <div className="mt-3">
          <RhAlert>{error}</RhAlert>
        </div>
      ) : null}
      {decisionId ? (
        <div className="mt-3">
          <RhAlert tone="success">
            Demande enregistrée : aucun effet tant que la décision D14 n&apos;est pas prise.{" "}
            <Link className="font-semibold underline" href={`/decisions/${decisionId}`}>
              Ouvrir la décision
            </Link>
          </RhAlert>
        </div>
      ) : null}
      <div className="mt-3">
        <Button
          disabled={pending}
          onClick={() => {
            setError(null);
            setDecisionId(null);
            start(async () => {
              const r = await requestLegendCoefficientChange({
                legend_id: legend.id,
                coefficient,
                month,
                reason,
              });
              if (!r.ok) {
                setError(r.error);
                return;
              }
              setDecisionId(r.data.decision_id);
            });
          }}
        >
          Demander le changement (D14)
        </Button>
      </div>
    </div>
  );
}
