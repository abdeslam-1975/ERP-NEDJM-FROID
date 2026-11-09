import { readFile } from "node:fs/promises";
import path from "node:path";
import { createServiceClient } from "@/lib/supabase/service";
import {
  DASHBOARD_BUCKET,
  DASHBOARD_MANIFEST,
  MAX_DASHBOARD_SCENES,
  parseShowcase,
  type DashboardScene,
  type DashboardShowcase,
} from "@/lib/dashboard/showcase";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 1_572_864;

type SeedFile = {
  id: string;
  file: string;
  titleAr: string;
  titleFr: string;
  captionAr: string;
  captionFr: string;
};

function publicObjectUrl(objectPath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) throw new Error("NEXT_PUBLIC_SUPABASE_URL manquant.");
  return `${base}/storage/v1/object/public/${DASHBOARD_BUCKET}/${objectPath}`;
}

async function ensureBucket(): Promise<void> {
  const supabase = createServiceClient();
  const options = {
    public: true,
    fileSizeLimit: MAX_BYTES,
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "application/json"],
  };
  const created = await supabase.storage.createBucket(DASHBOARD_BUCKET, options);
  if (!created.error) return;
  if (!/already exists|duplicate/i.test(created.error.message)) {
    const updated = await supabase.storage.updateBucket(DASHBOARD_BUCKET, options);
    if (updated.error && !/already exists|duplicate/i.test(created.error.message)) {
      throw new Error(created.error.message);
    }
  } else {
    await supabase.storage.updateBucket(DASHBOARD_BUCKET, options);
  }
}

async function writeManifest(showcase: DashboardShowcase): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.storage.from(DASHBOARD_BUCKET).upload(DASHBOARD_MANIFEST, JSON.stringify(showcase), {
    contentType: "application/json",
    upsert: true,
    cacheControl: "0",
  });
  if (error) throw new Error(error.message);
}

async function readManifest(): Promise<DashboardShowcase | "missing" | "error"> {
  try {
    const response = await fetch(publicObjectUrl(DASHBOARD_MANIFEST), { cache: "no-store" });
    if (response.status === 404) return "missing";
    if (!response.ok) {
      const text = await response.text();
      if (response.status === 400 && /not_found|object not found|bucket not found/i.test(text)) return "missing";
      return "error";
    }
    const parsed = parseShowcase(await response.json().catch(() => null));
    return parsed ?? "error";
  } catch {
    return "error";
  }
}

export async function readShowcase(): Promise<DashboardShowcase | null> {
  const found = await readManifest();
  return found === "missing" || found === "error" ? null : found;
}

/** Copies the website stills into storage once, when no manifest exists yet. */
export async function loadOrSeedShowcase(): Promise<DashboardShowcase> {
  const found = await readManifest();
  if (found !== "missing" && found !== "error") return found;
  if (found === "error") return { enabled: false, scenes: [] };
  return seedWebsiteShowcase();
}

export async function seedWebsiteShowcase(): Promise<DashboardShowcase> {
  await ensureBucket();
  const file = path.join(process.cwd(), "assets", "dashboard-seed", "scenes.json");
  const seed = JSON.parse(await readFile(file, "utf8")) as { scenes: SeedFile[] };
  const supabase = createServiceClient();
  const scenes: DashboardScene[] = [];
  for (const [index, item] of seed.scenes.entries()) {
    const ext = path.extname(item.file).toLowerCase();
    const bytes = await readFile(path.join(process.cwd(), "assets", "dashboard-seed", item.file));
    const storagePath = `seed/${item.file}`;
    const { error } = await supabase.storage.from(DASHBOARD_BUCKET).upload(storagePath, bytes, {
      contentType: MIME[ext] ?? "image/jpeg",
      upsert: true,
      cacheControl: "3600",
    });
    if (error) throw new Error(error.message);
    scenes.push({
      id: item.id,
      titleAr: item.titleAr,
      titleFr: item.titleFr,
      captionAr: item.captionAr,
      captionFr: item.captionFr,
      imageUrl: publicObjectUrl(storagePath),
      storagePath,
      sortOrder: (index + 1) * 10,
      published: true,
      durationSeconds: 8,
    });
  }
  const showcase: DashboardShowcase = { enabled: true, scenes };
  await writeManifest(showcase);
  return showcase;
}

export async function uploadSceneImage(file: File): Promise<{ imageUrl: string; storagePath: string }> {
  if (!IMAGE_TYPES.has(file.type)) {
    throw new Error("Format accepté : JPEG, PNG ou WebP. · الصيغ المقبولة: JPEG أو PNG أو WebP.");
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    throw new Error("Image trop lourde (1,5 Mo maximum). · الحد الأقصى للصورة 1.5 ميغابايت.");
  }
  await ensureBucket();
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const storagePath = `scenes/${crypto.randomUUID()}.${ext}`;
  const supabase = createServiceClient();
  const { error } = await supabase.storage.from(DASHBOARD_BUCKET).upload(storagePath, Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
    upsert: false,
    cacheControl: "3600",
  });
  if (error) throw new Error(error.message);
  return { imageUrl: publicObjectUrl(storagePath), storagePath };
}

export async function removeSceneObject(storagePath: string): Promise<void> {
  if (!STORAGE_OK(storagePath)) return;
  const supabase = createServiceClient();
  await supabase.storage.from(DASHBOARD_BUCKET).remove([storagePath]);
}

function STORAGE_OK(storagePath: string): boolean {
  return /^(seed|scenes)\/[a-zA-Z0-9._-]+$/.test(storagePath);
}

export async function saveShowcase(showcase: DashboardShowcase): Promise<DashboardShowcase> {
  if (showcase.scenes.length > MAX_DASHBOARD_SCENES) {
    throw new Error("Huit scènes au maximum. · الحد الأقصى ثمانية مشاهد.");
  }
  await ensureBucket();
  const parsed = parseShowcase(showcase);
  if (!parsed || parsed.scenes.length !== showcase.scenes.length) {
    throw new Error("Scène invalide. · مشهد غير صالح.");
  }
  await writeManifest(parsed);
  return parsed;
}
