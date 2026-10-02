import { headers } from "next/headers";
import type { createClient } from "@/lib/supabase/server";
import { HR_DOCS_BUCKET, isSafeHrFilePath } from "@/lib/hr/hr-file-url";
import type { PdfOptions } from "@/lib/pdf/html-to-pdf";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function siteOrigin() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "";
}

/** Origin the user is browsing, so the archived PDF loads the same fonts and images as the printout. */
export async function requestOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return siteOrigin();
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto.split(",")[0].trim()}://${host}`;
}

/** Render options for an HR print: private files (`/api/rh/fichier`) are read from storage with the session. */
export function hrPdfOptions(supabase: Supabase, origin: string): PdfOptions {
  return {
    baseUrl: origin,
    resolve: async (url) => {
      if (url.pathname !== "/api/rh/fichier") return null;
      const filePath = url.searchParams.get("p") ?? "";
      if (!isSafeHrFilePath(filePath)) return null;
      const { data } = await supabase.storage.from(HR_DOCS_BUCKET).download(filePath);
      if (!data) return null;
      return { body: Buffer.from(await data.arrayBuffer()), contentType: data.type || "application/octet-stream" };
    },
  };
}

export async function uploadHrPdf(supabase: Supabase, path: string, pdf: Buffer): Promise<string | null> {
  const { error } = await supabase.storage.from(HR_DOCS_BUCKET).upload(path, pdf, {
    contentType: "application/pdf",
    upsert: false,
  });
  return error ? error.message : null;
}

export function archiveFileStem(...parts: string[]) {
  return parts.map((part) => part.replace(/\//g, "-").replace(/[^\w-]+/g, "_")).join("_");
}

export function archiveFolder(employeeId: string) {
  return employeeId.replace(/[^a-zA-Z0-9-]/g, "");
}
