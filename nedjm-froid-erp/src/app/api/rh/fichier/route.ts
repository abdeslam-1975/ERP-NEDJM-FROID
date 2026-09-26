import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { HR_DOCS_BUCKET, isSafeHrFilePath } from "@/lib/hr/hr-file-url";

const SIGNED_URL_TTL_SECONDS = 120;

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("p");
  if (!isSafeHrFilePath(path)) {
    return NextResponse.json({ error: "Fichier invalide." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent("/rh/documents")}`, request.url));
  }

  // Generated HTML archives (ordres de mission) are rendered from the app origin so relative assets resolve.
  if (path.endsWith(".html")) {
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
        "Content-Security-Policy": "script-src 'unsafe-inline'; object-src 'none'; base-uri 'none'",
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
