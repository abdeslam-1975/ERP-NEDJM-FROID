/**
 * « Droits par rôle »: the modules, tabs and buttons of the interface catalogue (lib/ui/registry.ts) as one tree,
 * each node opened or closed per role (sys_ui_role_hidden) and, when it owns screens of the rights matrix, with the
 * actions the role may take there (sys_permissions). Screens without a tab of their own are listed under their
 * module as « Droits particuliers » (open = may read).
 */
import { PERM_FIELDS, type PermField } from "@/lib/auth/rbac-fields";
import { RH_SECTIONS, findTabset, itemKey, type UiIcon, type UiItemDef, type UiTabsetDef } from "@/lib/ui/registry";

export type RightsKind = "module" | "tab" | "button" | "right";

export type RightsNode = {
  key: string;
  label: string;
  hint: string | null;
  kind: RightsKind;
  /** Title of the list the node is shown in, inside its parent. */
  group: string;
  icon: UiIcon | null;
  /** Always open (home page, settings hub). */
  locked: boolean;
  /** Codes of the sys_screens whose actions are chosen on this node. */
  screens: string[];
  /** Why opening it deserves a second look (salaries, bank accounts, rights…). */
  sensitive: string | null;
  /** Nodes that must be open for this one to work. */
  requires: string[];
  parent: string | null;
  children: RightsNode[];
};

export type PermFlags = Record<PermField, boolean>;

export type ScreenInfo = { code: string; module: string; label_fr: string };

/** Mirrors trg_sys_permissions_non_delegable: never granted to a role. */
export const NON_DELEGABLE_SCREENS = [
  "decision_payroll_reopen",
  "decision_attendance_import_conflict",
  "decision_attendance_import_policy",
];

/** Screens left out: the home page (always open) and features removed from the application. */
const HIDDEN_SCREENS = new Set(["castle", "hr_letters", ...NON_DELEGABLE_SCREENS]);

/** Lists shown under each module of the side menu. */
const MODULE_TABSETS: Record<string, string[]> = {
  simulateur: ["btn_sim_workspace"],
  decisions: ["decisions"],
  rh: ["rh"],
  clients: ["client_fiche"],
  contrats: ["client_contract"],
  finance: ["finance", "finance_settings"],
  achats: ["purchases", "purchase_settings"],
  parametres: ["settings"],
};

/** Lists shown inside a tab (its own tabs and the buttons of its page). */
const ITEM_TABSETS: Record<string, string[]> = {
  "rh.employes": ["btn_rh_employees"],
  "rh.postes": ["btn_rh_postes"],
  "rh.presence": ["hr_attendance"],
  "rh.presence_imports": ["att_imports", "btn_rh_attendance_imports"],
  "rh.exceptions": ["btn_rh_exceptions"],
  "rh.paie": ["btn_rh_payroll_period", "btn_rh_payroll_run", "btn_rh_payroll_links"],
  "rh.declarations": ["btn_rh_payroll_declarations"],
  "rh.couts": ["btn_rh_costs"],
  "rh.documents": ["btn_rh_contracts"],
  "rh.legal_propositions": ["rule_proposals"],
  "rh.legal_veille": ["legal_watch"],
  "rh.parametres": ["rh_settings"],
  "rh_settings.salary": ["salary_rubrics"],
  "rh_settings.legal": ["rh_legal"],
};

/** Screens of the rights matrix owned by a node. */
const NODE_SCREENS: Record<string, string[]> = {
  "nav.decisions": ["decisions"],
  "nav.rh": ["hr_hub"],
  "rh.employes": ["employees"],
  "rh.postes": ["hr_postes"],
  "rh.presence": ["hr_attendance"],
  "rh.presence_imports": ["hr_attendance_import"],
  "att_imports.validation": ["hr_attendance_import_validate"],
  "rh.conges": ["hr_leave"],
  "rh.preparation": ["hr_payroll_preparation"],
  "rh.paie": ["hr_payroll"],
  "rh.exceptions": ["hr_payroll_exceptions"],
  "rh.avances": ["hr_advances"],
  "rh.virements": ["hr_transfers"],
  "rh.declarations": ["hr_payroll_social", "hr_payroll_tax"],
  "rh.operations_externes": ["hr_external_operations"],
  "rh.couts": ["hr_costs"],
  "rh.interim": ["hr_interim"],
  "rh.sorties": ["hr_exits"],
  "rh.documents": ["hr_documents", "contracts", "hr_payroll_slips"],
  "rh.legal_propositions": ["rule_proposals"],
  "rh.legal_documents": ["legal_documents"],
  "rh.legal_extraction": ["legal_ai_extraction"],
  "rh.legal_veille": ["legal_watch"],
  "rh.parametres": ["hr_settings"],
  "rh_settings.legal": ["hr_compliance"],
  "nav.chantiers": ["sites"],
  "nav.activites": ["activity_codes"],
  "nav.clients": ["ref_clients"],
  "nav.contrats": ["ref_contracts", "client_contracts"],
  "nav.finance": ["finance"],
  "nav.achats": ["purchases"],
  "nav.utilisateurs": ["param_users", "users"],
  "nav.roles": ["roles"],
  "settings.permissions": ["permissions"],
  "settings.periodes": ["period_locks"],
  "settings.audit": ["audit"],
  "settings.finance_parametres": ["finance_settings"],
  "settings.achats_parametres": ["purchase_settings"],
};

