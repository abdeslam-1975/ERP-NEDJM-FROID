export const DASHBOARD_BUCKET = "dashboard-scenes";
export const DASHBOARD_MANIFEST = "manifest.json";
export const MAX_DASHBOARD_SCENES = 8;
export const TITLE_MAX = 80;
export const CAPTION_MAX = 160;

export type DashboardScene = {
  id: string;
  titleAr: string;
  titleFr: string;
  captionAr: string;
  captionFr: string;
  imageUrl: string;
  storagePath: string;
  sortOrder: number;
  published: boolean;
  durationSeconds: number;
};

export type DashboardShowcase = {
  enabled: boolean;
  scenes: DashboardScene[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STORAGE_PATH = /^(seed|scenes)\/[a-zA-Z0-9._-]+$/;

export function cleanShowcaseText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

export function clampDuration(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < 4 || n > 20) return null;
  return n;
}

function isSceneUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.pathname.startsWith(`/storage/v1/object/public/${DASHBOARD_BUCKET}/`);
  } catch {
    return false;
  }
}

function parseScene(value: unknown): DashboardScene | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const titleAr = cleanShowcaseText(raw.titleAr, TITLE_MAX);
  const titleFr = cleanShowcaseText(raw.titleFr, TITLE_MAX);
  const captionAr = cleanShowcaseText(raw.captionAr, CAPTION_MAX);
  const captionFr = cleanShowcaseText(raw.captionFr, CAPTION_MAX);
  const durationSeconds = clampDuration(raw.durationSeconds);
  const order = typeof raw.sortOrder === "number" && Number.isInteger(raw.sortOrder) ? raw.sortOrder : null;
  if (
    typeof raw.id !== "string" ||
    !UUID.test(raw.id) ||
    !titleAr ||
    !titleFr ||
    !captionAr ||
    !captionFr ||
    typeof raw.imageUrl !== "string" ||
    !isSceneUrl(raw.imageUrl) ||
    typeof raw.storagePath !== "string" ||
    !STORAGE_PATH.test(raw.storagePath) ||
    order === null ||
    order < 0 ||
    order > 100000 ||
    typeof raw.published !== "boolean" ||
    durationSeconds === null
  ) {
    return null;
  }
  return {
    id: raw.id,
    titleAr,
    titleFr,
    captionAr,
    captionFr,
    imageUrl: raw.imageUrl,
    storagePath: raw.storagePath,
    sortOrder: order,
    published: raw.published,
    durationSeconds,
  };
}

/** Drops broken scenes. Returns null when the document itself is not a showcase. */
export function parseShowcase(value: unknown): DashboardShowcase | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { enabled?: unknown; scenes?: unknown };
  if (!Array.isArray(raw.scenes)) return null;
  const scenes: DashboardScene[] = [];
  for (const item of raw.scenes) {
    const scene = parseScene(item);
    if (scene) scenes.push(scene);
  }
  scenes.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  return {
    enabled: raw.enabled !== false,
    scenes: scenes.slice(0, MAX_DASHBOARD_SCENES),
  };
}
