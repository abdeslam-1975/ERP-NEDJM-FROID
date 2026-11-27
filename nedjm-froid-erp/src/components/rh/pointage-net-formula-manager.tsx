"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { savePointageNetFormula, type PointageNetFormula } from "@/lib/actions/hr-pointage-net";
import {
  POINTAGE_NET_DEFAULT_RULES,
  pointageNetFormula,
  pointageNetFormulaAr,
  type PointageNetEffect,
  type PointageNetRule,
} from "@/lib/hr/pointage-net";
import { Button } from "@/components/ui/button";
import { RhAlert, RhPanel, RhSectionTitle } from "@/components/rh/rh-ui";

const EFFECTS: { id: "" | PointageNetEffect; label: string }[] = [
  { id: "", label: "Hors formule" },
  { id: "PMS", label: "Présence (P/MS)" },
  { id: "CRP", label: "Récupération (CRP)" },
  { id: "SANCTION", label: "Sanction Sonatrach" },
  { id: "NONE", label: "Classé, sans effet" },
];

const DEFAULT_RANK = new Map(POINTAGE_NET_DEFAULT_RULES.map((rule, index) => [rule.code, index]));

function rank(code: string) {
  return DEFAULT_RANK.get(code) ?? 1000;
}

export function PointageNetFormulaManager({ initial }: { initial: PointageNetFormula }) {
  const router = useRouter();
  const stored = initial.rules ?? [...POINTAGE_NET_DEFAULT_RULES];
  const [effects, setEffects] = useState<Record<string, PointageNetEffect | "">>(() => {
    const map: Record<string, PointageNetEffect | ""> = {};
    for (const rule of stored) map[rule.code] = rule.effect;
    return map;
  });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{ tone: "warning" | "success"; text: string } | null>(
    initial.rules == null
      ? {
          tone: "warning",
          text: "La base n'a pas encore la table de la formule. L'affichage ci-dessous est la formule d'origine.",
        }
      : null,
  );
  const [pending, start] = useTransition();

  const rows = useMemo(() => {
    return [...initial.legends].sort((a, b) => rank(a.code) - rank(b.code) || a.code.localeCompare(b.code, "fr"));
  }, [initial.legends]);

  const draft = useMemo<PointageNetRule[]>(() => {
    return rows.flatMap((row) => {
      const effect = effects[row.code];
      return effect ? [{ code: row.code, effect }] : [];
    });
  }, [rows, effects]);

  function save() {
    setError(null);
    setInfo(null);
    start(async () => {
      const result = await savePointageNetFormula({ rules: draft });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInfo({ tone: "success", text: "Formule enregistrée. Le net du pointage l'utilise tout de suite." });
      router.refresh();
    });
  }

  return (
    <RhPanel>
      <RhSectionTitle>Formule du net à payer</RhSectionTitle>
      <p className="mt-2 text-sm text-foreground/70">
        Chaque légende a un effet. Présence et récupération ajoutent un salaire journalier. Sanction Sonatrach le
        retire. Un code hors formule ne change pas le montant et demande à être classé.
      </p>
      <p className="mt-3 rounded-xl bg-surface-muted px-3 py-2 text-sm font-medium text-foreground">
        {pointageNetFormula(draft)}
        <span className="mt-1 block font-normal text-foreground/70">{pointageNetFormulaAr(draft)}</span>
      </p>
      {error ? (
        <div className="mt-3">
          <RhAlert tone="danger">{error}</RhAlert>
        </div>
      ) : null}
      {info ? (
        <div className="mt-3">
          <RhAlert tone={info.tone}>{info.text}</RhAlert>
        </div>
      ) : null}
      <div className="mt-4 overflow-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-foreground/55">
              <th className="px-2 py-2">Code</th>
              <th className="px-2 py-2">Légende</th>
              <th className="px-2 py-2">Effet dans le net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.code} className="border-t border-border/60">
                <td className="px-2 py-1.5 font-semibold">{row.code}</td>
                <td className="px-2 py-1.5 text-foreground/80">
                  {row.label_fr}
                  {row.label_ar ? <span className="text-foreground/55"> · {row.label_ar}</span> : null}
                </td>
                <td className="px-2 py-1.5">
                  <select
                    className="h-9 w-full max-w-xs rounded-lg border border-border/70 bg-surface px-2 text-sm outline-none focus:border-brand"
                    value={effects[row.code] ?? ""}
                    disabled={!initial.canEdit || pending}
                    onChange={(event) =>
                      setEffects((prev) => ({
                        ...prev,
                        [row.code]: event.target.value as PointageNetEffect | "",
                      }))
                    }
                  >
                    {EFFECTS.map((effect) => (
                      <option key={effect.id || "out"} value={effect.id}>
                        {effect.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {initial.canEdit ? (
        <div className="mt-4">
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer la formule"}
          </Button>
        </div>
      ) : null}
    </RhPanel>
  );
}
