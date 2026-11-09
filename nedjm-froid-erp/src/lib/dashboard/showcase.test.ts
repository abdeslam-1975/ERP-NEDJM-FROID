import { describe, expect, it } from "vitest";
import { parseShowcase } from "@/lib/dashboard/showcase";

const scene = {
  id: "6f1c2a10-7b31-4a1e-9c11-0a0d10000001",
  titleAr: "غرف تبريد حسب الطلب",
  titleFr: "Chambres froides sur mesure",
  captionAr: "تصميم الغرف الباردة",
  captionFr: "Conception de chambres froides",
  imageUrl: "https://example.supabase.co/storage/v1/object/public/dashboard-scenes/seed/chambres.png",
  storagePath: "seed/chambres.png",
  sortOrder: 20,
  published: true,
  durationSeconds: 8,
};

describe("dashboard showcase", () => {
  it("keeps a valid scene and ignores a broken one", () => {
    const parsed = parseShowcase({
      enabled: true,
      scenes: [scene, { ...scene, id: "not-a-uuid", sortOrder: 10 }],
    });
    expect(parsed?.scenes).toHaveLength(1);
    expect(parsed?.scenes[0]?.titleAr).toBe("غرف تبريد حسب الطلب");
  });

  it("sorts scenes and treats a missing switch as on", () => {
    const second = { ...scene, id: "6f1c2a10-7b31-4a1e-9c11-0a0d10000002", sortOrder: 5 };
    const parsed = parseShowcase({ scenes: [scene, second] });
    expect(parsed?.enabled).toBe(true);
    expect(parsed?.scenes.map((item) => item.sortOrder)).toEqual([5, 20]);
  });

  it("rejects a document that is not a showcase", () => {
    expect(parseShowcase(null)).toBeNull();
    expect(parseShowcase({ enabled: true })).toBeNull();
  });

  it("rejects an image hosted outside the showcase bucket", () => {
    const parsed = parseShowcase({
      enabled: true,
      scenes: [{ ...scene, imageUrl: "https://nedjm-froid.com/photo.jpg" }],
    });
    expect(parsed?.scenes).toHaveLength(0);
  });
});
