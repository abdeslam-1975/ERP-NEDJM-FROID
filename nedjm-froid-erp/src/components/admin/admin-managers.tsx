"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  listAuditLogs,
  saveRole,
  setPeriodLock,
  setPermission,
  type AuditRow,
  type PeriodLockRow,
  type PermissionRow,
  type RoleRow,
  type ScreenRow,
} from "@/lib/actions/admin-rbac";
import { PERM_FIELDS, PERM_LABELS, permissionPatch, type PermField } from "@/lib/auth/rbac-fields";
import { Button } from "@/components/ui/button";
import { RhAlert, RhChip, RhField, RhModal, RhTableWrap, RhToolbar, rhInput, rhTd, rhTh } from "@/components/rh/rh-ui";

const MONTHS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

/* ------------------------------------------------------------------ Roles */

type RoleForm = Omit<RoleRow, "users" | "is_system" | "id"> & { id?: string; is_system?: boolean };

const emptyRole = (): RoleForm => ({
  code: "",
  label_fr: "",
  label_ar: "",
  hierarchy_level: 30,
  require_mfa: false,
  site_scoped_allowed: true,
  is_active: true,
});

export function RolesManager({ initialRoles, canEdit }: { initialRoles: RoleRow[]; canEdit: boolean }) {
  const [roles, setRoles] = useState(initialRoles);
  const [form, setForm] = useState<RoleForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    if (!form) return;
    setError(null);
    start(async () => {
      const r = await saveRole({ ...form, id: form.id });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const next: RoleRow = {
        ...form,
        id: r.data.id,
        code: form.code.trim().toUpperCase(),
        is_system: form.is_system ?? false,
        users: roles.find((x) => x.id === r.data.id)?.users ?? 0,
      };
      setRoles((prev) =>
        [...prev.filter((x) => x.id !== r.data.id), next].sort((a, b) => b.hierarchy_level - a.hierarchy_level),
      );
      setForm(null);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-foreground/65">
          Le niveau hiérarchique ordonne les rôles (100 = SUPER_ADMIN). Les rôles système gardent leur code : ils sont utilisés
          par les règles d&apos;accès en base. Les droits par écran se règlent dans la{" "}
          <Link className="text-brand underline" href="/administration/permissions">
            matrice des droits
          </Link>
          .
        </p>
        {canEdit ? (
          <Button className="ml-auto" onClick={() => setForm(emptyRole())}>
            Nouveau rôle
          </Button>
        ) : null}
      </div>
      {error && !form ? <RhAlert tone="danger">{error}</RhAlert> : null}
      <RhTableWrap>
        <table className="min-w-full text-sm">
          <thead className="border-b border-border/70 bg-surface-muted/80">
            <tr>
              <th className={rhTh()}>Code</th>
              <th className={rhTh()}>Libellé</th>
              <th className={rhTh()}>Niveau</th>
              <th className={rhTh()}>Options</th>
              <th className={rhTh()}>Utilisateurs</th>
              <th className={rhTh()} />
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id} className="border-b border-border/60">
                <td className={`${rhTd()} font-mono font-semibold`}>
                  {r.code} {r.is_system ? <RhChip>système</RhChip> : null}
                </td>
                <td className={rhTd()}>
                  {r.label_fr}
                  {r.label_ar ? (
                    <span className="block text-xs text-foreground/60" dir="rtl">
                      {r.label_ar}
                    </span>
                  ) : null}
                </td>
                <td className={`${rhTd()} tabular-nums`}>{r.hierarchy_level}</td>
                <td className={rhTd()}>
                  <div className="flex flex-wrap gap-1">
                    {r.require_mfa ? <RhChip tone="warning">MFA</RhChip> : null}
                    {r.site_scoped_allowed ? <RhChip>par chantier</RhChip> : <RhChip tone="brand">global</RhChip>}
                    {!r.is_active ? <RhChip tone="danger">inactif</RhChip> : null}
                  </div>
                </td>
                <td className={`${rhTd()} tabular-nums`}>{r.users}</td>
                <td className={rhTd()}>
                  {canEdit && r.code !== "SUPER_ADMIN" ? (
                    <Button variant="secondary" onClick={() => setForm({ ...r, label_ar: r.label_ar ?? "" })}>
                      Modifier
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </RhTableWrap>
      {form ? (
        <RhModal
          title={form.id ? `Rôle ${form.code}` : "Nouveau rôle"}
          onClose={() => setForm(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setForm(null)}>
                Fermer
              </Button>
              <Button disabled={pending} onClick={submit}>
                Enregistrer
              </Button>
            </>
          }
        >
          {error ? (
            <div className="mb-3">
              <RhAlert tone="danger">{error}</RhAlert>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <RhField label="Code" hint="A-Z, 0-9, _">
              <input
                className={rhInput}
                value={form.code}
                disabled={form.is_system}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              />
            </RhField>
            <RhField label="Niveau hiérarchique (0-99)">
              <input
                className={rhInput}
                type="number"
                min={0}
                max={99}
                value={form.hierarchy_level}
                onChange={(e) => setForm({ ...form, hierarchy_level: Number(e.target.value) })}
              />
            </RhField>
            <RhField label="Libellé (FR)">
              <input className={rhInput} value={form.label_fr} onChange={(e) => setForm({ ...form, label_fr: e.target.value })} />
            </RhField>
            <RhField label="Libellé (AR)">
              <input
                className={rhInput}
                dir="rtl"
                value={form.label_ar ?? ""}
                onChange={(e) => setForm({ ...form, label_ar: e.target.value })}
              />
            </RhField>
            {(
              [
                ["require_mfa", "Double authentification exigée"],
                ["site_scoped_allowed", "Attribution par chantier autorisée"],
                ["is_active", "Actif"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form[key]}
                  disabled={key === "is_active" && form.is_system}
                  onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>
        </RhModal>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ Permissions */

export function PermissionMatrix({
  roles,
  screens,
  initialPermissions,
  canEdit,
}: {
  roles: RoleRow[];
  screens: ScreenRow[];
  initialPermissions: PermissionRow[];
  canEdit: boolean;
}) {
  const [perms, setPerms] = useState(initialPermissions);
  const [module, setModule] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const editableRoles = roles.filter((r) => r.is_active);
  const modules = useMemo(() => [...new Set(screens.map((s) => s.module))].sort(), [screens]);
  const shown = screens.filter((s) => !module || s.module === module);
  const key = (roleId: string, screenId: string) => `${roleId}:${screenId}`;
  const byKey = useMemo(() => new Map(perms.map((p) => [key(p.role_id, p.screen_id), p])), [perms]);

  function toggle(role: RoleRow, screen: ScreenRow, field: PermField) {
    const current = byKey.get(key(role.id, screen.id));
    const value = !(current?.[field] ?? false);
    setError(null);
    const patch = permissionPatch(field, value);
    const base: PermissionRow = current ?? {
      role_id: role.id,
      screen_id: screen.id,
      can_read: false,
      can_create: false,
      can_update: false,
      can_delete: false,
      can_print: false,
      can_export: false,
    };
    const next = { ...base, ...patch };
    setPerms((prev) => [...prev.filter((p) => key(p.role_id, p.screen_id) !== key(role.id, screen.id)), next]);
    start(async () => {
      const r = await setPermission({ role_id: role.id, screen_id: screen.id, field, value });
      if (!r.ok) {
        setError(r.error);
        setPerms((prev) => [...prev.filter((p) => key(p.role_id, p.screen_id) !== key(role.id, screen.id)), base]);
      }
    });
  }

  return (
    <div className="space-y-4">
      <RhToolbar>
        <RhField label="Module">
          <select className={rhInput} value={module} onChange={(e) => setModule(e.target.value)}>
            <option value="">Tous</option>
            {modules.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </RhField>
        <p className="max-w-xl text-xs text-foreground/60">
          L = lire, C = créer, M = modifier, S = supprimer, I = imprimer, E = exporter. Ces droits alimentent les règles
          d&apos;accès en base (RLS) ; SUPER_ADMIN a toujours tous les droits. Toute modification est journalisée.
        </p>
      </RhToolbar>
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {!canEdit ? <RhAlert tone="info">Lecture seule : seul le SUPER_ADMIN modifie la matrice.</RhAlert> : null}
      <RhTableWrap>
        <table className="min-w-full text-xs">
          <thead className="border-b border-border/70 bg-surface-muted/80">
            <tr>
              <th className={`${rhTh()} sticky left-0 bg-surface-muted`} rowSpan={2}>
                Écran
              </th>
              {editableRoles.map((r) => (
                <th key={r.id} className={`${rhTh()} border-l border-border/60 text-center`} colSpan={PERM_FIELDS.length}>
                  {r.code}
                </th>
              ))}
            </tr>
            <tr>
              {editableRoles.map((r) => (
                <Fragment key={r.id}>
                  {PERM_FIELDS.map((f, i) => (
                    <th
                      key={f}
                      title={PERM_LABELS[f]}
                      className={`px-1 py-1 text-center font-mono text-[10px] text-foreground/55 ${i === 0 ? "border-l border-border/60" : ""}`}
                    >
                      {PERM_LABELS[f][0]}
                    </th>
                  ))}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id} className="border-b border-border/50 hover:bg-surface-muted/40">
                <td className={`${rhTd()} sticky left-0 bg-surface`}>
                  <span className="font-semibold">{s.label_fr}</span>
                  <span className="block font-mono text-[10px] text-foreground/45">
                    {s.code} · {s.path}
                  </span>
                </td>
                {editableRoles.map((r) => {
                  const p = byKey.get(key(r.id, s.id));
                  const locked = r.code === "SUPER_ADMIN";
                  return PERM_FIELDS.map((f, i) => (
                    <td key={`${r.id}-${f}`} className={`px-1 text-center ${i === 0 ? "border-l border-border/60" : ""}`}>
                      <input
                        type="checkbox"
                        aria-label={`${r.code} ${s.code} ${PERM_LABELS[f]}`}
                        checked={locked ? true : Boolean(p?.[f])}
                        disabled={!canEdit || locked || pending}
                        onChange={() => toggle(r, s, f)}
                      />
                    </td>
                  ));
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </RhTableWrap>
    </div>
  );
}

/* ------------------------------------------------------------------ Audit */

function diffKeys(a: Record<string, unknown> | null, b: Record<string, unknown> | null) {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  return [...keys].filter(
    (k) => k !== "updated_at" && JSON.stringify(a?.[k] ?? null) !== JSON.stringify(b?.[k] ?? null),
  );
}

function short(v: unknown) {
  const s = v == null ? "∅" : typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

export function AuditViewer({
  initialRows,
  initialHasMore,
  tables,
  loadError,
}: {
  initialRows: AuditRow[];
  initialHasMore: boolean;
  tables: string[];
  loadError?: string;
}) {
  const [rows, setRows] = useState(initialRows);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({ table: "", action: "", target: "", from: "", to: "" });
  const [detail, setDetail] = useState<AuditRow | null>(null);
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [pending, start] = useTransition();

  function load(nextPage: number) {
    setError(null);
    start(async () => {
      const r = await listAuditLogs({ ...filters, page: nextPage });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setRows(r.data.rows);
      setHasMore(r.data.hasMore);
      setPage(nextPage);
    });
  }

  return (
    <div className="space-y-4">
      <RhToolbar>
        <RhField label="Table">
          <select className={rhInput} value={filters.table} onChange={(e) => setFilters({ ...filters, table: e.target.value })}>
            <option value="">Toutes</option>
            {tables.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </RhField>
        <RhField label="Action">
          <select className={rhInput} value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })}>
            <option value="">Toutes</option>
            {["CREATE", "UPDATE", "DELETE", "LOGIN", "PRINT", "EXPORT", "REVERSE"].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </RhField>
        <RhField label="Identifiant ciblé">
          <input className={rhInput} value={filters.target} onChange={(e) => setFilters({ ...filters, target: e.target.value })} />
        </RhField>
        <RhField label="Du">
          <input className={rhInput} type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        </RhField>
        <RhField label="Au">
          <input className={rhInput} type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        </RhField>
        <Button disabled={pending} onClick={() => load(0)}>
          Filtrer
        </Button>
      </RhToolbar>
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      <RhTableWrap>
        <table className="min-w-full text-sm">
          <thead className="border-b border-border/70 bg-surface-muted/80">
            <tr>
              <th className={rhTh()}>Date</th>
              <th className={rhTh()}>Utilisateur</th>
              <th className={rhTh()}>Action</th>
              <th className={rhTh()}>Table</th>
              <th className={rhTh()}>Champs modifiés</th>
              <th className={rhTh()} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className={`${rhTd()} py-6 text-center text-foreground/55`}>
                  Aucune entrée (ou droit « Journal d&apos;audit » manquant).
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const changed = r.action === "UPDATE" ? diffKeys(r.old_values, r.new_values) : [];
                return (
                  <tr key={`${r.id}-${r.occurred_at}`} className="border-b border-border/60">
                    <td className={`${rhTd()} whitespace-nowrap tabular-nums`}>{new Date(r.occurred_at).toLocaleString("fr-FR")}</td>
                    <td className={rhTd()}>{r.user_name ?? (r.user_id ? r.user_id.slice(0, 8) : "système")}</td>
                    <td className={rhTd()}>
                      <RhChip tone={r.action === "DELETE" ? "danger" : r.action === "CREATE" ? "success" : "neutral"}>{r.action}</RhChip>
                    </td>
                    <td className={`${rhTd()} font-mono text-xs`}>{r.table_name}</td>
                    <td className={`${rhTd()} text-xs text-foreground/70`}>{changed.slice(0, 6).join(", ") || "—"}</td>
                    <td className={rhTd()}>
                      <Button variant="ghost" onClick={() => setDetail(r)}>
                        Détail
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </RhTableWrap>
      <div className="flex items-center gap-2 text-sm">
        <Button variant="secondary" disabled={pending || page === 0} onClick={() => load(page - 1)}>
          Précédent
        </Button>
        <span className="tabular-nums">Page {page + 1}</span>
        <Button variant="secondary" disabled={pending || !hasMore} onClick={() => load(page + 1)}>
          Suivant
        </Button>
      </div>
      {detail ? (
        <RhModal title={`${detail.action} · ${detail.table_name}`} onClose={() => setDetail(null)} size="lg">
          <p className="mb-3 text-xs text-foreground/60">
            {new Date(detail.occurred_at).toLocaleString("fr-FR")} · {detail.user_name ?? "système"} · cible{" "}
            <span className="font-mono">{detail.target_id ?? "—"}</span>
          </p>
          <table className="min-w-full text-xs">
            <thead>
              <tr>
                <th className={rhTh()}>Champ</th>
                <th className={rhTh()}>Avant</th>
                <th className={rhTh()}>Après</th>
              </tr>
            </thead>
            <tbody>
              {(detail.action === "UPDATE"
                ? diffKeys(detail.old_values, detail.new_values)
                : Object.keys(detail.new_values ?? detail.old_values ?? {})
              ).map((k) => (
                <tr key={k} className="border-b border-border/50">
                  <td className={`${rhTd()} font-mono`}>{k}</td>
                  <td className={`${rhTd()} break-all`}>{short(detail.old_values?.[k])}</td>
                  <td className={`${rhTd()} break-all`}>{short(detail.new_values?.[k])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </RhModal>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- Periods */

export function PeriodLocksManager({
  year,
  initialLocks,
  payroll,
  canEdit,
  loadError,
}: {
  year: number;
  initialLocks: PeriodLockRow[];
  payroll: Record<number, { runs: number; draft: number; validated: number; locked: number }>;
  canEdit: boolean;
  loadError?: string;
}) {
  const [locks, setLocks] = useState(initialLocks);
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [pending, start] = useTransition();
  const byMonth = new Map(locks.map((l) => [l.month, l]));

  function toggle(month: number, locked: boolean) {
    if (
      !window.confirm(
        locked
          ? `Clôturer ${MONTHS[month - 1]} ${year} ? Les ajustements commerciaux (AN) du mois seront figés.`
          : `Rouvrir ${MONTHS[month - 1]} ${year} ?`,
      )
    ) {
      return;
    }
    setError(null);
    start(async () => {
      const r = await setPeriodLock({ year, month, locked });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const now = new Date().toISOString();
      setLocks((prev) => {
        const cur = prev.find((l) => l.month === month);
        const next: PeriodLockRow = cur
          ? locked
            ? { ...cur, locked_at: now, unlocked_at: null, unlocked_by_name: null, locked_by_name: "vous" }
            : { ...cur, unlocked_at: now, unlocked_by_name: "vous" }
          : { id: String(month), year, month, locked_at: now, locked_by_name: "vous", unlocked_at: null, unlocked_by_name: null };
        return [...prev.filter((l) => l.month !== month), next];
      });
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link className="rounded-xl border border-border/70 px-3 py-1.5 text-sm" href={`?year=${year - 1}`}>
          ← {year - 1}
        </Link>
        <span className="font-display text-xl font-semibold">{year}</span>
        <Link className="rounded-xl border border-border/70 px-3 py-1.5 text-sm" href={`?year=${year + 1}`}>
          {year + 1} →
        </Link>
        <p className="ml-2 max-w-2xl text-xs text-foreground/60">
          La clôture fige les ajustements commerciaux (AN) du mois ; seul le SUPER_ADMIN peut encore y écrire. La paie a son
          propre circuit (valider → clôturer) dans le module RH ; son état est rappelé ici.
        </p>
      </div>
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      <RhTableWrap>
        <table className="min-w-full text-sm">
          <thead className="border-b border-border/70 bg-surface-muted/80">
            <tr>
              <th className={rhTh()}>Mois</th>
              <th className={rhTh()}>Ajustements (AN)</th>
              <th className={rhTh()}>Paie (chantiers)</th>
              <th className={rhTh()} />
            </tr>
          </thead>
          <tbody>
            {MONTHS.map((label, i) => {
              const month = i + 1;
              const lock = byMonth.get(month);
              const isLocked = Boolean(lock && !lock.unlocked_at);
              const p = payroll[month];
              return (
                <tr key={month} className="border-b border-border/60">
                  <td className={`${rhTd()} font-semibold`}>
                    {label} {year}
                  </td>
                  <td className={rhTd()}>
                    {isLocked ? <RhChip tone="danger">Clôturé</RhChip> : <RhChip tone="success">Ouvert</RhChip>}
                    {lock ? (
                      <span className="mt-1 block text-[11px] text-foreground/55">
                        {isLocked
                          ? `le ${new Date(lock.locked_at).toLocaleDateString("fr-FR")} par ${lock.locked_by_name ?? "—"}`
                          : `rouvert le ${new Date(lock.unlocked_at as string).toLocaleDateString("fr-FR")} par ${lock.unlocked_by_name ?? "—"}`}
                      </span>
                    ) : null}
                  </td>
                  <td className={rhTd()}>
                    {p ? (
                      <div className="flex flex-wrap gap-1 text-[11px]">
                        {p.locked ? <RhChip tone="danger">{p.locked} clôturée(s)</RhChip> : null}
                        {p.validated ? <RhChip tone="success">{p.validated} validée(s)</RhChip> : null}
                        {p.draft ? <RhChip>{p.draft} brouillon(s)</RhChip> : null}
                      </div>
                    ) : (
                      <span className="text-xs text-foreground/45">—</span>
                    )}
                  </td>
                  <td className={rhTd()}>
                    {canEdit ? (
                      isLocked ? (
                        <Button variant="ghost" disabled={pending} onClick={() => toggle(month, false)}>
                          Rouvrir
                        </Button>
                      ) : (
                        <Button variant="secondary" disabled={pending} onClick={() => toggle(month, true)}>
                          Clôturer
                        </Button>
                      )
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </RhTableWrap>
    </div>
  );
}