/** Module receiving the screens without a tab, by sys_screens.module. */
const SCREEN_MODULE: Record<string, string> = {
  hr: "nav.rh",
  rh: "nav.rh",
  ref: "nav.rh",
  decisions: "nav.decisions",
  com: "nav.contrats",
  finance: "nav.finance",
  achats: "nav.achats",
  admin: "nav.parametres",
};

/** Catalogue items that block the same page: opened and closed together. */
export const TWIN_KEYS: Record<string, string[]> = { "rh_settings.legal": ["rh.legal"] };

const SENSITIVE: Record<string, string> = {
  "rh.paie": "Salaires de tous les employés",
  "rh.virements": "Montants des salaires et comptes bancaires",
  "rh.declarations": "Données sociales et fiscales",
  "btn_rh_payroll_run.validate": "Valide les salaires du mois",
  "btn_rh_payroll_run.request_reopen": "Rouvre une paie validée",
  "btn_rh_payroll_run.close": "Fige définitivement le mois",
  "nav.finance": "Comptes bancaires et caisse",
  "nav.utilisateurs": "Création et suppression de comptes",
  "nav.roles": "Rôles de tous les comptes",
  "settings.permissions": "Droits de tous les rôles",
};

const REQUIRES: Record<string, string[]> = {
  "rh.virements": ["rh.paie"],
  "rh.declarations": ["rh.paie"],
  "rh.presence_imports": ["rh.presence"],
  "att_imports.validation": ["att_imports.lots"],
  "btn_rh_payroll_run.validate": ["btn_rh_payroll_period.generate"],
  "btn_rh_payroll_run.close": ["btn_rh_payroll_run.validate"],
};

export const ACTION_LABELS: Record<PermField, string> = {
  can_read: "Voir",
  can_create: "Créer",
  can_update: "Modifier",
  can_delete: "Supprimer",
  can_print: "Imprimer",
  can_export: "Exporter",
};

export const SENSITIVE_ACTIONS: Partial<Record<PermField, string>> = {
  can_delete: "Suppression définitive de données",
  can_export: "Données copiées hors du logiciel",
};

/** An action that needs another one: « Supprimer » comes with « Modifier ». */
export const ACTION_REQUIRES: Partial<Record<PermField, PermField[]>> = { can_delete: ["can_update"] };

export const NO_RIGHTS: PermFlags = {
  can_read: false,
  can_create: false,
  can_update: false,
  can_delete: false,
  can_print: false,
  can_export: false,
};

function shown(item: UiItemDef): boolean {
  return !item.alias && !item.superAdminOnly && !item.inSettings;
}

function listTitle(tabset: UiTabsetDef, siblings: UiTabsetDef[], index: number): string {
  const kind = tabset.kind === "toolbar";
  if (index > 0 && tabset.key.endsWith("_settings")) return "Paramètres";
  const sameKind = siblings.filter((t) => (t.kind === "toolbar") === kind).length;
  if (sameKind > 1 && index > 0) return tabset.titleFr;
  return kind ? "Boutons" : "Onglets";
}

function itemNodes(tabsetKeys: string[], parent: string): RightsNode[] {
  const tabsets = tabsetKeys.map((k) => findTabset(k)).filter((t): t is UiTabsetDef => Boolean(t));
  return tabsets.flatMap((tabset, index) =>
    tabset.items.filter(shown).map((item) => {
      const key = itemKey(tabset.key, item.id);
      const group =
        tabset.key === "rh"
          ? (RH_SECTIONS.find((s) => s.key === item.section)?.titleFr ?? "Onglets")
          : listTitle(tabset, tabsets, index);
      return node(key, item.labelFr, tabset.kind === "toolbar" ? "button" : "tab", group, parent, ITEM_TABSETS[key] ?? []);
    }),
  );
}

