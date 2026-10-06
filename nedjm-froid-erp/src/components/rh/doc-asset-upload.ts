"use client";

import { createClient } from "@supabase/supabase-js";
import { prepareDocAssetUpload } from "@/lib/actions/hr-custom-docs";
import { DOC_ASSETS_BUCKET } from "@/lib/doc/custom-docs";

type Uploaded = { ok: true; path: string; url: string } | { ok: false; error: string };

/** Sends a font or a letterhead image to the documents assets bucket through a signed upload. */
export async function uploadDocAsset(kind: "font" | "letterhead", file: File): Promise<Uploaded> {
  const prepared = await prepareDocAssetUpload({ kind, fileName: file.name, mime: file.type, size: file.size });
  if (!prepared.ok) return prepared;
  const storage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(DOC_ASSETS_BUCKET);
  const { error } = await storage.uploadToSignedUrl(prepared.data.path, prepared.data.token, file, {
    contentType: prepared.data.contentType,
  });
  if (error) return { ok: false, error: `Envoi du fichier impossible : ${error.message}` };
  return { ok: true, path: prepared.data.path, url: prepared.data.url };
}
