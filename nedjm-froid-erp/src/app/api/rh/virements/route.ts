import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { requireHrSalaryValues } from "@/lib/auth/require-roles";
import { createClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const gate = await requireHrSalaryValues();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 403 });
  const id = request.nextUrl.searchParams.get("batch") ?? "";
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Lot invalide." }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_payroll_transfer_batches")
    .select("file_name, content, sha256, mode, status_code")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Lot introuvable." }, { status: 404 });
  if (data.status_code === "CANCELLED") {
    return NextResponse.json({ error: "Lot annulé : fichier non téléchargeable." }, { status: 409 });
  }
  const hash = createHash("sha256").update(data.content, "utf8").digest("hex");
  if (hash !== data.sha256) {
    return NextResponse.json({ error: "Empreinte du fichier invalide : lot altéré." }, { status: 409 });
  }
  return new NextResponse(data.content, {
    status: 200,
    headers: {
      "Content-Type": data.mode === "BANK" ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${data.file_name}"`,
      "X-Content-SHA256": data.sha256,
      "Cache-Control": "no-store",
    },
  });
}
