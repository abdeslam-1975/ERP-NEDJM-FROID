import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = readFileSync(path.join(root, ".env.local"), "utf8");
const val = (key) => {
  const line = env.split(/\r?\n/).find((entry) => entry.startsWith(`${key}=`));
  if (!line) throw new Error(`Missing ${key}`);
  return line.slice(key.length + 1).replace(/^"|"$/g, "");
};

const supabase = createClient(val("NEXT_PUBLIC_SUPABASE_URL"), val("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const bucket = "dashboard-scenes";
const options = {
  public: true,
  fileSizeLimit: 1572864,
  allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "application/json"],
};
const created = await supabase.storage.createBucket(bucket, options);
if (created.error && !/already exists|duplicate/i.test(created.error.message)) {
  console.error("createBucket", created.error.message);
  process.exit(1);
}
const updated = await supabase.storage.updateBucket(bucket, options);
if (updated.error) console.error("updateBucket", updated.error.message);

const seedDir = path.join(root, "assets", "dashboard-seed");
const seed = JSON.parse(readFileSync(path.join(seedDir, "scenes.json"), "utf8"));
const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
const base = val("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const scenes = [];
for (const [index, item] of seed.scenes.entries()) {
  const ext = path.extname(item.file).toLowerCase();
  const storagePath = `seed/${item.file}`;
  const uploaded = await supabase.storage.from(bucket).upload(storagePath, readFileSync(path.join(seedDir, item.file)), {
    contentType: mime[ext],
    upsert: true,
    cacheControl: "3600",
  });
  if (uploaded.error) {
    console.error(item.file, uploaded.error.message);
    process.exit(1);
  }
  scenes.push({
    id: item.id,
    titleAr: item.titleAr,
    titleFr: item.titleFr,
    captionAr: item.captionAr,
    captionFr: item.captionFr,
    imageUrl: `${base}/storage/v1/object/public/${bucket}/${storagePath}`,
    storagePath,
    sortOrder: (index + 1) * 10,
    published: true,
    durationSeconds: 8,
  });
}
const manifest = await supabase.storage.from(bucket).upload("manifest.json", JSON.stringify({ enabled: true, scenes }), {
  contentType: "application/json",
  upsert: true,
  cacheControl: "0",
});
if (manifest.error) {
  console.error("manifest", manifest.error.message);
  process.exit(1);
}
console.log(`seeded ${scenes.length} scenes`);
