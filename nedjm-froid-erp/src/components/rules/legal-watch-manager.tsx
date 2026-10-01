"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ignoreWatchItem,
  importWatchItem,
  runLegalWatchNow,
  saveWatchDomain,
  saveWatchKeyword,
  saveWatchSource,
  type LegalWatchAccess,
  type LegalWatchWorkspace,
} from "@/lib/actions/legal-watch";
import { IMPORT_NOTICE, emptyLegalDocMeta, type LegalDocMeta } from "@/lib/rules/legal-documents";
import {
  WATCH_BASELINE_NOTICE,
  WATCH_FREQUENCIES,
  WATCH_NOTICE,
  nextCheckAt,
  watchCheckLabel,
  watchCheckTone,
  watchFrequencyLabel,
  watchItemLabel,
  watchItemTone,
  watchRunLabel,
  watchTriggerLabel,
  type WatchDomain,
  type WatchFrequency,
  type WatchItem,
  type WatchSource,
} from "@/lib/watch/legal-watch";
import { MetaFields } from "@/components/rules/legal-documents-manager";
import { QuickDialog } from "@/components/rules/rule-ui";
import { Button } from "@/components/ui/button";
import {
  RhAlert,
  RhChip,
  RhField,
  RhPageHeader,
  RhPanel,
  RhStat,
  RhTableWrap,
  RhTabs,
  RhToolbar,
  rhInput,
  rhTd,
  rhTh,
} from "@/components/rh/rh-ui";

type Tab = "textes" | "sources" | "domaines" | "mots-cles" | "historique";
type ItemFilter = "relevant" | "new" | "baseline" | "imported" | "ignored" | "all";

type Dialog =
  | { kind: "import"; item: WatchItem }
  | { kind: "ignore"; item: WatchItem }
  | { kind: "source"; source: WatchSource | null }
  | { kind: "domain"; domain: WatchDomain | null }
  | null;

const DOCUMENTS_PATH = "/rh/legal/documents";

