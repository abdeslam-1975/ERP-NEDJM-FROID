"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { proposeZoneScope, type ZoneScopeCatalog, type ZoneScopeRow } from "@/lib/actions/rule-proposals";
import type { LegalPeriod } from "@/lib/actions/hr-legal-vars";
import { frDay, frMonth } from "@/lib/rules/proposals";
import { suggestWilayaCode } from "@/lib/referentiels/wilaya-match";
import {
  ProposalNotice,
  QuickDialog,
  RuleSourceFields,
  emptyRuleSource,
  type RuleSourceForm,
} from "@/components/rules/rule-ui";
import { Button } from "@/components/ui/button";
import { RhAlert, RhChip, RhField, RhTableWrap, rhInput, rhSelect, rhTd, rhTh } from "@/components/rh/rh-ui";

type Grouping = { key: string; label: string; codes: string[] };

function scopeAt(scopes: ZoneScopeRow[], zone: string, month: string) {
  return scopes.find(
    (s) => s.zone_code === zone && s.effective_from <= month && (!s.effective_to || s.effective_to >= month),
  );
}

function catalogCodes(labels: string[]) {
  return labels.map((l) => suggestWilayaCode(l)).filter((c): c is string => !!c);
}

/** D16: wilayas covered by an IRG zone, dated from a month; legal content, so proposed then approved. */
export function IrgZoneScopes({
  catalog,
  canEdit,
  period,
}: {
  catalog: ZoneScopeCatalog;
  canEdit: boolean;
  period: LegalPeriod;
}) {
  const [dialog, setDialog] = useState<string | null>(null);
  const month = period.month_start;
  const names = useMemo(() => new Map(catalog.wilayas.map((w) => [w.code, w.name_fr])), [catalog.wilayas]);
  const wilayaText = (codes: string[]) => codes.map((c) => `${c} ${names.get(c) ?? ""}`.trim()).join(", ");

  const groupings = useMemo<Grouping[]>(() => {
    const list: Grouping[] = catalog.scopes.map((s) => ({
      key: `${s.zone_code}@${s.effective_from}`,
      label: `Zone ${s.zone_code} dès ${frMonth(s.effective_from)} (${s.wilaya_codes.length} wilayas)`,
      codes: s.wilaya_codes,
    }));
    for (const z of catalog.zones) {
      const codes = catalogCodes(z.catalog_wilayas);
      if (codes.length) {
        list.push({ key: `${z.code}@catalogue`, label: `Zone ${z.code}, liste du catalogue (${codes.length} wilayas)`, codes });
      }
    }
    return list;
  }, [catalog]);

  return (
    <div>
      <h3 className="font-semibold">Portée des zones IRG (wilayas concernées)</h3>
      <p className="mt-1 text-xs text-foreground/55">
        Une portée datée remplace la liste du catalogue à partir de son mois. Le choix de zone fait sur le site reste
        prioritaire. Chaque changement de portée est une proposition : approbation, puis décision D2.
      </p>
      <div className="mt-3">
        <RhTableWrap>
          <table className="min-w-full text-sm">
            <thead className="border-b border-border/70 bg-surface-muted/80">
              <tr>
                <th className={rhTh()}>Zone</th>
                <th className={rhTh()}>Wilayas · paie de {frMonth(month)}</th>
                <th className={rhTh()}>À venir</th>
                {canEdit ? <th className={rhTh()} /> : null}
              </tr>
            </thead>
            <tbody>
              {!catalog.zones.length ? (
                <tr>
                  <td className={`${rhTd()} text-foreground/55`} colSpan={canEdit ? 4 : 3}>
                    Aucune zone IRG active.
                  </td>
                </tr>
              ) : null}
              {catalog.zones.map((z) => {
                const current = scopeAt(catalog.scopes, z.code, month);
                const future = catalog.scopes
                  .filter((s) => s.zone_code === z.code && s.effective_from > month)
                  .sort((a, b) => a.effective_from.localeCompare(b.effective_from));
                return (
                  <tr key={z.code} className="border-b border-border/60 align-top">
                    <td className={rhTd()}>
                      <span className="font-medium">{z.label_fr}</span>
                      <span className="mt-0.5 block font-mono text-xs text-foreground/55">{z.code}</span>
                    </td>
                    <td className={rhTd()}>
                      {current ? (
                        <>
                          <RhChip tone="success">Portée approuvée dès {frMonth(current.effective_from)}</RhChip>
                          <span className="mt-1 block text-xs">{wilayaText(current.wilaya_codes)}</span>
                          {current.scope_mode === "GROUP" && current.group_from ? (
                            <span className="mt-0.5 block text-xs text-foreground/55">
                              Reprise du groupement {current.group_from}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <RhChip tone="warning">Catalogue, non daté</RhChip>
                          <span className="mt-1 block text-xs">
                            {z.catalog_wilayas.length ? z.catalog_wilayas.join(", ") : "Aucune wilaya"}
                          </span>
                        </>
                      )}
                    </td>
                    <td className={rhTd()}>
                      {future.length ? (
                        <ul className="space-y-1 text-xs">
                          {future.map((s) => (
                            <li key={s.id}>
                              <RhChip tone="warning">
                                Dès {frMonth(s.effective_from)} : {s.wilaya_codes.length} wilayas
                              </RhChip>
                              {s.effective_to ? <span className="ml-1">jusqu&apos;au {frDay(s.effective_to)}</span> : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-foreground/40">—</span>
                      )}
                    </td>
                    {canEdit ? (
                      <td className={`${rhTd()} whitespace-nowrap text-right`}>
                        <Button variant="secondary" onClick={() => setDialog(z.code)}>
                          Proposer une portée
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </RhTableWrap>
      </div>
      {dialog ? (
        <ZoneScopeDialog
          zone={catalog.zones.find((z) => z.code === dialog)!}
          initialCodes={
            scopeAt(catalog.scopes, dialog, month)?.wilaya_codes ??
            catalogCodes(catalog.zones.find((z) => z.code === dialog)?.catalog_wilayas ?? [])
          }
          wilayas={catalog.wilayas}
          groupings={groupings}
          period={period}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}

function ZoneScopeDialog({
  zone,
  initialCodes,
  wilayas,
  groupings,
  period,
  onClose,
}: {
  zone: ZoneScopeCatalog["zones"][number];
  initialCodes: string[];
  wilayas: ZoneScopeCatalog["wilayas"];
  groupings: Grouping[];
  period: LegalPeriod;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"WILAYAS" | "GROUP">("WILAYAS");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialCodes));
  const [group, setGroup] = useState(groupings[0]?.key ?? "");
  const [from, setFrom] = useState(period.default_from);
  const [source, setSource] = useState<RuleSourceForm>(emptyRuleSource);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const grouping = groupings.find((g) => g.key === group);
  const codes = mode === "GROUP" ? (grouping?.codes ?? []) : [...selected].sort();
  const visible = wilayas.filter((w) => {
    const q = filter.trim().toLowerCase();
    return !q || w.code.includes(q) || w.name_fr.toLowerCase().includes(q);
  });

  function toggle(code: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function submit() {
    setError(null);
    if (!codes.length) return setError("Sélectionnez au moins une wilaya.");
    if (!from) return setError("Choisissez le mois demandé.");
    start(async () => {
      const r = await proposeZoneScope({
        zone_code: zone.code,
        mode,
        group_from: mode === "GROUP" ? group : null,
        wilayas: codes,
        requested_month: from,
        ...source,
      });
      if (!r.ok) return setError(r.error);
      setDone(r.data.message);
      router.refresh();
    });
  }

  return (
    <QuickDialog
      title={`Portée de la zone ${zone.code}`}
      subtitle={zone.label_fr}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Fermer
          </Button>
          {!done ? (
            <Button disabled={pending || !codes.length} onClick={submit}>
              Proposer ({codes.length} wilayas)
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
          <ProposalNotice />
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" checked={mode === "WILAYAS"} onChange={() => setMode("WILAYAS")} />
              Choisir les wilayas
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={mode === "GROUP"}
                disabled={!groupings.length}
                onChange={() => setMode("GROUP")}
              />
              Reprendre un groupement enregistré
            </label>
          </div>
          {mode === "GROUP" ? (
            <RhField label="Groupement repris" required>
              <select className={rhSelect} value={group} onChange={(e) => setGroup(e.target.value)}>
                {groupings.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label}
                  </option>
                ))}
              </select>
            </RhField>
          ) : (
            <div className="space-y-2">
              <input
                className={rhInput}
                placeholder="Filtrer (code ou nom)"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <div className="grid max-h-56 grid-cols-2 gap-1 overflow-y-auto rounded-xl border border-border/60 p-2 text-sm sm:grid-cols-3">
                {visible.map((w) => (
                  <label key={w.code} className="flex items-center gap-2">
                    <input type="checkbox" checked={selected.has(w.code)} onChange={() => toggle(w.code)} />
                    <span className="font-mono text-xs">{w.code}</span> {w.name_fr}
                  </label>
                ))}
              </div>
            </div>
          )}
          {codes.length ? (
            <p className="text-xs text-foreground/60">
              {codes.length} wilaya(s) : {codes.join(", ")}
            </p>
          ) : null}
          <RhField
            label="Demandé à partir de la paie de"
            required
            hint="La date d'application est décidée après approbation (D2)."
          >
            <input
              className={rhInput}
              type="month"
              value={from.slice(0, 7)}
              min={period.open_from?.slice(0, 7)}
              onChange={(e) => setFrom(e.target.value ? `${e.target.value}-01` : "")}
            />
          </RhField>
          <RuleSourceFields value={source} onChange={setSource} />
        </>
      )}
    </QuickDialog>
  );
}
