import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runLegalWatch } from "@/lib/watch/run";

export const maxDuration = 60;

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Scheduled legal watch (Vercel Cron sends « Authorization: Bearer <CRON_SECRET> »). */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Veille planifiée non configurée (CRON_SECRET absent)." }, { status: 503 });
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
  try {
    const summary = await runLegalWatch(client, "CRON");
    return NextResponse.json({ ok: true, ...summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Vérification impossible." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
