"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  ChartColumn,
  Check,
  ChevronRight,
  CircleCheck,
  Clock,
  Eye,
  FilePenLine,
  FileText,
  HardHat,
  KeyRound,
  LayoutGrid,
  Link2,
  Lock,
  MapPin,
  MousePointerClick,
  PanelTop,
  Scale,
  Search,
  Settings2,
  Shapes,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TriangleAlert,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { saveRoleRights, startViewAs, type RoleRightsData, type RoleRightsRole } from "@/lib/actions/role-rights";
import { PERM_FIELDS, type PermField } from "@/lib/auth/rbac-fields";
import {
  ACTION_LABELS,
  SENSITIVE_ACTIONS,
  TWIN_KEYS,
  buildPayload,
  buildRightsTree,
  cloneState,
  closeNode,
  describeChanges,
  flatten,
  indexTree,
  isEmptyPayload,
  isNewKey,
  isOpen,
  isReachable,
  nodeActions,
  openNode,
  pathLabel,
  setAction,
  type RightsNode,
  type RightsNotice,
  type RoleRightsState,
} from "@/lib/auth/role-rights";
import type { UiIcon } from "@/lib/ui/registry";
import { cn } from "@/lib/utils";

const MODULE_ICONS: Record<UiIcon, LucideIcon> = {
  home: LayoutGrid,
  users: Users,
  contract: FilePenLine,
  calendar: Clock,
  pay: Wallet,
  docs: FileText,
  settings: Settings2,
  site: HardHat,
  finance: Banknote,
  cart: ShoppingCart,
  shield: ShieldCheck,
};

const TINTS: Record<string, string> = {
  "nav.home": "#2f5bea",
  "nav.simulateur": "#7c3aed",
  "nav.decisions": "#0f9f83",
  "nav.rh": "#2f5bea",
  "nav.chantiers": "#d97706",
  "nav.activites": "#db2777",
  "nav.clients": "#0284c7",
  "nav.contrats": "#4f46e5",
  "nav.finance": "#16a34a",
  "nav.achats": "#ea580c",
  "nav.utilisateurs": "#475569",
  "nav.roles": "#9333ea",
  "nav.parametres": "#64748b",
};

const GROUP_ICONS: Record<string, LucideIcon> = {
  "Vue d'ensemble": ChartColumn,
  Personnel: Users,
  "Temps & présence": Clock,
  Paie: Wallet,
  Documents: FileText,
  Juridique: Scale,
  Autres: Shapes,
  Paramètres: Settings2,
  Boutons: MousePointerClick,
  Onglets: PanelTop,
  "Droits particuliers": KeyRound,
};

function groupIcon(group: string, kind: RightsNode["kind"]): LucideIcon {
  return GROUP_ICONS[group] ?? (kind === "button" ? MousePointerClick : PanelTop);
}

function tintOf(n: RightsNode, byKey: Map<string, RightsNode>): string {
  let cur: RightsNode | undefined = n;
  while (cur?.parent) cur = byKey.get(cur.parent);
  return TINTS[cur?.key ?? ""] ?? "#2f5bea";
}

function stateOf(role: RoleRightsRole): RoleRightsState {
  return {
    hidden: new Set(role.hidden),
    perms: Object.fromEntries(Object.entries(role.perms).map(([k, v]) => [k, { ...v }])),
    sitesOnly: role.sitesOnly,
    reviewed: new Set(),
  };
}

