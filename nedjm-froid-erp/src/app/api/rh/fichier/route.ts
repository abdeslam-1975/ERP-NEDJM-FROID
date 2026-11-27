import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { HR_DOCS_BUCKET, isSafeHrFilePath } from "@/lib/hr/hr-file-url";

const SIGNED_URL_TTL_SECONDS = 120;

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("p");
  if (!isSafeHrFilePath(path)) {
    return NextResponse.json({ error: "Fichier invalide." }, { status: 400 });
  }

  const staged = /^contrats-pdf\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/i.exec(path);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent("/rh/documents")}`, request.url));
  }

  // The imported contract stays the original file: number, signature and fingerprint are on the paper.
  if (staged) {
    const { data, error } = await supabase.storage.from(HR_DOCS_BUCKET).download(path);
    if (error || !data) {
      return NextResponse.json({ error: "Fichier introuvable ou accès refusé." }, { status: 404 });
    }
    const ext = staged[1].toLowerCase();
    const mime =
      ext === "pdf" ? "application/pdf" : ext === "jpg" ? "image/jpeg" : ext === "png" ? "image/png" : "image/webp";
    return new NextResponse(await data.arrayBuffer(), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  // Generated HTML archives (ordres de mission) are rendered from the app origin so relative assets resolve.
  // They never contain scripts: sandboxed without allow-scripts, an uploaded HTML file cannot act in the session.
  if (path.endsWith(".html") && /(^|\/)OM_ARCHIVE-[^/]+\.html$/.test(path)) {
    const { data, error } = await supabase.storage.from(HR_DOCS_BUCKET).download(path);
    if (error || !data) {
      return NextResponse.json({ error: "Fichier introuvable ou accès refusé." }, { status: 404 });
    }
    return new NextResponse(await data.arrayBuffer(), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "sandbox allow-modals allow-popups; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
      },
    });
  }

  const { data, error } = await supabase.storage
    .from(HR_DOCS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Fichier introuvable ou accès refusé." }, { status: 404 });
  }
  const res = NextResponse.redirect(data.signedUrl, 302);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