function node(key: string, label: string, kind: RightsKind, group: string, parent: string | null, tabsets: string[]): RightsNode {
  return {
    key,
    label,
    hint: null,
    kind,
    group,
    icon: null,
    locked: false,
    screens: NODE_SCREENS[key] ?? [],
    sensitive: SENSITIVE[key] ?? null,
    requires: REQUIRES[key] ?? [],
    parent,
    children: itemNodes(tabsets, key),
  };
}

/** The modules of the side menu and everything inside them (catalogue only, without the extra screens). */
export function buildCatalogTree(): RightsNode[] {
  return (findTabset("nav")?.items ?? []).map((item) => {
    const key = itemKey("nav", item.id);
    const mod = node(key, item.labelFr, "module", "Modules", null, MODULE_TABSETS[item.id] ?? []);
    return { ...mod, icon: item.icon ?? null, locked: Boolean(item.locked) };
  });
}

/** Catalogue tree plus, under each module, the screens of the matrix that no tab owns. */
export function buildRightsTree(screens: ScreenInfo[]): RightsNode[] {
  const tree = buildCatalogTree();
  const owned = new Set(Object.values(NODE_SCREENS).flat());
  for (const screen of screens) {
    if (owned.has(screen.code) || HIDDEN_SCREENS.has(screen.code)) continue;
    const mod = tree.find((m) => m.key === SCREEN_MODULE[screen.module]);
    if (!mod) continue;
    const [label, ...rest] = screen.label_fr.split(" · ");
    mod.children.push({
      key: `perm.${screen.code}`,
      label: label.trim(),
      hint: rest.join(" · ").trim() || null,
      kind: "right",
      group: "Droits particuliers",
      icon: null,
      locked: false,
      screens: [screen.code],
      sensitive: null,
      requires: [],
      parent: mod.key,
      children: [],
    });
  }
  return tree;
}

export function flatten(tree: RightsNode[]): RightsNode[] {
  return tree.flatMap((n) => [n, ...flatten(n.children)]);
}

/** Catalogue keys a role can open or close (stored in sys_ui_role_hidden), twins included. */
export const RIGHTS_ITEM_KEYS: ReadonlySet<string> = new Set(
  flatten(buildCatalogTree())
    .filter((n) => !n.locked)
    .flatMap((n) => [n.key, ...(TWIN_KEYS[n.key] ?? [])]),
);

/** Catalogue keys added after the last review: closed for every role until the super admin decides. */
export function unseenKeys(seen: ReadonlySet<string>): string[] {
  if (!seen.size) return [];
  return [...RIGHTS_ITEM_KEYS].filter((key) => !seen.has(key));
}

/* —— state of one role —— */

export type RoleRightsState = {
  hidden: Set<string>;
  perms: Record<string, PermFlags>;
  sitesOnly: boolean;
  /** New catalogue keys decided during this session (opened, or kept closed). */
  reviewed: Set<string>;
};

export type RightsIndex = { byKey: Map<string, RightsNode>; neededBy: Map<string, string[]> };

export function indexTree(tree: RightsNode[]): RightsIndex {
  const byKey = new Map(flatten(tree).map((n) => [n.key, n]));
  const neededBy = new Map<string, string[]>();
  for (const n of byKey.values()) {
    for (const r of n.requires) neededBy.set(r, [...(neededBy.get(r) ?? []), n.key]);
  }
  return { byKey, neededBy };
}

export function cloneState(s: RoleRightsState): RoleRightsState {
  return {
    hidden: new Set(s.hidden),
    perms: Object.fromEntries(Object.entries(s.perms).map(([k, v]) => [k, { ...v }])),
    sitesOnly: s.sitesOnly,
    reviewed: new Set(s.reviewed),
  };
}

export function isNewKey(key: string, seen: ReadonlySet<string>, state: RoleRightsState): boolean {
  return seen.size > 0 && RIGHTS_ITEM_KEYS.has(key) && !seen.has(key) && !state.reviewed.has(key);
}

export function isOpen(n: RightsNode, state: RoleRightsState, seen: ReadonlySet<string>): boolean {
  if (n.locked) return true;
  if (n.kind === "right") return Boolean(state.perms[n.screens[0]]?.can_read);
  if (state.hidden.has(n.key) || isNewKey(n.key, seen, state)) return false;
  return n.screens.every((s) => state.perms[s]?.can_read);
}

