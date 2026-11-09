"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import {
  CAPTION_MAX,
  TITLE_MAX,
  cleanShowcaseText,
  clampDuration,
  type DashboardShowcase,
} from "@/lib/dashboard/showcase";
import {
  loadOrSeedShowcase,
  readShowcase,
  removeSceneObject,
  saveShowcase,
  seedWebsiteShowcase,
  uploadSceneImage,
} from "@/lib/dashboard/showcase-store";

export type ShowcaseResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function requireSuperAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return { ok: false, error: "Session expirée. · انتهت الجلسة." };
  if (!workspace.isSuperAdmin) return { ok: false, error: "Réservé au SUPER_ADMIN. · هذا الإجراء للمدير العام فقط." };
  return { ok: true };
}

function refresh() {
  revalidatePath("/");
  revalidatePath("/parametres/accueil");
}

function failure(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : "Enregistrement impossible. · تعذر الحفظ." };
}

/** Published scenes for the home page. Missing storage degrades to the plain welcome. */
export async function loadDashboardScenes() {
  try {
    const showcase = await loadOrSeedShowcase();
    if (!showcase.enabled) return [];
    return showcase.scenes.filter((scene) => scene.published);
  } catch {
    return [];
  }
}

export async function loadDashboardShowcase(): Promise<ShowcaseResult<DashboardShowcase>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  try {
    return { ok: true, data: await loadOrSeedShowcase() };
  } catch (error) {
    return failure(error);
  }
}

export async function setDashboardShowcaseEnabled(enabled: boolean): Promise<ShowcaseResult<DashboardShowcase>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  try {
    const current = (await readShowcase()) ?? { enabled: true, scenes: [] };
    const saved = await saveShowcase({ ...current, enabled });
    refresh();
    return { ok: true, data: saved };
  } catch (error) {
    return failure(error);
  }
}

function textsFrom(formData: FormData) {
  const titleAr = cleanShowcaseText(formData.get("titleAr"), TITLE_MAX);
  const titleFr = cleanShowcaseText(formData.get("titleFr"), TITLE_MAX);
  const captionAr = cleanShowcaseText(formData.get("captionAr"), CAPTION_MAX);
  const captionFr = cleanShowcaseText(formData.get("captionFr"), CAPTION_MAX);
  const durationSeconds = clampDuration(formData.get("durationSeconds"));
  if (!titleAr || !titleFr || !captionAr || !captionFr || durationSeconds === null) return null;
  return { titleAr, titleFr, captionAr, captionFr, durationSeconds, published: formData.get("published") === "on" };
}

export async function createDashboardScene(formData: FormData): Promise<ShowcaseResult<DashboardShowcase>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  const texts = textsFrom(formData);
  if (!texts) return { ok: false, error: "Titres et légendes, en arabe puis en français, sont requis. · العنوان والسطر بالعربية ثم بالفرنسية مطلوبان." };
  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) {
    return { ok: false, error: "Choisissez une image. · اختر صورة." };
  }
  try {
    const current = (await readShowcase()) ?? { enabled: true, scenes: [] };
    if (current.scenes.length >= 8) return { ok: false, error: "Huit scènes au maximum. · الحد الأقصى ثمانية مشاهد." };
    const uploaded = await uploadSceneImage(image);
    const saved = await saveShowcase({
      ...current,
      scenes: [
        ...current.scenes,
        {
          id: crypto.randomUUID(),
          ...texts,
          ...uploaded,
          sortOrder: (current.scenes.at(-1)?.sortOrder ?? 0) + 10,
        },
      ],
    });
    refresh();
    return { ok: true, data: saved };
  } catch (error) {
    return failure(error);
  }
}

export async function updateDashboardScene(formData: FormData): Promise<ShowcaseResult<DashboardShowcase>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  const id = String(formData.get("id") ?? "");
  const texts = textsFrom(formData);
  if (!texts) return { ok: false, error: "Titres et légendes, en arabe puis en français, sont requis. · العنوان والسطر بالعربية ثم بالفرنسية مطلوبان." };
  try {
    const current = await readShowcase();
    const scene = current?.scenes.find((item) => item.id === id);
    if (!current || !scene) return { ok: false, error: "Scène introuvable. · المشهد غير موجود." };
    const image = formData.get("image");
    let imageUrl = scene.imageUrl;
    let storagePath = scene.storagePath;
    if (image instanceof File && image.size > 0) {
      const uploaded = await uploadSceneImage(image);
      imageUrl = uploaded.imageUrl;
      storagePath = uploaded.storagePath;
      if (uploaded.storagePath !== scene.storagePath) await removeSceneObject(scene.storagePath);
    }
    const saved = await saveShowcase({
      ...current,
      scenes: current.scenes.map((item) => (item.id === id ? { ...item, ...texts, imageUrl, storagePath } : item)),
    });
    refresh();
    return { ok: true, data: saved };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteDashboardScene(id: string): Promise<ShowcaseResult<DashboardShowcase>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  try {
    const current = await readShowcase();
    const scene = current?.scenes.find((item) => item.id === id);
    if (!current || !scene) return { ok: false, error: "Scène introuvable. · المشهد غير موجود." };
    const saved = await saveShowcase({ ...current, scenes: current.scenes.filter((item) => item.id !== id) });
    await removeSceneObject(scene.storagePath);
    refresh();
    return { ok: true, data: saved };
  } catch (error) {
    return failure(error);
  }
}

export async function moveDashboardScene(id: string, direction: -1 | 1): Promise<ShowcaseResult<DashboardShowcase>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  try {
    const current = await readShowcase();
    if (!current) return { ok: false, error: "Scène introuvable. · المشهد غير موجود." };
    const scenes = [...current.scenes].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = scenes.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= scenes.length) return { ok: true, data: current };
    const [moved] = scenes.splice(index, 1);
    scenes.splice(target, 0, moved);
    const saved = await saveShowcase({
      ...current,
      scenes: scenes.map((scene, order) => ({ ...scene, sortOrder: (order + 1) * 10 })),
    });
    refresh();
    return { ok: true, data: saved };
  } catch (error) {
    return failure(error);
  }
}

export async function restoreWebsiteScenes(): Promise<ShowcaseResult<DashboardShowcase>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  try {
    const current = await readShowcase();
    if (current && current.scenes.length > 0) {
      return { ok: false, error: "Supprimez d'abord les scènes présentes. · احذف المشاهد الحالية أولاً." };
    }
    const saved = await seedWebsiteShowcase();
    refresh();
    return { ok: true, data: saved };
  } catch (error) {
    return failure(error);
  }
}
