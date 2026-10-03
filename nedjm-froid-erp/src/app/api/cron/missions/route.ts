import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const maxDuration = 60;

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Daily: open ordres de mission (« Fin de mission ») are carried over to the current month of the pointage. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Tâche planifiée non configurée (CRON_SECRET absent)." }, { status: 503 });
  }
  if (!sameSecret(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false, error: "Non autorisé." }, { status: 401 });
  }
  let client;
  try {
    client = createServiceClient();
  } catch {
    return NextResponse.json({ ok: false, error: "Client serveur non configuré." }, { status: 503 });
  }
  const { data, error } = await client.rpc("hr_extend_open_missions");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ ok: true, employees: data ?? 0 }, { headers: { "Cache-Control": "no-store" } });
}
