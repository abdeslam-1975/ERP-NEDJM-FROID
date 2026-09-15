"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import {
  createSite,
  toggleSiteActive,
  updateSite,
  type ActivityCodeOption,
  type SiteRow,
} from "@/lib/actions/sites";
import { Button } from "@/components/ui/button";
import { AlertBadge } from "@/components/castle/alert-badge";

type FormState = {
  code: string;
  name_fr: string;
  name_ar: string;
  activity_code_id: string;
  wilaya: string;
  commune: string;
  latitude: string;
  longitude: string;
  is_active: boolean;
};

const emptyForm = (defaultActivityId = ""): FormState => ({
  code: "",
  name_fr: "",
  name_ar: "",
  activity_code_id: defaultActivityId,
  wilaya: "",
  commune: "",
  latitude: "",
  longitude: "",
  is_active: true,
});

function toPayload(form: FormState) {
  return {
    code: form.code,
    name_fr: form.name_fr,
    name_ar: form.name_ar || null,
    activity_code_id: form.activity_code_id,
    wilaya: form.wilaya || null,
    commune: form.commune || null,
    latitude: form.latitude === "" ? null : Number(form.latitude),
    longitude: form.longitude === "" ? null : Number(form.longitude),
    is_active: form.is_active,
  };
}

function RegimeBadge({ regime }: { regime: string | undefined }) {
  if (regime === "BTPH") {
    return <AlertBadge label="BTPH" tone="info" />;
  }
  if (regime === "MAINTENANCE") {
    return <AlertBadge label="Maintenance" tone="warning" />;
  }
  return <AlertBadge label="—" tone="info" />;
}

