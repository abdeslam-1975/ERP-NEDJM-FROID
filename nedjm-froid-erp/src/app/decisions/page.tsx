import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { RhAlert, RhChip, RhEmpty, RhPageHeader, RhTableWrap, rhTd, rhTh } from "@/components/rh/rh-ui";
import { listDecisions } from "@/lib/actions/decisions";
import {
  decisionStatusLabel,
  decisionStatusTone,
  payrollSourceLabel,
  periodLabel,
} from "@/lib/decisions/catalog";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "open", label: "À traiter" },
  { id: "closed", label: "Décisions confirmées et closes" },
] as const;

const TYPES = [
  { id: "", label: "Tous les types" },
  { id: "D4", label: "D4 · Génération de paie" },
  { id: "D3", label: "D3 · Recalcul des paies brouillon" },
] as const;

function dateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-DZ", { dateStyle: "short", timeStyle: "short" });
}

function href(tab: string, type: string) {
  const qs = new URLSearchParams({ tab });
  if (type) qs.set("type", type);
  return `/decisions?${qs.toString()}`;
}

export default async function DecisionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const tab = sp.tab === "closed" ? "closed" : "open";
  const type = sp.type === "D3" || sp.type === "D4" ? sp.type : "";
  const res = await listDecisions({ tab, type: type || undefined });
  const rows = res.ok ? res.data : [];

  return (
    <AppShell title="Centre de décisions">
      <div className="space-y-5">
        <RhPageHeader
          title="Centre de décisions"
          description="Les opérations de paie ne s'exécutent jamais d'elles-mêmes : chaque génération ou recalcul attend ici une décision motivée, enregistrée et tracée."
        />
        {!res.ok ? <RhAlert tone="danger">{res.error}</RhAlert> : null}
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={href(t.id, type)}
              className={`rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                t.id === tab ? "bg-brand text-white" : "border border-border/70 bg-surface text-foreground/70 hover:bg-surface-muted"
              }`}
            >
              {t.label}
            </Link>
          ))}
          <span className="mx-1 h-6 w-px bg-border" aria-hidden />
          {TYPES.map((t) => (
            <Link
              key={t.id || "all"}
              href={href(tab, t.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                t.id === type ? "bg-brand-muted text-brand" : "text-foreground/60 hover:bg-surface-muted"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <RhTableWrap>
          {rows.length === 0 ? (
            <RhEmpty
              title={tab === "open" ? "Aucune décision en attente" : "Aucune décision close"}
              body="Seules les décisions que vos droits permettent de voir sont listées."
            />
          ) : (
            <table className="min-w-full">
              <thead className="border-b border-border/70 bg-surface-muted/60">
                <tr>
                  <th className={rhTh()}>Décision</th>
                  <th className={rhTh()}>Période · chantier</th>
                  <th className={rhTh()}>Origine</th>
                  <th className={rhTh()}>Demandée</th>
                  <th className={rhTh()}>Statut</th>
                  <th className={rhTh()}>{tab === "open" ? "Décidée" : "Choix / clôture"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 hover:bg-surface-muted/40">
                    <td className={rhTd()}>
                      <Link href={`/decisions/${r.id}`} className="font-semibold text-brand hover:underline">
                        {r.type_label}
                      </Link>
                    </td>
                    <td className={rhTd()}>
                      {periodLabel(r.period_year, r.period_month)}
                      {r.site_name ? ` · ${r.site_name}` : ""}
                    </td>
                    <td className={rhTd()}>{payrollSourceLabel(r.request_source)}</td>
                    <td className={rhTd()}>
                      {dateTime(r.requested_at)}
                      {r.requested_by_name ? <span className="block text-xs text-foreground/55">{r.requested_by_name}</span> : null}
                    </td>
                    <td className={rhTd()}>
                      <RhChip tone={decisionStatusTone(r.status)}>{decisionStatusLabel(r.status)}</RhChip>
                    </td>
                    <td className={rhTd()}>
                      {r.chosen_label ? <span className="block">{r.chosen_label}</span> : null}
                      {r.decided_by_name ? (
                        <span className="block text-xs text-foreground/55">
                          {r.decided_by_name} · {dateTime(r.decided_at)}
                        </span>
                      ) : null}
                      {r.closed_reason ? <span className="block text-xs text-foreground/55">{r.closed_reason}</span> : null}
                      {!r.chosen_label && !r.closed_reason ? "—" : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </RhTableWrap>
      </div>
    </AppShell>
  );
}