function statesOf(data: RoleRightsData): Record<string, RoleRightsState> {
  return Object.fromEntries(data.roles.map((r) => [r.id, stateOf(r)]));
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

function initials(label: string): string {
  return (
    label
      .split(/[\s_-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "R"
  );
}

/* —— small pieces —— */

function Switch({
  on,
  onChange,
  disabled,
  label,
  size = "md",
}: {
  on: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
  size?: "md" | "sm";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={cn(
        "relative shrink-0 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60",
        size === "md" ? "h-[30px] w-[50px]" : "h-[25px] w-[42px]",
        on ? "bg-emerald-500 shadow-[0_4px_12px_rgba(34,197,94,0.35)]" : "bg-slate-300 dark:bg-slate-600",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-[3px] left-[3px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-transform duration-200",
          size === "md" ? "size-6" : "size-[19px]",
          on && (size === "md" ? "translate-x-5" : "translate-x-[17px]"),
        )}
      />
    </button>
  );
}

function SensitiveTag({ reason }: { reason: string }) {
  return (
    <span
      title={reason}
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
    >
      <TriangleAlert className="size-3" aria-hidden />
      Sensible
    </span>
  );
}

function NewTag({ children = "Nouveau" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-muted px-2 py-0.5 text-[11px] font-semibold text-brand">
      <Sparkles className="size-3" aria-hidden />
      {children}
    </span>
  );
}

function Stat({ icon: Icon, value, label, warm }: { icon: LucideIcon; value: ReactNode; label: string; warm?: boolean }) {
  return (
    <div className="min-w-[92px] rounded-2xl border border-white/20 bg-white/10 px-3 py-2">
      <div className="flex items-center gap-2 font-display text-xl leading-none font-bold">
        <span className={cn("inline-flex size-6 items-center justify-center rounded-lg", warm ? "bg-amber-400 text-amber-950" : "bg-white/20")}>
          <Icon className="size-3.5" aria-hidden />
        </span>
        {value}
      </div>
      <p className="mt-1 text-[11.5px] text-white/75">{label}</p>
    </div>
  );
}

/* —— the page —— */

export function RoleRightsManager({ data, initialRoleId }: { data: RoleRightsData; initialRoleId?: string }) {
  const router = useRouter();
  const tree = useMemo(() => buildRightsTree(data.screens), [data.screens]);
  const index = useMemo(() => indexTree(tree), [tree]);
  const all = useMemo(() => flatten(tree), [tree]);
  const seen = useMemo(() => new Set(data.seen), [data.seen]);
  const screenLabels = useMemo(() => new Map(data.screens.map((s) => [s.code, s.label_fr.split(" · ")[0]])), [data.screens]);

  const [synced, setSynced] = useState(data);
  const [saved, setSaved] = useState(() => statesOf(data));
  const [states, setStates] = useState(() => statesOf(data));
  if (synced !== data) {
    setSynced(data);
    setSaved(statesOf(data));
    setStates(statesOf(data));
  }

  const [roleId, setRoleId] = useState(() => data.roles.find((r) => r.id === initialRoleId)?.id ?? data.roles[0]?.id ?? "");
  const [path, setPath] = useState<string[]>([]);
  const [direction, setDirection] = useState<"in" | "back">("in");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  const role = data.roles.find((r) => r.id === roleId) ?? data.roles[0];
  const state = role ? states[role.id] : undefined;
  const before = role ? saved[role.id] : undefined;
  const canEdit = data.canEdit;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (flash) document.getElementById(`rr-${flash}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [flash, path]);

  const changes = useMemo(
    () => (state && before ? describeChanges(tree, index, before, state, seen) : []),
    [tree, index, before, state, seen],
  );

  if (!role || !state || !before) {
    return <p className="text-sm text-foreground/60">Aucun rôle à régler.</p>;
  }

  const current = path.length ? index.byKey.get(path[path.length - 1]) : undefined;
  const open = (n: RightsNode) => isOpen(n, state, seen);
  const reachable = (n: RightsNode) => isReachable(n, index, state, seen);
  const canEnter = (n: RightsNode) => open(n) && (n.children.length > 0 || n.screens.length > 0);
  const newNodes = all.filter((n) => isNewKey(n.key, seen, state));

  function notify(notices: RightsNotice[]) {
    for (const n of notices) {
      if (n.tone === "warning") toast.warning(n.title, { description: n.text });
      else toast.info(n.title, { description: n.text });
    }
  }

  function mutate(fn: (s: RoleRightsState) => RightsNotice[]) {
    if (!canEdit || !role || !state) return;
    const next = cloneState(state);
    const notices = fn(next);
    setStates((prev) => ({ ...prev, [role.id]: next }));
    notify(notices);
  }

  function toggle(n: RightsNode) {
    if (open(n)) mutate((s) => closeNode(n.key, index, s, seen));
    else mutate((s) => openNode(n.key, index, s, seen));
  }

  function keepClosed(n: RightsNode) {
    mutate((s) => {
      for (const k of [n.key, ...(TWIN_KEYS[n.key] ?? [])]) s.hidden.add(k);
      s.reviewed.add(n.key);
      return [];
    });
  }

  function go(next: string[]) {
    setDirection(next.length < path.length ? "back" : "in");
    setPath(next);
  }

  function chainOf(n: RightsNode): string[] {
    const keys: string[] = [];
    for (let cur: RightsNode | undefined = n; cur; cur = cur.parent ? index.byKey.get(cur.parent) : undefined) keys.unshift(cur.key);
    return keys;
  }

  function jump(n: RightsNode) {
    setQuery("");
    setSearchOpen(false);
    go(n.parent ? chainOf(index.byKey.get(n.parent)!) : []);
    setFlash(n.key);
    window.setTimeout(() => setFlash((f) => (f === n.key ? null : f)), 1800);
  }

  function selectRole(id: string) {
    if (id === role?.id) return;
    if (changes.length && !window.confirm("Les modifications non enregistrées de ce rôle seront perdues. Continuer ?")) return;
    if (role) setStates((prev) => ({ ...prev, [role.id]: cloneState(saved[role.id]) }));
    setRoleId(id);
    go([]);
  }

  function undo() {
    if (!role) return;
    setStates((prev) => ({ ...prev, [role.id]: cloneState(saved[role.id]) }));
  }

  function save() {
    if (!role || !state || !before) return;
    const payload = buildPayload(before, state);
    if (isEmptyPayload(payload)) {
      setSummaryOpen(false);
      return;
    }
    const roleRef = role;
    const snapshot = cloneState(state);
    startTransition(async () => {
      const res = await saveRoleRights({ role_id: roleRef.id, payload });
      if (!res.ok) {
        toast.error("Enregistrement refusé", { description: res.error });
        return;
      }
      setSaved((prev) => ({ ...prev, [roleRef.id]: snapshot }));
      setSummaryOpen(false);
      toast.success("Droits enregistrés", { description: `${roleRef.label} : les comptes concernés les ont dès leur prochaine action.` });
      router.refresh();
    });
  }

  function viewAsRole() {
    if (!role) return;
    if (changes.length) {
      toast.warning("Enregistrez d'abord vos modifications", {
        description: "L'aperçu montre les droits enregistrés du rôle.",
      });
      return;
    }
    const target = role;
    startTransition(async () => {
      const res = await startViewAs(target.id);
      if (!res.ok) {
        toast.error("Aperçu impossible", { description: res.error });
        return;
      }
      router.push("/");
      router.refresh();
    });
  }

  /* —— header numbers —— */
  const modules = tree.filter((m) => !m.locked);
  const openModules = modules.filter(open).length;
  const openItems = all.filter((n) => n.kind !== "module" && n.kind !== "right" && reachable(n)).length;
  const openSensitive = all.filter((n) => n.sensitive && reachable(n)).length;
  const sensitiveChanges = changes.filter((c) => c.sensitive).length;

  /* —— search —— */
  const hits = query.trim()
    ? all.filter((n) => norm(n.label).includes(norm(query.trim()))).slice(0, 8)
    : [];

  return (
    <div className="space-y-5 pb-24">
      <section
        className="relative overflow-hidden rounded-[22px] px-6 pt-6 pb-5 text-white shadow-[0_14px_34px_rgba(47,91,234,0.28)]"
        style={{ background: "linear-gradient(120deg,#1a3591 0%,#2f5bea 52%,#7057f5 100%)" }}
      >
        <span aria-hidden className="pointer-events-none absolute -top-32 -right-16 size-64 rounded-full bg-white/10" />
        <span aria-hidden className="pointer-events-none absolute right-48 -bottom-28 size-40 rounded-full bg-white/[0.06]" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-md">
            <p className="text-xs font-semibold text-white/70">Paramètres · الإعدادات</p>
            <h1 className="mt-1 font-display text-[28px] leading-tight font-bold">Droits par rôle · صلاحيات الأدوار</h1>
            <p className="mt-1 text-sm text-white/80">
              Choisissez ce que le rôle {role.label} peut voir et faire, module par module.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Stat
              icon={LayoutGrid}
              value={
                <>
                  {openModules}
                  <small className="text-[13px] font-semibold opacity-70">/{modules.length}</small>
                </>
              }
              label="modules ouverts"
            />
            <Stat icon={CircleCheck} value={openItems} label="onglets et boutons" />
            <Stat icon={TriangleAlert} value={openSensitive} label="accès sensibles" warm />
            <Stat icon={Users} value={role.users} label={role.users > 1 ? "comptes concernés" : "compte concerné"} />
          </div>
        </div>
        <div className="relative mt-5 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-white/15 pt-4">
          <span className="text-[11.5px] font-bold tracking-[0.08em] text-white/70 uppercase">Rôle</span>
          <div className="flex flex-1 flex-wrap gap-1.5" role="tablist" aria-label="Rôle">
            {data.roles.map((r) => {
              const on = r.id === role.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => selectRole(r.id)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-[13px] border py-1 pr-3 pl-1 text-[12.5px] font-semibold transition",
                    on
                      ? "border-white bg-white text-[#1a3591] shadow-[0_8px_20px_rgba(10,20,60,0.28)]"
                      : "border-white/20 bg-white/10 text-white hover:bg-white/20",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-lg text-[10px] font-extrabold",
                      on ? "bg-gradient-to-br from-[#2f5bea] to-[#7057f5] text-white" : "bg-white/20",
                    )}
                  >
                    {initials(r.label)}
                  </span>
                  {r.label}
                  {r.users ? (
                    <span className={cn("rounded-full px-1.5 text-[10.5px] font-bold", on ? "bg-brand-muted text-brand" : "bg-white/20")}>
                      {r.users}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs text-white/75">
              <MapPin className="size-3.5" aria-hidden />
              Périmètre
            </span>
            <div className="inline-flex rounded-xl bg-white/10 p-0.5" role="radiogroup" aria-label="Périmètre des chantiers">
              {(
                [
                  [false, "Tous les chantiers"],
                  [true, "Ses chantiers seulement"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={state.sitesOnly === value}
                  disabled={!canEdit || (value && !role.siteScopedAllowed)}
                  onClick={() =>
                    mutate((s) => {
                      s.sitesOnly = value;
                      return value
                        ? []
                        : [{ tone: "warning", title: "Périmètre élargi", text: "Ce rôle pourra être donné sur tous les chantiers." }];
                    })
                  }
                  className={cn(
                    "rounded-[10px] px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
                    state.sitesOnly === value ? "bg-white text-[#1a3591] shadow" : "text-white/80 hover:bg-white/10",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="flex gap-2.5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-foreground/40" aria-hidden />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => window.setTimeout(() => setSearchOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hits[0]) jump(hits[0]);
              if (e.key === "Escape") setQuery("");
            }}
            placeholder="Rechercher un module, un onglet ou un bouton…"
            aria-label="Rechercher"
            className="h-12 w-full rounded-2xl border border-border/80 bg-surface pr-16 pl-11 text-sm shadow-sm transition outline-none focus:border-brand/50 focus:ring-4 focus:ring-brand/10"
          />
          <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-md border border-border/80 bg-surface-muted px-1.5 py-0.5 text-[11px] font-semibold text-foreground/45">
            Ctrl K
          </kbd>
          {searchOpen && query.trim() ? (
            <div className="absolute inset-x-0 top-[calc(100%+6px)] z-30 max-h-80 overflow-auto rounded-2xl border border-border/80 bg-surface p-1.5 shadow-xl">
              {hits.length ? (
                hits.map((n, i) => {
                  const label = n.label;
                  const at = norm(label).indexOf(norm(query.trim()));
                  const len = query.trim().length;
                  return (
                    <button
                      key={n.key}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => jump(n)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface-muted",
                        i === 0 && "bg-surface-muted/70",
                      )}
                    >
                      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-muted text-brand">
                        <PanelTop className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {label.slice(0, at)}
                          <mark className="rounded bg-amber-200 px-0.5 text-inherit">{label.slice(at, at + len)}</mark>
                          {label.slice(at + len)}
                        </span>
                        <span className="block truncate text-xs text-foreground/55">{pathLabel(n, index) || "Module"}</span>
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          reachable(n) ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-surface-muted text-foreground/55",
                        )}
                      >
                        {reachable(n) ? "Ouvert" : "Fermé"}
                      </span>
                    </button>
                  );
                })
              ) : (
                <p className="px-3 py-2 text-sm text-foreground/55">Aucun résultat.</p>
              )}
            </div>
          ) : null}
        </div>
        {canEdit ? (
          <Button variant="secondary" className="h-12 rounded-2xl" disabled={pending} onClick={viewAsRole}>
            <Eye className="text-brand" aria-hidden />
            Voir comme {role.label}
          </Button>
        ) : null}
      </div>

      {newNodes.length && canEdit ? (
        <div className="flex items-center gap-3 rounded-2xl border border-brand/20 bg-gradient-to-r from-brand-muted to-violet-50 px-4 py-3 text-sm dark:to-violet-950/30">
          <span className="inline-flex size-8 items-center justify-center rounded-xl bg-surface text-brand">
            <Sparkles className="size-4" aria-hidden />
          </span>
          <p className="flex-1">
            <b>
              {newNodes.length} nouvel{newNodes.length > 1 ? "s" : ""} élément{newNodes.length > 1 ? "s" : ""}
            </b>{" "}
            ajouté{newNodes.length > 1 ? "s" : ""} au logiciel : fermé{newNodes.length > 1 ? "s" : ""} pour tous les rôles jusqu&apos;à votre
            décision.
          </p>
          <Button size="sm" onClick={() => jump(newNodes[0])}>
            Examiner
          </Button>
        </div>
      ) : null}

      <div key={`${role.id}:${path.join("/")}`} className={cn("animate-in fade-in-0 duration-300", direction === "in" ? "slide-in-from-right-4" : "slide-in-from-left-4")}>
        {current ? (
          <NodeView
            node={current}
            tint={tintOf(current, index.byKey)}
            path={path}
            roleLabel={role.label}
            index={index}
            state={state}
            seen={seen}
            canEdit={canEdit}
            flash={flash}
            screenLabels={screenLabels}
            onGo={go}
            onToggle={toggle}
            onKeep={keepClosed}
            onAll={(nodes, value) =>
              mutate((s) => nodes.flatMap((n) => (value ? openNode(n.key, index, s, seen, true) : closeNode(n.key, index, s, seen))))
            }
            onAction={(field, value) => mutate((s) => setAction(current, field, value, s))}
            canEnter={canEnter}
          />
        ) : (
          <ModuleGrid
            tree={tree}
            state={state}
            seen={seen}
            canEdit={canEdit}
            flash={flash}
            open={open}
            canEnter={canEnter}
            onOpen={(m) => go([m.key])}
            onToggle={(m) => {
              const wasOpen = open(m);
              toggle(m);
              if (!wasOpen && (m.children.length || m.screens.length)) window.setTimeout(() => go([m.key]), 320);
            }}
          />
        )}
      </div>

      {canEdit && changes.length ? (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-[#0f1a3a] py-2.5 pr-2.5 pl-5 text-sm whitespace-nowrap text-white shadow-[0_18px_40px_rgba(15,26,58,0.35)] animate-in fade-in-0 slide-in-from-bottom-4">
          <span className="size-2 rounded-full bg-amber-400" aria-hidden />
          <span>
            {changes.length} modification{changes.length > 1 ? "s" : ""} non enregistrée{changes.length > 1 ? "s" : ""}
          </span>
          {sensitiveChanges ? (
            <span className="text-xs text-amber-300">
              · {sensitiveChanges} sensible{sensitiveChanges > 1 ? "s" : ""}
            </span>
          ) : null}
          <button type="button" onClick={undo} className="rounded-xl px-3 py-2 font-semibold text-white/75 hover:bg-white/10">
            Annuler
          </button>
          <button
            type="button"
            onClick={() => setSummaryOpen(true)}
            className="rounded-xl bg-[#4f7cff] px-4 py-2 font-semibold text-white hover:bg-[#3f6cf0]"
          >
            Enregistrer…
          </button>
        </div>
      ) : null}

      <Dialog open={summaryOpen} onOpenChange={(v) => !pending && setSummaryOpen(v)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Enregistrer {changes.length} modification{changes.length > 1 ? "s" : ""} pour {role.label} ?
            </DialogTitle>
            <DialogDescription>
              {role.users
                ? `S'applique ${role.users > 1 ? `aux ${role.users} comptes` : "au compte"} de ce rôle dès leur prochaine action.`
                : "Aucun compte n'a encore ce rôle."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] divide-y divide-border/60 overflow-y-auto rounded-2xl border border-border/80">
            {changes.map((c) => (
              <div key={c.key} className={cn("flex items-center gap-3 px-4 py-2.5 text-sm", c.sensitive && "bg-amber-50 dark:bg-amber-500/10")}>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {c.label}
                    {c.sensitive ? <SensitiveTag reason="Accès sensible" /> : null}
                  </p>
                  <p className="truncate text-xs text-foreground/55">{c.path || "Module"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 text-xs">
                  <ValuePill value={c.from} />
                  <span className="text-foreground/40">→</span>
                  <ValuePill value={c.to} />
                </div>
              </div>
            ))}
          </div>
          {sensitiveChanges ? (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                <b>
                  {sensitiveChanges} accès sensible{sensitiveChanges > 1 ? "s" : ""}
                </b>{" "}
                dans ces modifications. Vérifiez avant de confirmer.
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" disabled={pending} onClick={() => setSummaryOpen(false)}>
              Revenir
            </Button>
            <Button disabled={pending} onClick={save}>
              {pending ? "Enregistrement…" : "Confirmer et enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ValuePill({ value }: { value: string }) {
  const tone =
    value === "Ouvert"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
      : value === "Fermé" || value === "Aucune"
        ? "bg-surface-muted text-foreground/60"
        : value === "Nouveau"
          ? "bg-brand-muted text-brand"
          : "bg-brand-muted text-brand";
  return <span className={cn("max-w-[220px] truncate rounded-full px-2 py-0.5 font-semibold", tone)}>{value}</span>;
}

/* —— first screen: the modules —— */

function ModuleGrid({
  tree,
  state,
  seen,
  canEdit,
  flash,
  open,
  canEnter,
  onOpen,
  onToggle,
}: {
  tree: RightsNode[];
  state: RoleRightsState;
  seen: ReadonlySet<string>;
  canEdit: boolean;
  flash: string | null;
  open: (n: RightsNode) => boolean;
  canEnter: (n: RightsNode) => boolean;
  onOpen: (m: RightsNode) => void;
  onToggle: (m: RightsNode) => void;
}) {
  const opened = tree.filter(open);
  const closed = tree.filter((m) => !open(m));
  const card = (m: RightsNode) => {
    const on = open(m);
    const tint = TINTS[m.key] ?? "#2f5bea";
    const Icon = m.icon ? MODULE_ICONS[m.icon] : LayoutGrid;
    const total = m.children.length;
    const openKids = m.children.filter(open);
    const fresh = flatten(m.children).filter((n) => isNewKey(n.key, seen, state)).length;
    const meta = m.locked
      ? "Toujours visible"
      : !on
        ? "Fermé · aucun accès"
        : total
          ? `${openKids.length} sur ${total} ouverts`
          : m.screens.length
            ? PERM_FIELDS.filter((f) => m.screens.every((s) => state.perms[s]?.[f]))
                .map((f) => ACTION_LABELS[f])
                .join(" · ")
            : "Visible";
    const style = { "--tint": tint } as CSSProperties;
    return (
      <div
        key={m.key}
        id={`rr-${m.key}`}
        role="button"
        tabIndex={0}
        onClick={() => canEnter(m) && onOpen(m)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && canEnter(m)) onOpen(m);
        }}
        style={style}
        className={cn(
          "group relative flex min-h-[150px] cursor-pointer flex-col overflow-hidden rounded-[18px] border p-[18px] transition duration-200 outline-none hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-brand/50",
          on
            ? "border-[color-mix(in_srgb,var(--tint)_22%,transparent)] bg-[linear-gradient(165deg,color-mix(in_srgb,var(--tint)_10%,var(--surface))_0%,var(--surface)_58%)] shadow-[0_8px_22px_color-mix(in_srgb,var(--tint)_12%,transparent)] hover:shadow-[0_18px_36px_color-mix(in_srgb,var(--tint)_20%,transparent)]"
            : "border-border/80 bg-surface shadow-sm hover:shadow-md",
          flash === m.key && "ring-4 ring-amber-300/70",
        )}
      >
        <span
          aria-hidden
          className={cn("absolute inset-x-0 top-0 h-1", on ? "bg-[var(--tint)]" : "bg-border/70")}
        />
        <div className="flex items-start justify-between">
          <span
            className={cn(
              "inline-flex size-11 items-center justify-center rounded-[13px]",
              on
                ? "bg-[linear-gradient(135deg,var(--tint),color-mix(in_srgb,var(--tint)_70%,black))] text-white shadow-[0_6px_14px_color-mix(in_srgb,var(--tint)_35%,transparent)]"
                : "bg-[color-mix(in_srgb,var(--tint)_10%,transparent)] text-[var(--tint)] opacity-80",
            )}
          >
            <Icon className="size-[22px]" aria-hidden />
          </span>
          {m.locked ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-surface-muted px-2.5 py-1 text-[11.5px] text-foreground/60">
              <Lock className="size-3" aria-hidden />
              Toujours ouvert
            </span>
          ) : (
            <Switch on={on} disabled={!canEdit} label={`Ouvrir ${m.label}`} onChange={() => onToggle(m)} />
          )}
        </div>
        <p className="mt-3.5 flex flex-wrap items-center gap-1.5 text-[15.5px] font-semibold">
          <span className={cn(!on && "text-foreground/65")}>{m.label}</span>
          {m.sensitive ? <SensitiveTag reason={m.sensitive} /> : null}
          {fresh && canEdit ? <NewTag>{fresh > 1 ? `${fresh} nouveaux` : "1 nouveau"}</NewTag> : null}
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-[12.5px] text-foreground/55">
          {!on ? <Lock className="size-3" aria-hidden /> : null}
          {meta || "Voir"}
        </p>
        {on && openKids.length ? (
          <div className="mt-2.5 mb-3 flex flex-wrap gap-1">
            {openKids.slice(0, 3).map((k) => (
              <span
                key={k.key}
                className="rounded-md border border-[color-mix(in_srgb,var(--tint)_20%,transparent)] bg-surface px-2 py-0.5 text-[11px] font-semibold text-[color-mix(in_srgb,var(--tint)_80%,var(--foreground))]"
              >
                {k.label}
              </span>
            ))}
            {openKids.length > 3 ? (
              <span className="rounded-md bg-[color-mix(in_srgb,var(--tint)_12%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--tint)]">
                +{openKids.length - 3}
              </span>
            ) : null}
          </div>
        ) : null}
        {on && total ? (
          <div className="mt-auto h-[5px] overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--tint)_14%,transparent)]">
            <span className="block h-full rounded-full bg-[var(--tint)]" style={{ width: `${(openKids.length / total) * 100}%` }} />
          </div>
        ) : null}
        {m.locked ? null : (
          <p
            className={cn(
              "flex items-center gap-1 pt-2.5 text-[12.5px] font-semibold",
              on ? "text-[var(--tint)]" : "mt-auto text-foreground/40",
              on && !total && "mt-auto",
            )}
          >
            {on ? (canEnter(m) ? "Configurer" : "Ouvert") : canEdit ? "Activer pour configurer" : "Fermé"}
            {on && canEnter(m) ? <ChevronRight className="size-3.5" aria-hidden /> : null}
          </p>
        )}
      </div>
    );
  };
  return (
    <div className="space-y-3">
      <SectionTitle title="Modules ouverts" count={opened.length} tone="green" hint="Cliquez sur une carte pour régler le détail" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{opened.map(card)}</div>
      {closed.length ? (
        <>
          <SectionTitle title="Modules fermés" count={closed.length} tone="grey" hint="Activez l'interrupteur pour ouvrir" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{closed.map(card)}</div>
        </>
      ) : null}
    </div>
  );
}

function SectionTitle({ title, count, tone, hint }: { title: string; count: number; tone: "green" | "grey"; hint: string }) {
  return (
    <div className="flex items-center gap-2.5 px-1 pt-2">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <span
        className={cn(
          "rounded-full px-2 text-xs font-bold",
          tone === "green" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-surface-muted text-foreground/55",
        )}
      >
        {count}
      </span>
      <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
      <span className="hidden text-xs text-foreground/45 sm:inline">{hint}</span>
    </div>
  );
}

/* —— inside a module, a tab… —— */

function NodeView({
  node,
  tint,
  path,
  roleLabel,
  index,
  state,
  seen,
  canEdit,
  flash,
  screenLabels,
  onGo,
  onToggle,
  onKeep,
  onAll,
  onAction,
  canEnter,
}: {
  node: RightsNode;
  tint: string;
  path: string[];
  roleLabel: string;
  index: ReturnType<typeof indexTree>;
  state: RoleRightsState;
  seen: ReadonlySet<string>;
  canEdit: boolean;
  flash: string | null;
  screenLabels: Map<string, string>;
  onGo: (path: string[]) => void;
  onToggle: (n: RightsNode) => void;
  onKeep: (n: RightsNode) => void;
  onAll: (nodes: RightsNode[], value: boolean) => void;
  onAction: (field: PermField, value: boolean) => void;
  canEnter: (n: RightsNode) => boolean;
}) {
  const open = (n: RightsNode) => isOpen(n, state, seen);
  const nodeOpen = open(node);
  const kids = node.children;
  const openKids = kids.filter(open).length;
  const groups: { title: string; items: RightsNode[] }[] = [];
  for (const k of kids) {
    const g = groups.find((x) => x.title === k.group);
    if (g) g.items.push(k);
    else groups.push({ title: k.group, items: [k] });
  }
  const isModule = !node.parent;
  const Icon = isModule && node.icon ? MODULE_ICONS[node.icon] : node.kind === "button" ? MousePointerClick : node.kind === "right" ? KeyRound : PanelTop;
  const style = { "--tint": tint } as CSSProperties;
  const actions = nodeActions(node, state);

  return (
    <div style={style} className="space-y-4">
      <nav className="flex flex-wrap items-center gap-2 text-sm text-foreground/55" aria-label="Fil d'Ariane">
        <button
          type="button"
          onClick={() => onGo(path.slice(0, -1))}
          aria-label="Retour"
          className="inline-flex size-9 items-center justify-center rounded-xl border border-border/80 bg-surface shadow-sm hover:bg-surface-muted"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </button>
        <button type="button" onClick={() => onGo([])} className="hover:text-brand">
          {roleLabel}
        </button>
        {path.map((key, i) => {
          const n = index.byKey.get(key);
          if (!n) return null;
          return (
            <span key={key} className="flex items-center gap-2">
              <span className="text-foreground/30">/</span>
              {i === path.length - 1 ? (
                <b className="font-semibold text-foreground">{n.label}</b>
              ) : (
                <button type="button" onClick={() => onGo(path.slice(0, i + 1))} className="hover:text-brand">
                  {n.label}
                </button>
              )}
            </span>
          );
        })}
      </nav>

      <section className="relative overflow-hidden rounded-[18px] border border-[color-mix(in_srgb,var(--tint)_22%,transparent)] bg-[linear-gradient(120deg,color-mix(in_srgb,var(--tint)_10%,var(--surface))_0%,var(--surface)_60%)] p-5 shadow-sm">
        <span aria-hidden className="absolute inset-y-0 left-0 w-[5px] bg-[var(--tint)]" />
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex size-[54px] items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--tint),color-mix(in_srgb,var(--tint)_70%,black))] text-white shadow-[0_8px_18px_color-mix(in_srgb,var(--tint)_35%,transparent)]">
            <Icon className="size-[26px]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="flex flex-wrap items-center gap-2 font-display text-[19px] font-semibold">
              {node.label}
              {node.sensitive ? <SensitiveTag reason={node.sensitive} /> : null}
              {isNewKey(node.key, seen, state) && canEdit ? <NewTag /> : null}
            </h2>
            <p className="text-sm text-foreground/55">{node.hint ?? (node.parent ? `Dans ${index.byKey.get(node.parent)?.label}` : "Module")}</p>
          </div>
          <div className="flex items-center gap-3 text-[12.5px] text-foreground/55">
            {kids.length ? (
              <>
                <span>
                  {openKids} / {kids.length}
                </span>
                <span className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-muted">
                  <span className="block h-full rounded-full bg-[var(--tint)] transition-all" style={{ width: `${(openKids / kids.length) * 100}%` }} />
                </span>
              </>
            ) : null}
            {node.locked ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-surface-muted px-2.5 py-1 text-[11.5px]">
                <Lock className="size-3" aria-hidden />
                Toujours ouvert
              </span>
            ) : (
              <Switch on={nodeOpen} disabled={!canEdit} label={`Ouvrir ${node.label}`} onChange={() => onToggle(node)} />
            )}
          </div>
        </div>
        {node.sensitive && nodeOpen ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              <b>Accès sensible.</b> {node.sensitive}. N&apos;ouvrez cet accès qu&apos;aux personnes concernées.
            </p>
          </div>
        ) : null}
      </section>

      {!nodeOpen ? (
        <div className="rounded-2xl border border-border/80 bg-surface px-5 py-4 text-sm shadow-sm">
          <p className="font-semibold text-foreground/70">Fermé pour ce rôle</p>
          <p className="text-foreground/55">Activez l&apos;interrupteur ci-dessus pour choisir le détail.</p>
        </div>
      ) : (
        <>
          {groups.map((g) => {
            const GIcon = groupIcon(g.title, g.items[0]?.kind ?? "tab");
            const togglable = g.items.filter((n) => !n.locked);
            return (
              <section key={g.title} className="space-y-2">
                <div className="flex items-center gap-2.5 px-1">
                  <span className="inline-flex size-6 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--tint)_13%,transparent)] text-[var(--tint)]">
                    <GIcon className="size-3.5" aria-hidden />
                  </span>
                  <h3 className="text-[11.5px] font-bold tracking-[0.07em] text-[var(--tint)] uppercase">{g.title}</h3>
                  <span className="text-[11.5px] text-foreground/40">
                    {g.items.filter(open).length} / {g.items.length}
                  </span>
                  {canEdit && togglable.length > 1 ? (
                    <span className="ml-auto flex gap-1">
                      <button
                        type="button"
                        onClick={() => onAll(togglable, true)}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-brand hover:bg-brand-muted"
                      >
                        Tout ouvrir
                      </button>
                      <button
                        type="button"
                        onClick={() => onAll(togglable, false)}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-brand hover:bg-brand-muted"
                      >
                        Tout fermer
                      </button>
                    </span>
                  ) : null}
                </div>
                <div className="overflow-hidden rounded-[18px] border border-border/80 bg-surface shadow-sm">
                  {g.items.map((n) => (
                    <NodeRow
                      key={n.key}
                      node={n}
                      index={index}
                      state={state}
                      seen={seen}
                      canEdit={canEdit}
                      flash={flash === n.key}
                      enter={canEnter(n)}
                      icon={groupIcon(g.title, n.kind)}
                      onEnter={() => onGo([...path, n.key])}
                      onToggle={() => onToggle(n)}
                      onKeep={() => onKeep(n)}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {node.screens.length ? (
            <section className="space-y-2">
              <div className="flex items-center gap-2.5 px-1">
                <span className="inline-flex size-6 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--tint)_13%,transparent)] text-[var(--tint)]">
                  <KeyRound className="size-3.5" aria-hidden />
                </span>
                <h3 className="text-[11.5px] font-bold tracking-[0.07em] text-[var(--tint)] uppercase">Actions autorisées</h3>
              </div>
              <div className="flex flex-wrap gap-2.5 rounded-[18px] border border-border/80 bg-surface p-4 shadow-sm">
                {PERM_FIELDS.map((f) => {
                  const on = actions[f];
                  const fixed = f === "can_read";
                  return (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={on}
                      disabled={!canEdit || fixed}
                      title={SENSITIVE_ACTIONS[f]}
                      onClick={() => onAction(f, !on)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[13px] font-semibold transition",
                        on
                          ? "border-[color-mix(in_srgb,var(--tint)_40%,transparent)] bg-[color-mix(in_srgb,var(--tint)_10%,transparent)] text-[var(--tint)]"
                          : "border-border/80 bg-surface text-foreground/65 hover:bg-surface-muted",
                        fixed ? "cursor-default opacity-90" : "disabled:cursor-not-allowed disabled:opacity-60",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex size-[18px] items-center justify-center rounded-md border-[1.5px]",
                          on ? "border-[var(--tint)] bg-[var(--tint)] text-white" : "border-border",
                        )}
                      >
                        {on ? <Check className="size-3" strokeWidth={3} aria-hidden /> : null}
                      </span>
                      {ACTION_LABELS[f]}
                      {SENSITIVE_ACTIONS[f] ? <span aria-label="sensible" className="size-[7px] rounded-full bg-amber-500" /> : null}
                    </button>
                  );
                })}
              </div>
              <p className="px-1 text-xs text-foreground/55">
                « Voir » est inclus dès que l&apos;écran est ouvert · « Supprimer » active « Modifier » · point orange : droit sensible. Ces droits
                protègent les données ({node.screens.map((s) => screenLabels.get(s) ?? s).join(", ")}), aussi sur les autres pages qui les
                utilisent.
              </p>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function NodeRow({
  node,
  index,
  state,
  seen,
  canEdit,
  flash,
  enter,
  icon: Icon,
  onEnter,
  onToggle,
  onKeep,
}: {
  node: RightsNode;
  index: ReturnType<typeof indexTree>;
  state: RoleRightsState;
  seen: ReadonlySet<string>;
  canEdit: boolean;
  flash: boolean;
  enter: boolean;
  icon: LucideIcon;
  onEnter: () => void;
  onToggle: () => void;
  onKeep: () => void;
}) {
  const on = isOpen(node, state, seen);
  const fresh = isNewKey(node.key, seen, state);
  const kids = node.children;
  const meta = !on
    ? "Fermé · aucun accès"
    : kids.length
      ? `${kids.filter((k) => isOpen(k, state, seen)).length} sur ${kids.length} ouverts`
      : node.screens.length
        ? PERM_FIELDS.filter((f) => nodeActions(node, state)[f])
            .map((f) => ACTION_LABELS[f])
            .join(" · ")
        : "Visible";
  return (
    <div
      id={`rr-${node.key}`}
      role={enter ? "button" : undefined}
      tabIndex={enter ? 0 : undefined}
      onClick={enter ? onEnter : undefined}
      onKeyDown={(e) => {
        if (enter && (e.key === "Enter" || e.key === " ")) onEnter();
      }}
      className={cn(
        "flex items-center gap-3.5 border-b border-border/50 px-[18px] py-3.5 transition-colors last:border-b-0",
        enter && "cursor-pointer hover:bg-surface-muted/60",
        on && "shadow-[inset_3px_0_0_var(--tint)]",
        flash && "bg-amber-50 dark:bg-amber-500/10",
      )}
    >
      <span
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-[10px]",
          on ? "bg-[color-mix(in_srgb,var(--tint)_13%,transparent)] text-[var(--tint)]" : "bg-surface-muted text-foreground/45",
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("flex flex-wrap items-center gap-1.5 text-sm font-semibold", !on && "text-foreground/60")}>
          {node.label}
          {node.sensitive ? <SensitiveTag reason={node.sensitive} /> : null}
          {fresh && canEdit ? <NewTag /> : null}
        </p>
        <p className="text-xs text-foreground/55">{node.hint && !on ? node.hint : meta || "Voir"}</p>
        {node.requires.length ? (
          <p className="mt-0.5 flex items-center gap-1 text-[11.5px] text-foreground/40">
            <Link2 className="size-3" aria-hidden />
            Nécessite : {node.requires.map((r) => index.byKey.get(r)?.label ?? r).join(", ")}
          </p>
        ) : null}
      </div>
      {fresh && canEdit ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onKeep();
          }}
          className="text-xs text-foreground/55 underline hover:text-foreground"
        >
          Laisser fermé
        </button>
      ) : null}
      {node.locked ? (
        <Lock className="size-4 text-foreground/40" aria-label="Toujours ouvert" />
      ) : (
        <Switch size="sm" on={on} disabled={!canEdit} label={`Ouvrir ${node.label}`} onChange={onToggle} />
      )}
      <ChevronRight className={cn("size-[18px] text-foreground/30", !enter && "invisible")} aria-hidden />
    </div>
  );
}
