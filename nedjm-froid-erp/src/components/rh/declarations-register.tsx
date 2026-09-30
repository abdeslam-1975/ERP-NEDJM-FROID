"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RhAlert, RhField, RhPageHeader, RhPanel, RhToolbar, bi, rhInput } from "@/components/rh/rh-ui";
import { DeclarationExportsTable } from "@/components/rh/external-registers";
import { DeclarationExportDialog, type DeclarationExportTarget } from "@/components/rh/declaration-export-dialog";
import type { DeclarationDecisionScope } from "@/lib/actions/hr-declarations";
import {
  DECLARATION_KINDS,
  NO_TRACE_NOTICE,
  declarationKindLabel,
  type DeclarationExport,
  type DeclarationKind,
} from "@/lib/hr/external-operations";

type SiteOpt = { id: string; name_fr: string };

export function DeclarationsRegister({
  exports,
  year,
  sites,
  canExport,
  decision,
  loadError,
}: {
  exports: DeclarationExport[];
  year: number;
  sites: SiteOpt[];
  canExport: boolean;
  decision: DeclarationDecisionScope | null;
  loadError?: string;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<DeclarationExportTarget | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [kind, setKind] = useState<DeclarationKind>("monthly");
  const [month, setMonth] = useState(1);
  const [siteId, setSiteId] = useState("");
  const annual = kind === "das" || kind === "das_file";
  const siteName = (id: string | null) => (id ? sites.find((s) => s.id === id)?.name_fr : undefined);

  return (
    <div className="space-y-5">
      <RhPageHeader
        title={bi("Registre des exports de déclaration", "سجل تصدير التصريحات")}
        description={
          <>
            Chaque fichier de déclaration produit par l&apos;application (officiel ou état de contrôle) y est inscrit avec son
            empreinte, son auteur et, le cas échéant, sa décision D10. Les déclarations faites hors de l&apos;application
            relèvent du{" "}
            <Link href="/rh/paie/operations-externes" className="font-semibold text-brand hover:underline">
              registre des opérations externes
            </Link>
            . {NO_TRACE_NOTICE}
          </>
        }
      />
      {loadError ? <RhAlert tone="danger">{loadError}</RhAlert> : null}
      {info ? <RhAlert tone="success">{info}</RhAlert> : null}

      {decision ? (
        <RhPanel>
          <p className="font-semibold">
            Décision D10 · {declarationKindLabel(decision.kind)} ·{" "}
            {decision.month ? `${String(decision.month).padStart(2, "0")}/${decision.year}` : `Année ${decision.year}`} ·{" "}
            {siteName(decision.site_id) ?? "Tous les chantiers"}
          </p>
          {decision.status === "DECIDED" && canExport ? (
            <div className="mt-2">
              <Button
                onClick={() =>
                  setTarget({
                    kind: decision.kind,
                    year: decision.year,
                    month: decision.month,
                    siteId: decision.site_id,
                    siteName: siteName(decision.site_id),
                  })
                }
              >
                Produire le fichier de la décision (une seule fois)
              </Button>
            </div>
          ) : (
            <p className="mt-1 text-sm text-foreground/65">
              Cette décision n&apos;est pas (ou plus) à exécuter.{" "}
              <Link href={`/decisions/${decision.id}`} className="font-semibold text-brand hover:underline">
                Ouvrir la décision
              </Link>
            </p>
          )}
        </RhPanel>
      ) : null}

      <RhToolbar>
        <RhField label={bi("Année", "السنة")}>
          <input
            className={rhInput}
            type="number"
            defaultValue={year}
            onBlur={(e) => Number(e.target.value) !== year && (window.location.search = `?year=${Number(e.target.value)}`)}
          />
        </RhField>
        {canExport ? (
          <>
            <RhField label="Nouvel export">
              <select className={rhInput} value={kind} onChange={(e) => setKind(e.target.value as DeclarationKind)}>
                {DECLARATION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {declarationKindLabel(k)}
                  </option>
                ))}
              </select>
            </RhField>
            {!annual ? (
              <RhField label={bi("Mois", "الشهر")}>
                <select className={rhInput} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {String(m).padStart(2, "0")}
                    </option>
                  ))}
                </select>
              </RhField>
            ) : null}
            {kind === "monthly" ? (
              <RhField label={bi("Chantier", "الورشة")}>
                <select className={rhInput} value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                  <option value="">Tous les chantiers</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name_fr}
                    </option>
                  ))}
                </select>
              </RhField>
            ) : null}
            <Button
              variant="secondary"
              onClick={() =>
                setTarget({
                  kind,
                  year,
                  month: annual ? null : month,
                  siteId: kind === "monthly" && siteId ? siteId : null,
                  siteName: kind === "monthly" ? siteName(siteId || null) : undefined,
                })
              }
            >
              Préparer l&apos;export
            </Button>
          </>
        ) : null}
      </RhToolbar>

      <RhPanel>
        <DeclarationExportsTable exports={exports} emptyLabel={`Aucun fichier de déclaration produit pour ${year}.`} />
      </RhPanel>

      {target ? (
        <DeclarationExportDialog
          target={target}
          onClose={() => setTarget(null)}
          onDone={(message) => {
            setInfo(message);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
