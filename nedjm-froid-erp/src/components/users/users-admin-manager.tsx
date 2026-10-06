"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  adminResetPassword,
  assignUserRole,
  deleteUser,
  provisionUser,
  removeUserRole,
  setUserLifecycleStatus,
  updateUserProfile,
  type AdminUserRow,
} from "@/lib/actions/user-admin";
import { AlertBadge } from "@/components/castle/alert-badge";
import { Button } from "@/components/ui/button";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PasswordInput } from "@/components/ui/password-input";

type RoleOpt = {
  id: string;
  code: string;
  label_fr: string;
  hierarchy_level: number;
};
type SiteOpt = { id: string; code: string; name_fr: string };

const col = dataColumns<AdminUserRow>();

function statusTone(status: string) {
  if (status === "ACTIVE") return "success" as const;
  if (status === "INACTIVE" || status === "DISABLED") return "critical" as const;
  return "warning" as const;
}

export function UsersAdminManager({
  initialUsers,
  roles,
  sites,
  isSuperAdmin,
  currentUserId,
  loadError,
}: {
  initialUsers: AdminUserRow[];
  roles: RoleOpt[];
  sites: SiteOpt[];
  isSuperAdmin: boolean;
  currentUserId: string;
  loadError?: string;
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [syncedUsers, setSyncedUsers] = useState(initialUsers);
  if (initialUsers !== syncedUsers) {
    setSyncedUsers(initialUsers);
    setUsers(initialUsers);
  }
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visibleRoles = useMemo(
    () =>
      roles.filter(
        (r) => isSuperAdmin || (r.code !== "SUPER_ADMIN" && r.hierarchy_level < 80),
      ),
    [roles, isSuperAdmin],
  );

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    role_id: visibleRoles[0]?.id ?? "",
    site_id: "",
  });
  const [resetUser, setResetUser] = useState<AdminUserRow | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [rolesUserId, setRolesUserId] = useState<string | null>(null);
  const rolesUser = useMemo(
    () => users.find((u) => u.id === rolesUserId) ?? null,
    [users, rolesUserId],
  );
  const [roleForm, setRoleForm] = useState({ role_id: "", site_id: "" });
  const [roleError, setRoleError] = useState<string | null>(null);
  const [profileUser, setProfileUser] = useState<AdminUserRow | null>(null);
  const [profileForm, setProfileForm] = useState({ full_name: "", phone: "" });
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const openDelete = useCallback((user: AdminUserRow) => {
    setDeleteTarget(user);
    setDeleteError(null);
    setError(null);
  }, []);

  function submitDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteUser({ user_id: target.id });
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== target.id));
      setDeleteTarget(null);
      setInfo(`Compte ${target.email} supprimé.`);
    });
  }

  const openRoles = useCallback(
    (user: AdminUserRow) => {
      setRolesUserId(user.id);
      setRoleForm({ role_id: visibleRoles[0]?.id ?? "", site_id: "" });
      setRoleError(null);
      setError(null);
    },
    [visibleRoles],
  );

  function patchAssignments(
    userId: string,
    update: (list: AdminUserRow["assignments"]) => AdminUserRow["assignments"],
  ) {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, assignments: update(u.assignments) } : u)),
    );
  }

  function addRole() {
    if (!rolesUser) return;
    const userId = rolesUser.id;
    setRoleError(null);
    startTransition(async () => {
      const result = await assignUserRole({
        user_id: userId,
        role_id: roleForm.role_id,
        site_id: roleForm.site_id || null,
      });
      if (!result.ok) {
        setRoleError(result.error);
        return;
      }
      patchAssignments(userId, (list) => [...list, result.data]);
    });
  }

  function removeRole(assignmentId: string) {
    if (!rolesUser) return;
    const userId = rolesUser.id;
    setRoleError(null);
    startTransition(async () => {
      const result = await removeUserRole({ assignment_id: assignmentId });
      if (!result.ok) {
        setRoleError(result.error);
        return;
      }
      patchAssignments(userId, (list) => list.filter((a) => a.id !== assignmentId));
    });
  }

  const openProfile = useCallback((user: AdminUserRow) => {
    setProfileUser(user);
    setProfileForm({ full_name: user.full_name, phone: user.phone ?? "" });
    setError(null);
  }, []);

  function submitProfile() {
    if (!profileUser) return;
    setError(null);
    startTransition(async () => {
      const result = await updateUserProfile({
        user_id: profileUser.id,
        full_name: profileForm.full_name,
        phone: profileForm.phone,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.id === result.data.id
            ? { ...u, full_name: result.data.full_name, phone: result.data.phone }
            : u,
        ),
      );
      setProfileUser(null);
    });
  }

  function openCreate() {
    setForm({
      full_name: "",
      email: "",
      password: "",
      role_id: visibleRoles[0]?.id ?? "",
      site_id: "",
    });
    setError(null);
    setInfo(null);
    setOpen(true);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await provisionUser({
        ...form,
        site_id: form.site_id || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setInfo(
        "Utilisateur créé. Communiquez-lui le mot de passe saisi ; il devra le changer à la première connexion.",
      );
      router.refresh();
    });
  }

  const openReset = useCallback((user: AdminUserRow) => {
    setResetUser(user);
    setResetPassword("");
    setError(null);
  }, []);

  function submitReset() {
    if (!resetUser) return;
    setError(null);
    startTransition(async () => {
      const result = await adminResetPassword({
        user_id: resetUser.id,
        password: resetPassword,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setResetUser(null);
      setResetPassword("");
      setInfo(
        `Nouveau mot de passe temporaire enregistré pour ${resetUser.email}. Le salarié devra le changer à la prochaine connexion.`,
      );
      router.refresh();
    });
  }

  const deactivate = useCallback((user: AdminUserRow) => {
    startTransition(async () => {
      const result = await setUserLifecycleStatus({
        user_id: user.id,
        status: "INACTIVE",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, status: result.data.status } : u,
        ),
      );
    });
  }, []);

  const reactivate = useCallback((user: AdminUserRow) => {
    startTransition(async () => {
      const result = await setUserLifecycleStatus({
        user_id: user.id,
        status: "ACTIVE",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, status: result.data.status } : u,
        ),
      );
    });
  }, []);

  const columns = useMemo(
    () => [
      col.accessor("full_name", {
        header: "Nom",
        meta: { className: "font-medium" },
        cell: ({ row: { original: u } }) => (
          <>
            {u.full_name}
            {u.must_reset_password ? (
              <span className="mt-1 block text-xs text-alert-warning">
                Réinit. mot de passe requise
              </span>
            ) : null}
          </>
        ),
      }),
      col.accessor("email", { header: "E-mail", meta: { className: "text-foreground/75" } }),
      col.accessor((u) => u.assignments.map((a) => a.role_code).join(", "), {
        id: "role",
        header: "Rôle(s)",
        cell: ({ row: { original: u } }) =>
          u.assignments.length ? (
            <div className="flex flex-wrap gap-1">
              {[...new Set(u.assignments.map((a) => a.role_code))].map((code) => (
                <AlertBadge key={code} label={code} tone="info" />
              ))}
            </div>
          ) : (
            <span className="text-alert-warning">Aucun rôle</span>
          ),
      }),
      col.accessor((u) => u.assignments.map((a) => a.site_name ?? "Global").join(", "), {
        id: "sites",
        header: "Site(s)",
        meta: { className: "text-foreground/75" },
        cell: (info) => info.getValue() || "—",
      }),
      col.accessor("status", {
        header: "Statut",
        cell: (info) => <AlertBadge label={info.getValue()} tone={statusTone(info.getValue())} />,
      }),
      col.display({
        id: "actions",
        header: "Actions",
        enableSorting: false,
        enableHiding: false,
        meta: { align: "right" },
        cell: ({ row: { original: u } }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="secondary">
                Menu
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => openRoles(u)} disabled={pending}>
                Rôles &amp; sites
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openProfile(u)} disabled={pending}>
                Modifier le profil
              </DropdownMenuItem>
              {isSuperAdmin ? (
                <DropdownMenuItem asChild>
                  <Link href={`/parametres/acces?user=${u.id}`}>Accès modules</Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={() => openReset(u)} disabled={pending}>
                Réinit. mot de passe
              </DropdownMenuItem>
              {u.status === "ACTIVE" ? (
                <DropdownMenuItem onSelect={() => deactivate(u)} disabled={pending}>
                  Désactiver (INACTIVE)
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => reactivate(u)} disabled={pending}>
                  Réactiver
                </DropdownMenuItem>
              )}
              {u.id !== currentUserId ? (
                <DropdownMenuItem
                  onSelect={() => openDelete(u)}
                  disabled={pending}
                  className="text-alert-critical"
                >
                  Supprimer le compte
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      }),
    ],
    [openRoles, openProfile, openReset, deactivate, reactivate, openDelete, pending, isSuperAdmin, currentUserId],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brand">
            Paramètres · الإعدادات
          </p>
          <h2 className="mt-1 font-display text-2xl font-semibold">
            Administration des utilisateurs
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-foreground/70">
            Créez un compte, attribuez-lui un ou plusieurs rôles (globaux ou par
            chantier). Les droits de chaque rôle se règlent dans la matrice des
            droits. Accès SUPER_ADMIN et ADMIN_RH uniquement.
          </p>
          {isSuperAdmin ? (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <Link href="/administration/roles" className="font-medium text-brand hover:underline">
                Rôles · الأدوار
              </Link>
              <Link href="/administration/permissions" className="font-medium text-brand hover:underline">
                Matrice des droits · الصلاحيات
              </Link>
              <Link href="/parametres/acces" className="font-medium text-brand hover:underline">
                Accès par compte · صلاحيات الحسابات
              </Link>
            </div>
          ) : null}
        </div>
        <Button onClick={openCreate} disabled={pending}>
          Nouvel utilisateur
        </Button>
      </div>

      {(loadError || error) && (
        <div
          role="alert"
          className="rounded-md border border-alert-critical/40 bg-alert-critical/10 px-4 py-3 text-sm text-alert-critical"
        >
          {loadError || error}
        </div>
      )}
      {info && (
        <div className="rounded-md border border-alert-success/40 bg-alert-success/10 px-4 py-3 text-sm text-alert-success">
          {info}
        </div>
      )}

      <DataTable
        data={users}
        columns={columns}
        getRowId={(u) => u.id}
        searchPlaceholder="Nom, e-mail, rôle, site"
        searchText={(u) =>
          [u.full_name, u.email, ...u.assignments.flatMap((a) => [a.role_code, a.site_name])].filter(Boolean).join(" ")
        }
        emptyTitle="Aucun utilisateur"
      />

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-5">
            <h3 className="font-display text-xl font-semibold">
              Nouvel utilisateur
            </h3>
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium">
                Nom complet *
                <input
                  className={inputClass}
                  value={form.full_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, full_name: e.target.value }))
                  }
                />
              </label>
              <label className="block text-sm font-medium">
                E-mail *
                <input
                  className={inputClass}
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value }))
                  }
                />
              </label>
              <label className="block text-sm font-medium">
                Mot de passe initial *
                <span className="mt-0.5 block text-xs font-normal text-foreground/55">
                  Saisi par l&apos;administrateur · الموظف سيغيّره عند أول دخول
                </span>
                <PasswordInput
                  id="initial_password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, password: e.target.value }))
                  }
                  wrapperClassName="mt-1"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
                />
              </label>
              <label className="block text-sm font-medium">
                Rôle *
                <select
                  className={inputClass}
                  value={form.role_id}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, role_id: e.target.value }))
                  }
                >
                  {visibleRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label_fr} ({r.code})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Périmètre site
                <select
                  className={inputClass}
                  value={form.site_id}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, site_id: e.target.value }))
                  }
                >
                  <option value="">Global (tous les sites)</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.name_fr}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button
                onClick={submit}
                disabled={pending || form.password.length < 8}
              >
                {pending ? "Création…" : "Créer"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {resetUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-5">
            <h3 className="font-display text-xl font-semibold">
              Réinitialiser le mot de passe
            </h3>
            <p className="mt-1 text-sm text-foreground/70">
              Saisissez un mot de passe temporaire pour {resetUser.email}. Le
              salarié devra le changer à la prochaine connexion.
            </p>
            <label className="mt-4 block text-sm font-medium">
              Mot de passe temporaire *
              <PasswordInput
                id="reset_password"
                autoComplete="new-password"
                required
                minLength={8}
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                wrapperClassName="mt-1"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setResetUser(null);
                  setResetPassword("");
                }}
              >
                Annuler
              </Button>
              <Button
                onClick={submitReset}
                disabled={pending || resetPassword.length < 8}
              >
                {pending ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {rolesUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-lg border border-border bg-surface p-5">
            <h3 className="font-display text-xl font-semibold">
              Rôles &amp; sites · الأدوار
            </h3>
            <p className="mt-1 text-sm text-foreground/70">
              {rolesUser.full_name} · {rolesUser.email}. Un rôle lié à un chantier
              prime sur un rôle global pour ce chantier.
            </p>

            {roleError ? (
              <div
                role="alert"
                className="mt-3 rounded-md border border-alert-critical/40 bg-alert-critical/10 px-3 py-2 text-sm text-alert-critical"
              >
                {roleError}
              </div>
            ) : null}

            <ul className="mt-4 divide-y divide-border/60 rounded-md border border-border/70">
              {rolesUser.assignments.length === 0 ? (
                <li className="px-3 py-2 text-sm text-foreground/60">Aucun rôle attribué.</li>
              ) : (
                rolesUser.assignments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {a.role_label} <span className="text-foreground/55">({a.role_code})</span>
                      </p>
                      <p className="text-xs text-foreground/60">
                        {a.site_name ?? "Global (tous les sites)"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending || rolesUser.assignments.length <= 1}
                      onClick={() => removeRole(a.id)}
                    >
                      Retirer
                    </Button>
                  </li>
                ))
              )}
            </ul>

            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="block text-sm font-medium">
                Rôle
                <select
                  className={inputClass}
                  value={roleForm.role_id}
                  onChange={(e) => setRoleForm((f) => ({ ...f, role_id: e.target.value }))}
                >
                  {visibleRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label_fr} ({r.code})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Périmètre site
                <select
                  className={inputClass}
                  value={roleForm.site_id}
                  onChange={(e) => setRoleForm((f) => ({ ...f, site_id: e.target.value }))}
                >
                  <option value="">Global (tous les sites)</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.name_fr}
                    </option>
                  ))}
                </select>
              </label>
              <Button onClick={addRole} disabled={pending || !roleForm.role_id}>
                Ajouter
              </Button>
            </div>

            <p className="mt-3 text-xs text-foreground/55">
              Les droits (lire, créer, modifier, supprimer, imprimer, exporter) de
              chaque rôle se règlent dans la matrice des droits ; les modules
              visibles d&apos;un compte précis dans « Accès par compte ».
            </p>

            <div className="mt-5 flex justify-end">
              <Button variant="secondary" onClick={() => setRolesUserId(null)}>
                Fermer
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {profileUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-5">
            <h3 className="font-display text-xl font-semibold">Modifier le profil</h3>
            <p className="mt-1 text-sm text-foreground/70">{profileUser.email}</p>
            {error ? (
              <div
                role="alert"
                className="mt-3 rounded-md border border-alert-critical/40 bg-alert-critical/10 px-3 py-2 text-sm text-alert-critical"
              >
                {error}
              </div>
            ) : null}
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium">
                Nom complet *
                <input
                  className={inputClass}
                  value={profileForm.full_name}
                  onChange={(e) => setProfileForm((f) => ({ ...f, full_name: e.target.value }))}
                />
              </label>
              <label className="block text-sm font-medium">
                Téléphone
                <input
                  className={inputClass}
                  type="tel"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setProfileUser(null)}>
                Annuler
              </Button>
              <Button
                onClick={submitProfile}
                disabled={pending || profileForm.full_name.trim().length < 2}
              >
                {pending ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-5">
            <h3 className="font-display text-xl font-semibold">Supprimer le compte · حذف الحساب</h3>
            <p className="mt-1 text-sm text-foreground/70">
              {deleteTarget.full_name} · {deleteTarget.email}
            </p>
            <p className="mt-3 text-sm text-foreground/80">
              Le compte et sa connexion seront supprimés définitivement. Un compte déjà utilisé
              dans l&apos;ERP ne peut pas être supprimé : désactivez-le à la place.
            </p>
            {deleteError ? (
              <div
                role="alert"
                className="mt-3 rounded-md border border-alert-critical/40 bg-alert-critical/10 px-3 py-2 text-sm text-alert-critical"
              >
                {deleteError}
              </div>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                Annuler
              </Button>
              <Button variant="danger" onClick={submitDelete} disabled={pending}>
                {pending ? "Suppression…" : "Supprimer"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const inputClass =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";
