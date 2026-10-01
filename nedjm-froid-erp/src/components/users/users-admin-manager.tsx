"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminResetPassword,
  provisionUser,
  setUserLifecycleStatus,
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
  loadError,
}: {
  initialUsers: AdminUserRow[];
  roles: RoleOpt[];
  sites: SiteOpt[];
  isSuperAdmin: boolean;
  loadError?: string;
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
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
      col.accessor((u) => u.assignments[0]?.role_code ?? "", {
        id: "role",
        header: "Rôle",
        cell: (info) => (info.getValue() ? <AlertBadge label={info.getValue()} tone="info" /> : "—"),
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
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      }),
    ],
    [openReset, deactivate, reactivate, pending],
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
            Provisionnement Auth + `sys_users` + affectation rôle/site. Accès
            SUPER_ADMIN et ADMIN_RH uniquement.
          </p>
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
    </div>
  );
}

const inputClass =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";