/** Open from the module down to the node. */
export function isReachable(n: RightsNode, index: RightsIndex, state: RoleRightsState, seen: ReadonlySet<string>): boolean {
  for (let cur: RightsNode | undefined = n; cur; cur = cur.parent ? index.byKey.get(cur.parent) : undefined) {
    if (!isOpen(cur, state, seen)) return false;
  }
  return true;
}

export type RightsNotice = { tone: "warning" | "info"; title: string; text: string };

function withTwins(key: string): string[] {
  return [key, ...(TWIN_KEYS[key] ?? [])];
}

/** Opens the node, its parents and what it needs; returns the notices to show. */
export function openNode(
  key: string,
  index: RightsIndex,
  state: RoleRightsState,
  seen: ReadonlySet<string>,
  quiet = false,
): RightsNotice[] {
  const n = index.byKey.get(key);
  if (!n) return [];
  const notices: RightsNotice[] = [];
  const chain: RightsNode[] = [];
  for (let cur: RightsNode | undefined = n; cur; cur = cur.parent ? index.byKey.get(cur.parent) : undefined) chain.push(cur);
  for (const cur of chain) {
    if (cur.locked || isOpen(cur, state, seen)) continue;
    if (cur.kind !== "right") {
      for (const k of withTwins(cur.key)) state.hidden.delete(k);
      if (seen.size && !seen.has(cur.key)) state.reviewed.add(cur.key);
    }
    for (const s of cur.screens) state.perms[s] = { ...(state.perms[s] ?? NO_RIGHTS), can_read: true };
  }
  if (n.sensitive && !quiet) notices.push({ tone: "warning", title: `Accès sensible : ${n.label}`, text: `${n.sensitive}.` });
  for (const r of n.requires) {
    const dep = index.byKey.get(r);
    if (dep && !isReachable(dep, index, state, seen)) {
      openNode(r, index, state, seen, true);
      notices.push({ tone: "info", title: `« ${dep.label} » ouvert automatiquement`, text: `Nécessaire pour « ${n.label} ».` });
    }
  }
  return notices;
}

/** Closes the node, everything inside it and what depends on it. */
export function closeNode(key: string, index: RightsIndex, state: RoleRightsState, seen: ReadonlySet<string>): RightsNotice[] {
  const n = index.byKey.get(key);
  if (!n || n.locked) return [];
  const notices: RightsNotice[] = [];
  const closed: RightsNode[] = [];
  (function walk(cur: RightsNode) {
    if (cur.kind === "right") state.perms[cur.screens[0]] = { ...NO_RIGHTS };
    else {
      for (const k of withTwins(cur.key)) state.hidden.add(k);
      if (seen.size && !seen.has(cur.key) && cur === n) state.reviewed.add(cur.key);
    }
    closed.push(cur);
    cur.children.forEach(walk);
  })(n);
  for (const c of closed) {
    for (const d of index.neededBy.get(c.key) ?? []) {
      const dep = index.byKey.get(d);
      if (dep && isOpen(dep, state, seen) && !closed.includes(dep)) {
        notices.push(...closeNode(d, index, state, seen));
        notices.push({ tone: "info", title: `« ${dep.label} » fermé aussi`, text: `Il dépend de « ${c.label} ».` });
      }
    }
  }
  return notices;
}

/** Actions shown on a node: an action is on when every screen of the node has it. */
export function nodeActions(n: RightsNode, state: RoleRightsState): PermFlags {
  const out = { ...NO_RIGHTS };
  for (const f of PERM_FIELDS) out[f] = n.screens.length > 0 && n.screens.every((s) => Boolean(state.perms[s]?.[f]));
  return out;
}

export function setAction(n: RightsNode, field: PermField, value: boolean, state: RoleRightsState): RightsNotice[] {
  const notices: RightsNotice[] = [];
  const fields: PermField[] = [field];
  if (value) {
    for (const dep of ACTION_REQUIRES[field] ?? []) {
      if (!nodeActions(n, state)[dep]) {
        fields.push(dep);
        notices.push({ tone: "info", title: `« ${ACTION_LABELS[dep]} » activé automatiquement`, text: `Nécessaire pour « ${ACTION_LABELS[field]} ».` });
      }
    }
    if (SENSITIVE_ACTIONS[field]) {
      notices.push({ tone: "warning", title: `Droit sensible : ${ACTION_LABELS[field]}`, text: `${SENSITIVE_ACTIONS[field]} dans « ${n.label} ».` });
    }
  } else {
    for (const [other, deps] of Object.entries(ACTION_REQUIRES) as [PermField, PermField[]][]) {
      if (deps.includes(field) && nodeActions(n, state)[other]) {
        fields.push(other);
        notices.push({ tone: "info", title: `« ${ACTION_LABELS[other]} » désactivé aussi`, text: `Il nécessite « ${ACTION_LABELS[field]} ».` });
      }
    }
  }
  for (const s of n.screens) {
    const next = { ...(state.perms[s] ?? NO_RIGHTS) };
    for (const f of fields) next[f] = value;
    if (value) next.can_read = true;
    if (field === "can_read" && !value) Object.assign(next, NO_RIGHTS);
    state.perms[s] = next;
  }
  return notices;
}

