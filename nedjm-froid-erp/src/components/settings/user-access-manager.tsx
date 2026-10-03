"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { saveUserAccess, type AccessUser } from "@/lib/actions/user-access";
import { ACCESS_MODULES, type AccessModule } from "@/lib/ui/registry";
import { Button } from "@/components/ui/button";
import { RhAlert, RhField, RhPanel, rhInput } from "@/components/rh/rh-ui";

const moduleTabKeys = (m: AccessModule) => m.groups.flatMap((g) => g.tabs.map((t) => t.key));

function Switch({ on, disabled, onChange, label }: { on: boolean; disabled?: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
        on ? "bg-brand" : "bg-foreground/20"
      }`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${on ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

export function UserAccessManager({ users: initialUsers }: { users: AccessUser[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [userId, setUserId] = useState("");
  const [allowed, setAllowed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ tone: "danger" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const user = useMemo(() => users.find((u) => u.id === userId) ?? null, [users, userId]);

  function pick(id: string) {
    if (dirty && !window.confirm("Des modifications non enregistrées seront perdues. Continuer ?")) return;
    const next = users.find((u) => u.id === id);
    const keys = new Set(next?.allowed ?? []);
    setUserId(id);
    setAllowed(keys);
    setExpanded(new Set(ACCESS_MODULES.filter((m) => !m.locked && keys.has(m.key)).map((m) => m.key)));
    setDirty(false);
    setMessage(null);
  }

  function update(mutate: (next: Set<string>) => void) {
    setAllowed((prev) => {
      const next = new Set(prev);
      mutate(next);
      return next;
    });
    setDirty(true);
    setMessage(null);
  }

  function toggleModule(m: AccessModule) {
    const opening = !allowed.has(m.key);
    update((next) => {
      if (opening) {
        next.add(m.key);
        for (const k of moduleTabKeys(m)) next.add(k);
      } else {
        next.delete(m.key);
        for (const k of moduleTabKeys(m)) next.delete(k);
      }
    });
    setExpanded((prev) => {
      const next = new Set(prev);
      if (opening) next.add(m.key);
      else next.delete(m.key);
      return next;
    });
  }

  function toggleTab(key: string) {
    update((next) => {
      if (next.has(key)) next.delete(key);
      else next.add(key);
    });
  }

  function setAllTabs(m: AccessModule, on: boolean) {
    update((next) => {
      for (const k of moduleTabKeys(m)) {
        if (on) next.add(k);
        else next.delete(k);
      }
    });
  }

  function save(reset = false) {
    if (!user) return;
    const payload = reset ? null : [...allowed];
    start(async () => {
      const r = await saveUserAccess({ userId: user.id, allowed: payload });
      if (!r.ok) {
        setMessage({ tone: "danger", text: r.error });
        return;
      }
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, allowed: payload } : u)));
      if (reset) {
        setAllowed(new Set());
        setExpanded(new Set());
      }
      setDirty(false);
      setMessage({
        tone: "success",
        text: reset ? "Le compte suit de nouveau les choix de ses rôles." : "Accès enregistrés. Ils s'appliquent à sa prochaine page.",
      });
    });
  }

  const openCount = ACCESS_MODULES.filter((m) => !m.locked && allowed.has(m.key)).length;

  return (
    <div className="space-y-5">
      <RhPanel>
        <RhField label="1. Compte · الحساب">
          <select className={`${rhInput} max-w-xl`} value={userId} onChange={(e) => pick(e.target.value)}>
            <option value="">— Choisir un compte —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.email} · {u.email}
                {u.roles.length ? ` · ${u.roles.join(", ")}` : ""}
                {u.allowed ? " · accès personnalisé" : ""}
              </option>
            ))}
          </select>
        </RhField>
      </RhPanel>

      {user?.superAdmin ? (
        <RhAlert tone="info">Ce compte est SUPER_ADMIN : il voit toujours tout, aucun réglage ne s&apos;applique.</RhAlert>
      ) : null}

      {user && !user.superAdmin ? (
        <RhPanel>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-display text-base font-semibold">2. Modules · الوحدات</p>
              <p className="text-xs text-foreground/60">
                {user.allowed
                  ? "Accès personnalisé : seuls les modules et onglets cochés sont affichés."
                  : "Aucun accès personnalisé pour l'instant : le compte suit ses rôles. Ouvrez les modules voulus puis enregistrez."}{" "}
                {openCount} module(s) ouvert(s).
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {user.allowed ? (
                <Button variant="secondary" size="sm" disabled={pending} onClick={() => save(true)}>
                  Revenir aux rôles
                </Button>
              ) : null}
              <Button size="sm" disabled={pending || (!dirty && Boolean(user.allowed))} onClick={() => save()}>
                {pending ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </div>
          {message ? (
            <div className="mb-4">
              <RhAlert tone={message.tone}>{message.text}</RhAlert>
            </div>
          ) : null}

          <ul className="divide-y divide-border/60 rounded-xl border border-border/70">
            {ACCESS_MODULES.map((m) => {
              const open = m.locked || allowed.has(m.key);
              const isExpanded = open && expanded.has(m.key);
              const tabKeys = moduleTabKeys(m);
              const checked = tabKeys.filter((k) => allowed.has(k)).length;
              return (
                <li key={m.key}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    {open && tabKeys.length ? (
                      <button
                        type="button"
                        className="text-foreground/60 hover:text-foreground"
                        aria-label={isExpanded ? "Replier" : "Déplier"}
                        onClick={() =>
                          setExpanded((prev) => {
                            const next = new Set(prev);
                            if (next.has(m.key)) next.delete(m.key);
                            else next.add(m.key);
                            return next;
                          })
                        }
                      >
                        {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </button>
                    ) : (
                      <span className="size-4" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{m.labelFr}</p>
                      {m.labelAr ? (
                        <p className="text-xs text-foreground/55" dir="rtl">
                          {m.labelAr}
                        </p>
                      ) : null}
                    </div>
                    {open && tabKeys.length ? (
                      <span className="text-xs text-foreground/55">
                        {checked}/{tabKeys.length} onglet(s)
                      </span>
                    ) : null}
                    {m.locked ? (
                      <span className="text-xs text-foreground/55">Toujours ouvert</span>
                    ) : (
                      <Switch on={open} disabled={pending} onChange={() => toggleModule(m)} label={`Ouvrir ${m.labelFr}`} />
                    )}
                  </div>
                  {isExpanded && tabKeys.length ? (
                    <div className="space-y-4 border-t border-border/50 bg-surface-muted/40 px-4 py-3 ps-11">
                      <div className="flex gap-2 text-xs">
                        <button type="button" className="text-brand hover:underline" onClick={() => setAllTabs(m, true)}>
                          Tout cocher
                        </button>
                        <span className="text-foreground/30">·</span>
                        <button type="button" className="text-brand hover:underline" onClick={() => setAllTabs(m, false)}>
                          Tout décocher
                        </button>
                      </div>
                      {m.groups.map((g) => (
                        <div key={g.tabset}>
                          {m.groups.length > 1 ? (
                            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/50">{g.titleFr}</p>
                          ) : null}
                          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                            {g.tabs.map((t) => (
                              <label key={t.key} className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={allowed.has(t.key)}
                                  disabled={pending}
                                  onChange={() => toggleTab(t.key)}
                                />
                                {t.labelFr}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-foreground/55">
            Ces réglages choisissent ce que le compte voit. Les données restent protégées par la matrice des permissions de
            son rôle.
          </p>
        </RhPanel>
      ) : null}
    </div>
  );
}