export function SitesManager({
  initialSites,
  activityCodes,
  loadError,
}: {
  initialSites: SiteRow[];
  activityCodes: ActivityCodeOption[];
  loadError?: string;
}) {
  const [sites, setSites] = useState(initialSites);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SiteRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(activityCodes[0]?.id ?? ""));
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [menuId, setMenuId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const title = editing ? "Modifier le chantier" : "Nouveau chantier";

  const activityById = useMemo(() => {
    const map = new Map(activityCodes.map((a) => [a.id, a]));
    return map;
  }, [activityCodes]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm(activityCodes[0]?.id ?? ""));
    setFormError(null);
    setFieldErrors({});
    setOpen(true);
  }

  function openEdit(site: SiteRow) {
    setEditing(site);
    setForm({
      code: site.code,
      name_fr: site.name_fr,
      name_ar: site.name_ar ?? "",
      activity_code_id: site.activity_code_id ?? activityCodes[0]?.id ?? "",
      wilaya: site.wilaya ?? "",
      commune: site.commune ?? "",
      latitude: site.latitude == null ? "" : String(site.latitude),
      longitude: site.longitude == null ? "" : String(site.longitude),
      is_active: site.is_active,
    });
    setFormError(null);
    setFieldErrors({});
    setOpen(true);
    setMenuId(null);
  }

  function submit() {
    setFormError(null);
    setFieldErrors({});
    startTransition(async () => {
      const payload = toPayload(form);
      const result = editing
        ? await updateSite({ id: editing.id, ...payload })
        : await createSite(payload);

      if (!result.ok) {
        setFormError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      setOpen(false);
      // Soft refresh of local table from server would need router.refresh;
      // merge optimistically for snappy UX then rely on revalidatePath.
      if (editing) {
        const activity = activityById.get(payload.activity_code_id) ?? null;
        setSites((prev) =>
          prev.map((s) =>
            s.id === editing.id
              ? {
                  ...s,
                  ...payload,
                  activity,
                  updated_at: new Date().toISOString(),
                }
              : s,
          ),
        );
      } else {
        const activity = activityById.get(payload.activity_code_id) ?? null;
        setSites((prev) =>
          [
            {
              id: result.data.id,
              code: payload.code.toUpperCase(),
              name_fr: payload.name_fr,
              name_ar: payload.name_ar,
              activity_code_id: payload.activity_code_id,
              wilaya: payload.wilaya,
              commune: payload.commune,
              latitude: payload.latitude,
              longitude: payload.longitude,
              is_active: payload.is_active,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              activity,
            },
            ...prev,
          ].sort((a, b) => a.code.localeCompare(b.code)),
        );
      }
    });
  }

  function onToggleActive(site: SiteRow) {
    setMenuId(null);
    startTransition(async () => {
      const next = !site.is_active;
      const result = await toggleSiteActive({ id: site.id, is_active: next });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setSites((prev) =>
        prev.map((s) =>
          s.id === site.id ? { ...s, is_active: result.data.is_active } : s,
        ),
      );
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brand">Référentiels</p>
          <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">
            Chantiers
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-foreground/70">
            Annuaire des sites pour la perspective Château. L&apos;affectation
            légale (BTPH / Maintenance) reste pilotée par le contrat RH
            (affectation principale).
          </p>
        </div>
        <Button onClick={openCreate} disabled={pending || activityCodes.length === 0}>
          Nouveau chantier
        </Button>
      </div>

      {(loadError || formError) && (
        <div
          role="alert"
          className="rounded-md border border-alert-critical/40 bg-alert-critical/10 px-4 py-3 text-sm text-alert-critical"
        >
          {loadError || formError}
        </div>
      )}

      {activityCodes.length === 0 && (
        <div className="rounded-md border border-alert-warning/40 bg-alert-warning/10 px-4 py-3 text-sm text-alert-warning">
          Aucun code d&apos;activité actif. Vérifiez le seed Phase 1A
          (BTPH / Maintenance).
        </div>
      )}

      {sites.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface-muted px-6 text-center">
          <p className="font-display text-lg font-semibold text-foreground">
            Aucun chantier enregistré
          </p>
          <p className="mt-2 max-w-md text-sm text-foreground/65">
            Créez le premier site BTPH ou Maintenance pour activer la
            perspective Château.
          </p>
          <Button className="mt-5" onClick={openCreate} disabled={pending || activityCodes.length === 0}>
            Nouveau chantier
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="bg-surface-muted text-xs uppercase tracking-wide text-foreground/60">
              <tr>
                <th className="px-4 py-3 font-semibold">Code</th>
                <th className="px-4 py-3 font-semibold">Nom</th>
                <th className="px-4 py-3 font-semibold">Activité</th>
                <th className="px-4 py-3 font-semibold">Wilaya</th>
                <th className="px-4 py-3 font-semibold">Statut</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => (
                <tr key={site.id} className="border-t border-border">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-brand">
                    {site.code}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{site.name_fr}</div>
                    {site.name_ar ? (
                      <div className="text-xs text-foreground/55" dir="rtl">
                        {site.name_ar}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <RegimeBadge regime={site.activity?.regime} />
                      <span className="text-xs text-foreground/55">
                        {site.activity?.code ?? "—"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-foreground/80">
                    {site.wilaya ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {site.is_active ? (
                      <AlertBadge label="Actif" tone="success" />
                    ) : (
                      <AlertBadge label="Inactif" tone="critical" />
                    )}
                  </td>
                  <td className="relative px-4 py-3 text-right">
                    <button
                      type="button"
                      className="rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-brand-muted"
                      onClick={() =>
                        setMenuId((id) => (id === site.id ? null : site.id))
                      }
                      aria-expanded={menuId === site.id}
                    >
                      Menu
                    </button>
                    {menuId === site.id ? (
                      <div className="absolute right-4 z-10 mt-1 w-44 rounded-md border border-border bg-surface py-1 shadow-sm">
                        <button
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-brand-muted"
                          onClick={() => openEdit(site)}
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-brand-muted"
                          onClick={() => onToggleActive(site)}
                          disabled={pending}
                        >
                          {site.is_active ? "Désactiver" : "Réactiver"}
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="site-form-title"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-lg">
            <h3
              id="site-form-title"
              className="font-display text-xl font-semibold text-foreground"
            >
              {title}
            </h3>
            <p className="mt-1 text-sm text-foreground/65">
              Les champs marqués * sont obligatoires.
            </p>

            <div className="mt-5 space-y-4">
              <Field
                label="Code *"
                error={fieldErrors.code?.[0]}
              >
                <input
                  className={inputClass}
                  value={form.code}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))
                  }
                  maxLength={32}
                  autoComplete="off"
                  disabled={!!editing}
                />
              </Field>

              <Field label="Nom (FR) *" error={fieldErrors.name_fr?.[0]}>
                <input
                  className={inputClass}
                  value={form.name_fr}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name_fr: e.target.value }))
                  }
                  maxLength={120}
                />
              </Field>

              <Field label="Nom (AR)" error={fieldErrors.name_ar?.[0]}>
                <input
                  className={inputClass}
                  dir="rtl"
                  value={form.name_ar}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name_ar: e.target.value }))
                  }
                  maxLength={120}
                />
              </Field>

              <Field
                label="Code d'activité *"
                error={fieldErrors.activity_code_id?.[0]}
              >
                <select
                  className={inputClass}
                  value={form.activity_code_id}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      activity_code_id: e.target.value,
                    }))
                  }
                >
                  {activityCodes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.label_fr}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Wilaya" error={fieldErrors.wilaya?.[0]}>
                  <input
                    className={inputClass}
                    value={form.wilaya}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, wilaya: e.target.value }))
                    }
                    maxLength={80}
                  />
                </Field>
                <Field label="Commune" error={fieldErrors.commune?.[0]}>
                  <input
                    className={inputClass}
                    value={form.commune}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, commune: e.target.value }))
                    }
                    maxLength={80}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Latitude" error={fieldErrors.latitude?.[0]}>
                  <input
                    className={inputClass}
                    type="number"
                    step="any"
                    value={form.latitude}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, latitude: e.target.value }))
                    }
                  />
                </Field>
                <Field label="Longitude" error={fieldErrors.longitude?.[0]}>
                  <input
                    className={inputClass}
                    type="number"
                    step="any"
                    value={form.longitude}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, longitude: e.target.value }))
                    }
                  />
                </Field>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, is_active: e.target.checked }))
                  }
                />
                Chantier actif
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Annuler
              </Button>
              <Button onClick={submit} disabled={pending}>
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
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-foreground">
      {label}
      {children}
      {error ? (
        <span className="mt-1 block text-xs font-normal text-alert-critical">
          {error}
        </span>
      ) : null}
    </label>
  );
}
