"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCustomScreen, saveCustomScreen, type CustomScreenRow } from "@/lib/actions/ui-screens";
import { UI_NAV_GROUPS } from "@/lib/ui/registry";
import { RhAlert, RhField, RhPanel, rhInput } from "@/components/rh/rh-ui";
import { Button } from "@/components/ui/button";

function slugFrom(label: string): string {
  const slug = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 31);
  return /^[a-z]/.test(slug) ? slug : slug ? `s_${slug}`.slice(0, 31) : "";
}

export function CustomScreensManager({ screens }: { screens: CustomScreenRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: "",
    label_fr: "",
    label_ar: "",
    group_key: UI_NAV_GROUPS[0]?.key ?? "group.admin",
    body: "",
    locked: false,
  });

  function save() {
    setError(null);
    setInfo(null);
    start(async () => {
      const result = await saveCustomScreen(form);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInfo("Écran enregistré. Il apparaît dans le menu.");
      setForm({ code: "", label_fr: "", label_ar: "", group_key: form.group_key, body: "", locked: false });
      router.refresh();
    });
  }

  function remove(code: string) {
    setError(null);
    start(async () => {
      const result = await deleteCustomScreen(code);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <RhPanel>
      <h3 className="font-display text-sm font-semibold">Écrans ajoutés · شاشات مضافة</h3>
      <p className="mt-1 text-xs text-foreground/55">
        Une page avec un titre et un texte, placée dans le menu. Le super administrateur la crée ici ; les autres rôles la voient sauf si elle est masquée plus bas.
      </p>
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {info ? <RhAlert tone="success">{info}</RhAlert> : null}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <RhField label="Nom (FR)">
          <input
            className={rhInput}
            value={form.label_fr}
            onChange={(event) => {
              const label_fr = event.target.value;
              setForm((current) => ({
                ...current,
                label_fr,
                code: current.locked ? current.code : slugFrom(label_fr),
              }));
            }}
          />
        </RhField>
        <RhField label="الاسم (AR)">
          <input className={rhInput} dir="rtl" value={form.label_ar} onChange={(event) => setForm({ ...form, label_ar: event.target.value })} />
        </RhField>
        <RhField label="Code">
          <input
            className={rhInput}
            value={form.code}
            onChange={(event) => setForm({ ...form, code: event.target.value.toLowerCase(), locked: true })}
          />
        </RhField>
        <RhField label="Groupe du menu">
          <select className={rhInput} value={form.group_key} onChange={(event) => setForm({ ...form, group_key: event.target.value })}>
            {UI_NAV_GROUPS.map((group) => (
              <option key={group.key} value={group.key}>
                {group.titleFr}
              </option>
            ))}
          </select>
        </RhField>
        <RhField label="Texte de la page">
          <textarea className={`${rhInput} min-h-24 sm:col-span-2`} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} />
        </RhField>
      </div>
      <Button type="button" className="mt-3" disabled={pending} onClick={save}>
        Ajouter l&apos;écran
      </Button>
      {screens.length ? (
        <ul className="mt-4 divide-y divide-border/50 text-sm">
          {screens.map((screen) => (
            <li key={screen.code} className="flex items-center justify-between gap-3 py-2">
              <span>
                <span className="font-medium">{screen.label_fr}</span>
                <span className="ml-2 font-mono text-xs text-foreground/45">{screen.code}</span>
              </span>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => remove(screen.code)}>
                Retirer
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </RhPanel>
  );
}
