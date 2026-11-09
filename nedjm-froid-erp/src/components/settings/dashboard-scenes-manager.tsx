"use client";

import { useState, useTransition } from "react";
import { RhAlert, RhField, rhInput } from "@/components/rh/rh-ui";
import {
  createDashboardScene,
  deleteDashboardScene,
  moveDashboardScene,
  restoreWebsiteScenes,
  setDashboardShowcaseEnabled,
  updateDashboardScene,
} from "@/lib/actions/dashboard-showcase";
import type { DashboardScene, DashboardShowcase } from "@/lib/dashboard/showcase";

const field = `${rhInput} mt-1.5`;

export function DashboardScenesManager({ initial }: { initial: DashboardShowcase }) {
  const [showcase, setShowcase] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: true; data: DashboardShowcase } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) setShowcase(result.data);
      else setError(result.error);
    });
  }

  return (
    <div className="space-y-5">
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-brand)]"
            checked={showcase.enabled}
            disabled={pending}
            onChange={(event) => run(() => setDashboardShowcaseEnabled(event.target.checked))}
          />
          <span>
            عرض الشريط على لوحة التحكم
            <span className="mt-0.5 block text-xs font-normal text-foreground/60">Afficher le bandeau sur le tableau de bord</span>
          </span>
        </label>
        <p className="text-xs text-foreground/55">{showcase.scenes.length} / 8</p>
      </section>

      <ul className="space-y-3">
        {showcase.scenes.map((scene, index) => (
          <li key={scene.id}>
            <SceneCard
              scene={scene}
              first={index === 0}
              last={index === showcase.scenes.length - 1}
              pending={pending}
              onMove={(direction) => run(() => moveDashboardScene(scene.id, direction))}
              onDelete={() => {
                if (window.confirm("حذف هذا المشهد؟")) run(() => deleteDashboardScene(scene.id));
              }}
              onSave={(formData) => run(() => updateDashboardScene(formData))}
            />
          </li>
        ))}
      </ul>

      {showcase.scenes.length === 0 ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => restoreWebsiteScenes())}
          className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-muted disabled:opacity-50"
        >
          استعادة مشاهد الموقع · Reprendre les scènes du site
        </button>
      ) : null}

      <SceneForm
        title="مشهد جديد"
        subtitle="Nouvelle scène"
        pending={pending}
        disabled={showcase.scenes.length >= 8}
        requireImage
        onSubmit={(formData) => run(() => createDashboardScene(formData))}
      />
    </div>
  );
}

function SceneCard({
  scene,
  first,
  last,
  pending,
  onMove,
  onDelete,
  onSave,
}: {
  scene: DashboardScene;
  first: boolean;
  last: boolean;
  pending: boolean;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onSave: (formData: FormData) => void;
}) {
  return (
    <article className="grid gap-4 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
      <img src={scene.imageUrl} alt="" className="h-28 w-full rounded-xl object-cover sm:h-full" />
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold" dir="rtl">
            {scene.titleAr}
          </p>
          <div className="flex gap-1">
            <button type="button" className="rounded-lg px-2 py-1 text-xs font-semibold hover:bg-surface-muted disabled:opacity-40" disabled={pending || first} onClick={() => onMove(-1)}>
              أعلى
            </button>
            <button type="button" className="rounded-lg px-2 py-1 text-xs font-semibold hover:bg-surface-muted disabled:opacity-40" disabled={pending || last} onClick={() => onMove(1)}>
              أسفل
            </button>
            <button type="button" className="rounded-lg px-2 py-1 text-xs font-semibold text-alert-critical hover:bg-alert-critical/10 disabled:opacity-40" disabled={pending} onClick={onDelete}>
              حذف
            </button>
          </div>
        </div>
        <SceneForm scene={scene} pending={pending} onSubmit={onSave} />
      </div>
    </article>
  );
}

function SceneForm({
  scene,
  title,
  subtitle,
  pending,
  disabled,
  requireImage,
  onSubmit,
}: {
  scene?: DashboardScene;
  title?: string;
  subtitle?: string;
  pending: boolean;
  disabled?: boolean;
  requireImage?: boolean;
  onSubmit: (formData: FormData) => void;
}) {
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(new FormData(event.currentTarget));
      }}
    >
      {scene ? <input type="hidden" name="id" value={scene.id} /> : null}
      {title ? (
        <div className="sm:col-span-2">
          <h3 className="font-display text-lg font-semibold" dir="rtl">
            {title}
          </h3>
          {subtitle ? <p className="text-sm text-foreground/60">{subtitle}</p> : null}
        </div>
      ) : null}
      <RhField label="العنوان بالعربية" required>
        <input name="titleAr" required maxLength={80} defaultValue={scene?.titleAr} dir="rtl" className={field} />
      </RhField>
      <RhField label="Titre en français" required>
        <input name="titleFr" required maxLength={80} defaultValue={scene?.titleFr} className={field} />
      </RhField>
      <RhField label="السطر بالعربية" required>
        <input name="captionAr" required maxLength={160} defaultValue={scene?.captionAr} dir="rtl" className={field} />
      </RhField>
      <RhField label="Légende en français" required>
        <input name="captionFr" required maxLength={160} defaultValue={scene?.captionFr} className={field} />
      </RhField>
      <RhField label="المدة بالثواني · Durée (s)" required>
        <input name="durationSeconds" type="number" min={4} max={20} required defaultValue={scene?.durationSeconds ?? 8} className={field} />
      </RhField>
      <RhField label="الصورة · Image" required={requireImage} hint={scene ? "اتركها فارغة للإبقاء على الصورة الحالية." : "JPEG أو PNG أو WebP، حتى 1.5 ميغابايت."}>
        <input name="image" type="file" accept="image/jpeg,image/png,image/webp" required={requireImage} className="mt-1.5 block w-full text-sm" />
      </RhField>
      <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
        <input type="checkbox" name="published" defaultChecked={scene?.published ?? true} className="size-4 accent-[var(--color-brand)]" />
        منشور · Publié
      </label>
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending || disabled}
          className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {scene ? "حفظ التعديل" : "إضافة المشهد"}
        </button>
      </div>
    </form>
  );
}
