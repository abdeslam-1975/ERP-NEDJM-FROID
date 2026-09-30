"use client";

import { useEffect, useState, useTransition } from "react";
import {
  changeSiteWilaya,
  confirmSiteWilaya,
  deleteSiteWilayaChange,
  listSiteWilayaHistory,
  type SiteWilayaPanel,
  type SiteWilayaVersion,
} from "@/lib/actions/site-wilaya";
import { Button } from "@/components/ui/button";
import { WILAYAS } from "@/lib/referentiels/wilayas";

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand";

function frDate(iso: string) {
  return iso.slice(0, 10).split("-").reverse().join("/");
}

function WilayaSelect({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  return (
    <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {WILAYAS.map((w) => (
        <option key={w.code} value={w.code}>
          {w.code} · {w.name}
        </option>
      ))}
    </select>
  );
}

export function SiteWilayaHistory({
  siteId,
  legacyText,
  suggestedCode,
  onChanged,
}: {
  siteId: string;
  /** Free-text wilaya of a site not confirmed yet. */
  legacyText: string | null;
  suggestedCode: string | null;
  onChanged?: (current: { code: string; name: string }) => void;
}) {
  const [panel, setPanel] = useState<SiteWilayaPanel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState({ code: suggestedCode ?? "", reason: "" });
  const [draft, setDraft] = useState({ month: "", code: "", reason: "", document_ref: "" });
  const [pending, start] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    let cancelled = false;
    listSiteWilayaHistory(siteId).then((r) => {
      if (cancelled) return;
      if (r.ok) {
        setPanel(r.data);
        setDraft((d) => ({ ...d, month: r.data.first_changeable.slice(0, 7) }));
      } else setError(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  async function reload() {
    const r = await listSiteWilayaHistory(siteId);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setPanel(r.data);
    const current = r.data.rows.find((row) => row.effective_from <= today);
    if (current) onChanged?.({ code: current.wilaya_code, name: current.wilaya_name });
  }

  function run(action: () => Promise<{ ok: true; data: { warning: string | null; payroll_notice?: string | null } } | { ok: false; error: string }>, done: string) {
    setError(null);
    setNotice(null);
    start(async () => {
      const r = await action();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setNotice([done, r.data.payroll_notice, r.data.warning].filter(Boolean).join("\n"));
      await reload();
    });
  }

  if (error && !panel) return <p className="text-sm text-alert-critical">{error}</p>;
  if (!panel) return <p className="text-sm text-foreground/55">Chargement…</p>;

  const rows = panel.rows;
  const current = rows.find((r) => r.effective_from <= today) ?? null;
  const open = panel.first_changeable;
  const origin = rows.length ? rows[rows.length - 1].id : null;

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <p className="text-sm font-semibold">Wilaya datée</p>
      {error ? <p className="text-sm text-alert-critical">{error}</p> : null}
      {notice ? <p className="whitespace-pre-wrap text-sm text-emerald-700">{notice}</p> : null}

      {rows.length === 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-foreground/65">
            Wilaya non confirmée{legacyText ? ` (saisie libre : « ${legacyText} »)` : ""}. Confirmez la wilaya codée dans
            laquelle ce chantier a toujours été : elle s&apos;applique depuis l&apos;origine et détermine la zone IRG des mois.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <WilayaSelect value={confirm.code} onChange={(code) => setConfirm({ ...confirm, code })} />
            <input
              className={inputClass}
              placeholder="Motif (ex. reprise du référentiel)"
              value={confirm.reason}
              onChange={(e) => setConfirm({ ...confirm, reason: e.target.value })}
            />
          </div>
          <div className="flex justify-end">
            <Button
              disabled={pending || !confirm.code || confirm.reason.trim().length < 3}
              onClick={() =>
                run(
                  () => confirmSiteWilaya({ site_id: siteId, wilaya_code: confirm.code, reason: confirm.reason }),
                  "Wilaya confirmée.",
                )
              }
            >
              Confirmer la wilaya
            </Button>
          </div>
        </div>
      ) : (
        <>
          <ul className="space-y-1 text-sm">
            {rows.map((r: SiteWilayaVersion) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {r.id === origin ? "Depuis l'origine" : `À partir du ${frDate(r.effective_from)}`}
                </span>
                <span>
                  {r.wilaya_code} · {r.wilaya_name}
                </span>
                {current?.id === r.id ? <span className="text-xs font-semibold text-emerald-700">en vigueur</span> : null}
                {r.effective_from > today ? <span className="text-xs font-semibold text-amber-700">à venir</span> : null}
                <span className="text-xs text-foreground/55">
                  {r.reason}
                  {r.document_ref ? ` · ${r.document_ref}` : ""}
                  {r.author_name ? ` · ${r.author_name}` : ""}
                </span>
                {r.id !== origin && r.effective_from >= open ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-alert-critical underline"
                    disabled={pending}
                    onClick={() => {
                      if (window.confirm(`Supprimer le changement du ${frDate(r.effective_from)} ?`)) {
                        run(() => deleteSiteWilayaChange({ id: r.id }), "Changement supprimé.");
                      }
                    }}
                  >
                    Supprimer
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="space-y-2 border-t border-border pt-2">
            <p className="text-xs text-foreground/65">
              Changement officiel (ex. nouveau découpage) : effet au 1er d&apos;un mois, à partir du {frDate(open)} ; les
              mois antérieurs ne changent pas.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="month"
                className={inputClass}
                min={open.slice(0, 7)}
                value={draft.month}
                onChange={(e) => setDraft({ ...draft, month: e.target.value })}
              />
              <WilayaSelect value={draft.code} onChange={(code) => setDraft({ ...draft, code })} />
              <input
                className={inputClass}
                placeholder="Motif"
                value={draft.reason}
                onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              />
              <input
                className={inputClass}
                placeholder="Document (réf.)"
                value={draft.document_ref}
                onChange={(e) => setDraft({ ...draft, document_ref: e.target.value })}
              />
            </div>
            <div className="flex justify-end">
              <Button
                variant="secondary"
                disabled={pending || !draft.month || !draft.code || draft.reason.trim().length < 3}
                onClick={() =>
                  run(
                    () =>
                      changeSiteWilaya({
                        site_id: siteId,
                        wilaya_code: draft.code,
                        effective_from: `${draft.month}-01`,
                        reason: draft.reason,
                        document_ref: draft.document_ref,
                      }),
                    "Changement de wilaya enregistré.",
                  )
                }
              >
                Enregistrer le changement
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