function dateTime(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

function itemMatches(item: WatchItem, filter: ItemFilter): boolean {
  switch (filter) {
    case "relevant":
      return item.status === "NEW" && item.relevant && !item.baseline;
    case "new":
      return item.status === "NEW" && !item.baseline;
    case "baseline":
      return item.status === "NEW" && item.baseline;
    case "imported":
      return item.status === "IMPORTED";
    case "ignored":
      return item.status === "IGNORED";
    default:
      return true;
  }
}

export function LegalWatchManager({
  workspace,
  access,
  initialTab,
}: {
  workspace: LegalWatchWorkspace;
  access: LegalWatchAccess;
  initialTab: Tab;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, startRun] = useTransition();

  const lastRun = workspace.runs[0] ?? null;
  const toReview = workspace.items.filter((i) => itemMatches(i, "relevant")).length;
  const failing = workspace.sources.filter((s) => s.is_active && s.last_status === "ERROR").length;

  function done(text: string) {
    setDialog(null);
    setError(null);
    setInfo(text);
    router.refresh();
  }

  function runNow() {
    setInfo(null);
    setError(null);
    startRun(async () => {
      const r = await runLegalWatchNow();
      if (!r.ok) {
        setError(r.error);
        router.refresh();
        return;
      }
      const s = r.data;
      done(
        `Vérification terminée : ${s.checked} source(s) lue(s) sur ${s.planned}, ${s.failed} en erreur, ${s.new} lien(s) nouveau(x) dont ${s.relevant} pertinent(s).` +
          (s.skipped ? ` ${s.skipped} source(s) reportée(s) faute de temps.` : ""),
      );
    });
  }

  return (
    <div className="space-y-5">
      <RhPageHeader
        title="Veille juridique"
        description="Pages officielles surveillées, textes nouvellement détectés et historique des vérifications. Un texte détecté se verse au registre des documents juridiques par un humain ; rien ne s'applique à la paie sans approbation puis décision."
        actions={
          access.run ? (
            <Button disabled={running} onClick={runNow}>
              {running ? "Vérification en cours…" : "Vérifier maintenant"}
            </Button>
          ) : null
        }
      />
      <RhAlert tone="info">{WATCH_NOTICE}</RhAlert>
      {!access.cronConfigured ? (
        <RhAlert tone="warning">
          Vérification planifiée inactive : la variable serveur CRON_SECRET n&apos;est pas configurée sur cet environnement.
          Seul le bouton « Vérifier maintenant » fonctionne.
        </RhAlert>
      ) : null}
      {info ? <RhAlert tone="success">{info}</RhAlert> : null}
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <RhStat label="Dernière vérification" value={<span className="text-base">{dateTime(lastRun?.started_at ?? null)}</span>} />
        <RhStat label="Textes pertinents à examiner" value={toReview} />
        <RhStat label="Sources actives" value={workspace.sources.filter((s) => s.is_active).length} />
        <RhStat label="Sources en erreur" value={failing} />
      </div>
      {lastRun ? (
        <p className="text-xs text-foreground/60">
          Dernière vérification {watchTriggerLabel(lastRun.trigger).toLowerCase()} ({watchRunLabel(lastRun.status).toLowerCase()}) :{" "}
          {lastRun.sources_checked} source(s) vérifiée(s), {lastRun.sources_failed} en erreur, {lastRun.items_new} lien(s) nouveau(x).
          {lastRun.note ? ` ${lastRun.note}` : ""}
        </p>
      ) : (
        <p className="text-xs text-foreground/60">Aucune vérification enregistrée pour l&apos;instant.</p>
      )}

      <RhTabs
        items={[
          { id: "textes", label: `Textes détectés${toReview ? ` (${toReview})` : ""}` },
          { id: "sources", label: "Sources surveillées" },
          { id: "domaines", label: "Domaines autorisés" },
          { id: "mots-cles", label: "Mots-clés" },
          { id: "historique", label: "Historique" },
        ]}
        value={tab}
        onChange={(v) => setTab(v as Tab)}
      />

      {tab === "textes" ? (
        <ItemsTab
          items={workspace.items}
          access={access}
          onImport={(item) => setDialog({ kind: "import", item })}
          onIgnore={(item) => setDialog({ kind: "ignore", item })}
        />
      ) : null}
      {tab === "sources" ? (
        <SourcesTab
          sources={workspace.sources}
          canManage={access.manage}
          hasDomains={workspace.domains.some((d) => d.is_active)}
          onEdit={(source) => setDialog({ kind: "source", source })}
        />
      ) : null}
      {tab === "domaines" ? (
        <DomainsTab domains={workspace.domains} canManage={access.manage} onEdit={(domain) => setDialog({ kind: "domain", domain })} />
      ) : null}
      {tab === "mots-cles" ? <KeywordsTab workspace={workspace} canManage={access.manage} onDone={done} /> : null}
      {tab === "historique" ? <HistoryTab workspace={workspace} /> : null}

      {dialog?.kind === "import" ? <ImportDialog item={dialog.item} onClose={() => setDialog(null)} onDone={done} /> : null}
      {dialog?.kind === "ignore" ? <IgnoreDialog item={dialog.item} onClose={() => setDialog(null)} onDone={done} /> : null}
      {dialog?.kind === "source" ? <SourceDialog source={dialog.source} onClose={() => setDialog(null)} onDone={done} /> : null}
      {dialog?.kind === "domain" ? <DomainDialog domain={dialog.domain} onClose={() => setDialog(null)} onDone={done} /> : null}
    </div>
  );
}

function ItemsTab({
  items,
  access,
  onImport,
  onIgnore,
}: {
  items: WatchItem[];
  access: LegalWatchAccess;
  onImport: (item: WatchItem) => void;
  onIgnore: (item: WatchItem) => void;
}) {
  const [filter, setFilter] = useState<ItemFilter>("relevant");
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) => itemMatches(i, filter) && (!q || [i.title ?? "", i.url, i.source_label].some((s) => s.toLowerCase().includes(q))),
    );
  }, [items, filter, query]);

  return (
    <div className="space-y-3">
      <RhToolbar>
        <select className={`${rhInput} w-auto`} value={filter} onChange={(e) => setFilter(e.target.value as ItemFilter)}>
          <option value="relevant">Pertinents à examiner</option>
          <option value="new">Tous les nouveaux à examiner</option>
          <option value="baseline">Liens de référence (première lecture)</option>
          <option value="imported">Importés au registre</option>
          <option value="ignored">Écartés</option>
          <option value="all">Tous</option>
        </select>
        <input
          className={`${rhInput} max-w-xs`}
          placeholder="Rechercher (titre, adresse, source)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </RhToolbar>
      {filter === "baseline" ? <RhAlert tone="info">{WATCH_BASELINE_NOTICE}</RhAlert> : null}
      {!shown.length ? <RhAlert tone="info">Aucun texte détecté dans cette vue.</RhAlert> : null}
      {shown.map((item) => (
        <RhPanel key={item.id}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1.5">
              <p className="font-semibold break-words">{item.title || "Lien sans titre"}</p>
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="block break-all text-xs text-brand hover:underline">
                {item.url}
              </a>
              <p className="text-xs text-foreground/60">
                {item.source_label} · détecté le {dateTime(item.first_seen_at)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <RhChip tone={watchItemTone(item.status)}>{watchItemLabel(item.status)}</RhChip>
                {item.baseline ? <RhChip>Référence (première lecture)</RhChip> : null}
                {item.keywords.map((k) => (
                  <RhChip key={k} tone="warning">
                    {k}
                  </RhChip>
                ))}
                {!item.relevant ? <RhChip>Aucun mot-clé</RhChip> : null}
              </div>
              {item.status === "IGNORED" ? (
                <p className="text-xs text-foreground/60">
                  Écarté par {item.decided_by_name ?? "?"} le {dateTime(item.decided_at)} : {item.ignore_reason}
                </p>
              ) : null}
              {item.status === "IMPORTED" ? (
                <p className="text-xs text-foreground/60">
                  Importé par {item.decided_by_name ?? "?"} le {dateTime(item.decided_at)} ·{" "}
                  <Link href={DOCUMENTS_PATH} className="text-brand hover:underline">
                    voir le registre
                  </Link>
                </p>
              ) : null}
            </div>
            {item.status === "NEW" ? (
              <div className="flex shrink-0 flex-wrap gap-2">
                {access.importDocs ? <Button onClick={() => onImport(item)}>Importer</Button> : null}
                {access.run ? (
                  <Button variant="secondary" onClick={() => onIgnore(item)}>
                    Écarter
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </RhPanel>
      ))}
    </div>
  );
}

function SourcesTab({
  sources,
  canManage,
  hasDomains,
  onEdit,
}: {
  sources: WatchSource[];
  canManage: boolean;
  hasDomains: boolean;
  onEdit: (source: WatchSource | null) => void;
}) {
  return (
    <div className="space-y-3">
      <RhToolbar>
        <p className="flex-1 text-sm text-foreground/70">
          Pages lues à chaque vérification (liste de textes, rubrique « nouveautés »…), sur un domaine autorisé uniquement.
        </p>
        {canManage ? (
          <Button disabled={!hasDomains} onClick={() => onEdit(null)}>
            Ajouter une source
          </Button>
        ) : null}
      </RhToolbar>
      {!sources.length ? (
        <RhAlert tone="info">
          Aucune source surveillée. Ajoutez l&apos;adresse d&apos;une page officielle qui liste les nouveaux textes (après avoir vérifié
          ses conditions d&apos;utilisation).
        </RhAlert>
      ) : (
        <RhTableWrap>
          <table className="w-full min-w-[56rem]">
            <thead>
              <tr>
                <th className={rhTh()}>Source</th>
                <th className={rhTh()}>Fréquence</th>
                <th className={rhTh()}>Dernière vérification</th>
                <th className={rhTh()}>Prochaine</th>
                <th className={rhTh()}>État</th>
                <th className={rhTh()} />
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => {
                const next = nextCheckAt(s);
                return (
                  <tr key={s.id} className="border-t border-border/50">
                    <td className={rhTd()}>
                      <p className="font-semibold">{s.label}</p>
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-brand hover:underline">
                        {s.url}
                      </a>
                    </td>
                    <td className={rhTd()}>{watchFrequencyLabel(s.frequency)}</td>
                    <td className={rhTd()}>{dateTime(s.last_checked_at)}</td>
                    <td className={rhTd()}>{s.is_active ? (next ? `après le ${dateTime(next.toISOString())}` : "à la prochaine") : "—"}</td>
                    <td className={rhTd()}>
                      <div className="flex flex-wrap gap-1.5">
                        {!s.is_active ? <RhChip>Désactivée</RhChip> : null}
                        <RhChip tone={watchCheckTone(s.last_status)}>{watchCheckLabel(s.last_status)}</RhChip>
                        {s.consecutive_failures > 1 ? <RhChip tone="danger">{s.consecutive_failures} échecs de suite</RhChip> : null}
                        {s.is_active && !s.baseline_done ? <RhChip tone="warning">Référence à établir</RhChip> : null}
                      </div>
                      {s.last_status === "ERROR" && s.last_error ? <p className="mt-1 text-xs text-red-700 dark:text-red-300">{s.last_error}</p> : null}
                    </td>
                    <td className={rhTd()}>
                      {canManage ? (
                        <Button variant="secondary" onClick={() => onEdit(s)}>
                          Modifier
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </RhTableWrap>
      )}
    </div>
  );
}

function DomainsTab({
  domains,
  canManage,
  onEdit,
}: {
  domains: WatchDomain[];
  canManage: boolean;
  onEdit: (domain: WatchDomain | null) => void;
}) {
  return (
    <div className="space-y-3">
      <RhToolbar>
        <p className="flex-1 text-sm text-foreground/70">
          Seuls ces domaines (et leurs sous-domaines) peuvent être lus par la veille, en https. Les adresses internes sont
          toujours refusées, même derrière un domaine autorisé.
        </p>
        {canManage ? <Button onClick={() => onEdit(null)}>Ajouter un domaine</Button> : null}
      </RhToolbar>
      <RhTableWrap>
        <table className="w-full min-w-[40rem]">
          <thead>
            <tr>
              <th className={rhTh()}>Domaine</th>
              <th className={rhTh()}>Organisme</th>
              <th className={rhTh()}>État</th>
              <th className={rhTh()} />
            </tr>
          </thead>
          <tbody>
            {domains.map((d) => (
              <tr key={d.id} className="border-t border-border/50">
                <td className={`${rhTd()} font-mono`}>{d.domain}</td>
                <td className={rhTd()}>{d.label}</td>
                <td className={rhTd()}>
                  <RhChip tone={d.is_active ? "success" : "neutral"}>{d.is_active ? "Autorisé" : "Désactivé"}</RhChip>
                </td>
                <td className={rhTd()}>
                  {canManage ? (
                    <Button variant="secondary" onClick={() => onEdit(d)}>
                      Modifier
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </RhTableWrap>
    </div>
  );
}

function KeywordsTab({
  workspace,
  canManage,
  onDone,
}: {
  workspace: LegalWatchWorkspace;
  canManage: boolean;
  onDone: (text: string) => void;
}) {
  const [pending, start] = useTransition();
  const [keyword, setKeyword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function save(input: { id: string | null; keyword: string; is_active: boolean }, text: string) {
    setError(null);
    start(async () => {
      const r = await saveWatchKeyword(input);
      if (!r.ok) return setError(r.error);
      setKeyword("");
      onDone(text);
    });
  }

  return (
    <div className="space-y-3">
      <RhAlert tone="info">
        Un lien est signalé comme pertinent si son titre ou son adresse contient un mot-clé actif (sans tenir compte des
        majuscules ni des accents). Les mots-clés s&apos;appliquent aux liens détectés après leur ajout ; aucun texte n&apos;est
        envoyé à l&apos;IA pendant la veille.
      </RhAlert>
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {canManage ? (
        <RhToolbar>
          <input
            className={`${rhInput} max-w-sm`}
            placeholder="Nouveau mot-clé (ex. allocation familiale, المنح)"
            value={keyword}
            maxLength={80}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Button
            disabled={pending || keyword.trim().length < 2}
            onClick={() => save({ id: null, keyword, is_active: true }, `Mot-clé « ${keyword.trim()} » ajouté.`)}
          >
            Ajouter
          </Button>
        </RhToolbar>
      ) : null}
      <RhPanel>
        <div className="flex flex-wrap gap-2">
          {workspace.keywords.map((k) => (
            <span
              key={k.id}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm ${
                k.is_active ? "border-amber-300/70 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40" : "border-border/60 text-foreground/45 line-through"
              }`}
            >
              {k.keyword}
              {canManage ? (
                <button
                  type="button"
                  disabled={pending}
                  className="text-xs font-semibold text-brand hover:underline disabled:opacity-50"
                  onClick={() =>
                    save(
                      { id: k.id, keyword: k.keyword, is_active: !k.is_active },
                      `Mot-clé « ${k.keyword} » ${k.is_active ? "désactivé" : "réactivé"}.`,
                    )
                  }
                >
                  {k.is_active ? "Désactiver" : "Réactiver"}
                </button>
              ) : null}
            </span>
          ))}
        </div>
      </RhPanel>
    </div>
  );
}

function HistoryTab({ workspace }: { workspace: LegalWatchWorkspace }) {
  if (!workspace.runs.length) return <RhAlert tone="info">Aucune vérification enregistrée.</RhAlert>;
  return (
    <div className="space-y-3">
      {workspace.runs.map((r) => (
        <RhPanel key={r.id}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{dateTime(r.started_at)}</p>
            <RhChip tone={r.trigger === "CRON" ? "brand" : "neutral"}>{watchTriggerLabel(r.trigger)}</RhChip>
            <RhChip tone={r.status === "DONE" ? "success" : r.status === "FAILED" ? "danger" : "warning"}>{watchRunLabel(r.status)}</RhChip>
            {r.started_by_name ? <span className="text-xs text-foreground/60">par {r.started_by_name}</span> : null}
          </div>
          <p className="mt-1 text-sm text-foreground/70">
            {r.sources_checked}/{r.sources_planned} source(s) vérifiée(s), {r.sources_failed} en erreur, {r.items_new} lien(s) nouveau(x),{" "}
            {r.items_relevant} pertinent(s).{r.note ? ` ${r.note}` : ""}
          </p>
          {r.checks.length ? (
            <ul className="mt-2 space-y-1 text-xs">
              {r.checks.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2">
                  <RhChip tone={watchCheckTone(c.status)}>{watchCheckLabel(c.status)}</RhChip>
                  <span className="font-semibold">{c.source_label}</span>
                  {c.status === "ERROR" ? (
                    <span className="text-red-700 dark:text-red-300">{c.error}</span>
                  ) : (
                    <span className="text-foreground/60">
                      {c.links_found} lien(s) retenu(s), {c.items_new} nouveau(x), {c.items_relevant} pertinent(s)
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </RhPanel>
      ))}
    </div>
  );
}

function initialMeta(item: WatchItem): LegalDocMeta {
  const title = (item.title ?? "").slice(0, 300);
  return {
    ...emptyLegalDocMeta(),
    title,
    language: /[\u0600-\u06ff]/.test(title) ? "AR" : "FR",
    origin: item.source_label.slice(0, 200) || "Veille juridique",
    source_url: item.url.length <= 500 ? item.url : "",
  };
}

function ImportDialog({ item, onClose, onDone }: { item: WatchItem; onClose: () => void; onDone: (text: string) => void }) {
  const [pending, start] = useTransition();
  const [meta, setMeta] = useState<LegalDocMeta>(() => initialMeta(item));
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    start(async () => {
      const r = await importWatchItem({ id: item.id, meta });
      if (!r.ok) return setError(r.error);
      onDone(`« ${meta.title} » importé au registre des documents juridiques. ${IMPORT_NOTICE}`);
    });
  }

  return (
    <QuickDialog
      title="Importer le texte détecté au registre"
      subtitle={item.url}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Fermer
          </Button>
          <Button disabled={pending} onClick={submit}>
            {pending ? "Téléchargement…" : "Télécharger et importer"}
          </Button>
        </>
      }
    >
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      <RhAlert tone="info">
        Le serveur télécharge le fichier depuis ce lien (PDF ou image, 25 Mo au plus) et l&apos;enregistre au registre avec les
        informations ci-dessous, à vérifier sur le texte lui-même : intitulé, référence, période d&apos;application. Aucune
        analyse IA n&apos;est lancée automatiquement.
      </RhAlert>
      <MetaFields value={meta} onChange={setMeta} />
    </QuickDialog>
  );
}

function IgnoreDialog({ item, onClose, onDone }: { item: WatchItem; onClose: () => void; onDone: (text: string) => void }) {
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    start(async () => {
      const r = await ignoreWatchItem({ id: item.id, reason });
      if (!r.ok) return setError(r.error);
      onDone("Texte écarté. Il reste consultable dans la vue « Écartés ».");
    });
  }

  return (
    <QuickDialog
      title="Écarter le texte détecté"
      subtitle={item.title || item.url}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Fermer
          </Button>
          <Button disabled={pending || reason.trim().length < 5} onClick={submit}>
            Écarter
          </Button>
        </>
      }
    >
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      <RhField label="Motif" required hint="5 à 300 caractères, ex. « sans rapport avec la paie », « déjà au registre ».">
        <textarea className={`${rhInput} min-h-16`} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
      </RhField>
    </QuickDialog>
  );
}

function SourceDialog({ source, onClose, onDone }: { source: WatchSource | null; onClose: () => void; onDone: (text: string) => void }) {
  const [pending, start] = useTransition();
  const [label, setLabel] = useState(source?.label ?? "");
  const [url, setUrl] = useState(source?.url ?? "https://");
  const [frequency, setFrequency] = useState<WatchFrequency>(source?.frequency ?? "WEEKLY");
  const [active, setActive] = useState(source?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    start(async () => {
      const r = await saveWatchSource({ id: source?.id ?? null, label, url, frequency, is_active: active });
      if (!r.ok) return setError(r.error);
      onDone(source ? `Source « ${label.trim()} » modifiée.` : `Source « ${label.trim()} » ajoutée : sa première lecture servira de référence.`);
    });
  }

  return (
    <QuickDialog
      title={source ? "Modifier la source" : "Ajouter une source surveillée"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Fermer
          </Button>
          <Button disabled={pending} onClick={submit}>
            Enregistrer
          </Button>
        </>
      }
    >
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      <RhField label="Libellé" required>
        <input className={rhInput} value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} />
      </RhField>
      <RhField
        label="Adresse de la page"
        required
        hint="https:// sur un domaine autorisé. Changer l'adresse fait établir une nouvelle référence à la prochaine lecture."
      >
        <input className={rhInput} value={url} maxLength={500} onChange={(e) => setUrl(e.target.value)} />
      </RhField>
      <RhField label="Fréquence" required>
        <select className={rhInput} value={frequency} onChange={(e) => setFrequency(e.target.value as WatchFrequency)}>
          {WATCH_FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {watchFrequencyLabel(f)}
            </option>
          ))}
        </select>
      </RhField>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Source active
      </label>
    </QuickDialog>
  );
}

function DomainDialog({ domain, onClose, onDone }: { domain: WatchDomain | null; onClose: () => void; onDone: (text: string) => void }) {
  const [pending, start] = useTransition();
  const [name, setName] = useState(domain?.domain ?? "");
  const [label, setLabel] = useState(domain?.label ?? "");
  const [active, setActive] = useState(domain?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    start(async () => {
      const r = await saveWatchDomain({ id: domain?.id ?? null, domain: name, label, is_active: active });
      if (!r.ok) return setError(r.error);
      onDone(domain ? `Domaine ${name.trim().toLowerCase()} modifié.` : `Domaine ${name.trim().toLowerCase()} autorisé.`);
    });
  }

  return (
    <QuickDialog
      title={domain ? "Modifier le domaine autorisé" : "Autoriser un domaine"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Fermer
          </Button>
          <Button disabled={pending} onClick={submit}>
            Enregistrer
          </Button>
        </>
      }
    >
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      <RhAlert tone="warning">
        N&apos;autorisez que des sites officiels ou expressément jugés fiables. Désactiver un domaine arrête la lecture de ses
        sources et l&apos;import de ses liens.
      </RhAlert>
      <RhField label="Domaine" required hint="Nom de domaine seul, sans https:// ni chemin (ex. joradp.dz). Ne se modifie plus ensuite.">
        <input className={`${rhInput} font-mono`} value={name} disabled={Boolean(domain)} maxLength={200} onChange={(e) => setName(e.target.value)} />
      </RhField>
      <RhField label="Organisme" required>
        <input className={rhInput} value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} />
      </RhField>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Domaine autorisé
      </label>
    </QuickDialog>
  );
}
