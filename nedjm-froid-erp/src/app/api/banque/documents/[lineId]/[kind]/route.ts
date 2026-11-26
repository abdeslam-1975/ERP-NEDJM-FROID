import { NextResponse, type NextRequest } from "next/server";
import {
  BANQUE_DOCS_BUCKET,
  isBanqueDocKind,
  parseBanqueStorageRef,
  type BanqueDocKind,
} from "@/lib/banque/documents";
import { createClient } from "@/lib/supabase/server";

const SIGNED_URL_TTL_SECONDS = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ lineId: string; kind: string }> };

function urlColumn(kind: BanqueDocKind): "bc_url" | "mode_url" | "fac_url" {
  if (kind === "bc") return "bc_url";
  if (kind === "mode") return "mode_url";
  return "fac_url";
}

export async function GET(request: NextRequest, context: RouteContext) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Session requise." }, { status: 401 });
  }

  const { lineId, kind: kindRaw } = await context.params;
  if (!UUID.test(lineId) || !isBanqueDocKind(kindRaw)) {
    return NextResponse.json({ error: "Document invalide." }, { status: 400 });
  }
  const kind = kindRaw;

  const col = urlColumn(kind);
  const { data: line, error: lineErr } = await supabase
    .from("fin_bank_lines")
    .select(`id, ${col}`)
    .eq("id", lineId)
    .is("deleted_at", null)
    .maybeSingle();

  if (lineErr || !line) {
    return NextResponse.json({ error: "Ligne introuvable ou accès refusé." }, { status: 404 });
  }

  const rawUrl = (line as Record<string, unknown>)[col] as string | null;
  let storagePath = parseBanqueStorageRef(rawUrl);

  if (!storagePath) {
    const { data: imported } = await supabase
      .from("fin_bank_doc_imports")
      .select("storage_path, file_name")
      .eq("line_id", lineId)
      .eq("kind", kind)
      .maybeSingle();
    storagePath = imported?.storage_path ?? null;
  }

  if (!storagePath) {
    if (rawUrl && (rawUrl.startsWith("http://") || rawUrl.startsWith("https://"))) {
      return NextResponse.redirect(rawUrl, 302);
    }
    return NextResponse.json({ error: "Fichier non importé." }, { status: 404 });
  }

  const download = request.nextUrl.searchParams.get("download") === "1";
  const fileName = storagePath.split("/").pop() || "document";
  const { data, error } = await supabase.storage
    .from(BANQUE_DOCS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS, {
      download: download ? fileName : false,
    });

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Fichier introuvable ou accès refusé." }, { status: 404 });
  }

  const res = NextResponse.redirect(data.signedUrl, 302);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
