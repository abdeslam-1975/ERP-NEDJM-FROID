import { NextResponse, type NextRequest } from "next/server";
import { requireContractAccess } from "@/lib/auth/require-roles";
import { CONTRACT_DOCS_BUCKET } from "@/lib/contracts/document-files";
import { createClient } from "@/lib/supabase/server";

const SIGNED_URL_TTL_SECONDS = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ documentId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const gate = await requireContractAccess();
  if (!gate.ok) {
    const status = gate.error.includes("Session") ? 401 : 403;
    return NextResponse.json({ error: gate.error }, { status });
  }

  const { documentId } = await context.params;
  if (!UUID.test(documentId)) {
    return NextResponse.json({ error: "Document invalide." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("contract_documents")
    .select("storage_path, file_name")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) {
    return NextResponse.json({ error: "Document introuvable ou accès refusé." }, { status: 404 });
  }

  const download = request.nextUrl.searchParams.get("download") === "1";
  const { data, error } = await supabase.storage
    .from(CONTRACT_DOCS_BUCKET)
    .createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS, {
      download: download ? doc.file_name : false,
    });
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Fichier introuvable ou accès refusé." }, { status: 404 });
  }

  const res = NextResponse.redirect(data.signedUrl, 302);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