/* —— what changed —— */

export type RightsChange = { key: string; label: string; path: string; from: string; to: string; sensitive: boolean };

function actionsText(flags: PermFlags): string {
  const on = PERM_FIELDS.filter((f) => flags[f]).map((f) => ACTION_LABELS[f]);
  return on.length ? on.join(" · ") : "Aucune";
}

export function pathLabel(n: RightsNode, index: RightsIndex): string {
  const parts: string[] = [];
  for (let cur = n.parent ? index.byKey.get(n.parent) : undefined; cur; cur = cur.parent ? index.byKey.get(cur.parent) : undefined) {
    parts.unshift(cur.label);
  }
  return parts.join(" › ");
}

export function describeChanges(
  tree: RightsNode[],
  index: RightsIndex,
  before: RoleRightsState,
  after: RoleRightsState,
  seen: ReadonlySet<string>,
): RightsChange[] {
  const out: RightsChange[] = [];
  if (before.sitesOnly !== after.sitesOnly) {
    out.push({
      key: "scope",
      label: "Périmètre des chantiers",
      path: "Rôle",
      from: before.sitesOnly ? "Ses chantiers seulement" : "Tous les chantiers",
      to: after.sitesOnly ? "Ses chantiers seulement" : "Tous les chantiers",
      sensitive: !after.sitesOnly,
    });
  }
  for (const n of flatten(tree)) {
    const wasOpen = isOpen(n, before, seen);
    const nowOpen = isOpen(n, after, seen);
    const decidedNew = after.reviewed.has(n.key) && !before.reviewed.has(n.key);
    if (wasOpen !== nowOpen || (decidedNew && !nowOpen)) {
      out.push({
        key: n.key,
        label: n.label,
        path: pathLabel(n, index),
        from: decidedNew ? "Nouveau" : wasOpen ? "Ouvert" : "Fermé",
        to: nowOpen ? "Ouvert" : "Fermé",
        sensitive: nowOpen && Boolean(n.sensitive),
      });
      continue;
    }
    if (n.kind === "right" || !n.screens.length || !nowOpen) continue;
    const a = nodeActions(n, before);
    const b = nodeActions(n, after);
    if (PERM_FIELDS.some((f) => a[f] !== b[f])) {
      out.push({
        key: `${n.key}#actions`,
        label: n.label,
        path: pathLabel(n, index),
        from: actionsText(a),
        to: actionsText(b),
        sensitive: (Object.keys(SENSITIVE_ACTIONS) as PermField[]).some((f) => b[f] && !a[f]),
      });
    }
  }
  return out;
}

export type RoleRightsPayload = {
  hide: string[];
  show: string[];
  perms: { screen: string; flags: PermFlags }[];
  sitesOnly: boolean | null;
  reviewed: string[];
};

export function buildPayload(before: RoleRightsState, after: RoleRightsState): RoleRightsPayload {
  const screens = new Set([...Object.keys(before.perms), ...Object.keys(after.perms)]);
  const perms: RoleRightsPayload["perms"] = [];
  for (const screen of screens) {
    const a = before.perms[screen] ?? NO_RIGHTS;
    const b = after.perms[screen] ?? NO_RIGHTS;
    if (PERM_FIELDS.some((f) => a[f] !== b[f])) perms.push({ screen, flags: { ...b } });
  }
  return {
    hide: [...after.hidden].filter((k) => !before.hidden.has(k)),
    show: [...before.hidden].filter((k) => !after.hidden.has(k)),
    perms,
    sitesOnly: before.sitesOnly === after.sitesOnly ? null : after.sitesOnly,
    reviewed: [...after.reviewed].filter((k) => !before.reviewed.has(k)),
  };
}

export function isEmptyPayload(p: RoleRightsPayload): boolean {
  return !p.hide.length && !p.show.length && !p.perms.length && p.sitesOnly === null && !p.reviewed.length;
}
