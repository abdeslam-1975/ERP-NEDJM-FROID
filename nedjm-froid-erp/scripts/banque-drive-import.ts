/**
 * Import Google Drive attachments from fin_bank_lines into Supabase Storage.
 *
 * Prerequisites:
 * 1. Apply migration 20261126180000_banque_docs_storage.sql on Supabase
 * 2. Create a Google Cloud service account with Drive read access
 * 3. Share the Drive files/folder with the service account email (Viewer)
 * 4. Set env:
 *    - GOOGLE_SERVICE_ACCOUNT_JSON  (full JSON string) OR GOOGLE_APPLICATION_CREDENTIALS (file path)
 *    - NEXT_PUBLIC_SUPABASE_URL
 *    - SUPABASE_SERVICE_ROLE_KEY
 *    - SUPABASE_DB_PASSWORD (optional; used for direct SQL updates if set)
 *
 * Usage:
 *   npx tsx scripts/banque-drive-import.ts --dry-run
 *   npx tsx scripts/banque-drive-import.ts --limit 5
 *   npx tsx scripts/banque-drive-import.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BANQUE_DOCS_BUCKET,
  buildBanqueStoragePath,
  extractDriveFileId,
  guessExtFromMime,
  toBanqueStorageRef,
  type BanqueDocKind,
} from "../src/lib/banque/documents";

type DocJob = {
  lineId: string;
  accountId: string;
  kind: BanqueDocKind;
  driveUrl: string;
  driveFileId: string;
  column: "bc_url" | "mode_url" | "fac_url";
};

type SaJson = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

function parseArgs(argv: string[]) {
  const dryRun = argv.includes("--dry-run");
  const limitIdx = argv.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(argv[limitIdx + 1]) : null;
  const outIdx = argv.indexOf("--out");
  const out = outIdx >= 0 ? argv[outIdx + 1] : null;
  return { dryRun, limit: Number.isFinite(limit) && (limit as number) > 0 ? (limit as number) : null, out };
}

function loadServiceAccount(): SaJson {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw && raw.trim()) {
    return JSON.parse(raw) as SaJson;
  }
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path) {
    return JSON.parse(readFileSync(resolve(path), "utf8")) as SaJson;
  }
  throw new Error(
    "Missing Google credentials. Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.",
  );
}

function b64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken(sa: SaJson): Promise<string> {
  const crypto = await import("node:crypto");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/drive.readonly",
      aud: sa.token_uri || "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claim}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = b64url(signer.sign(sa.private_key));
  const assertion = `${unsigned}.${signature}`;

  const res = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token error ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Google token response missing access_token");
  return json.access_token;
}

async function driveMeta(token: string, fileId: string) {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`);
  url.searchParams.set("fields", "id,name,mimeType,size");
  url.searchParams.set("supportsAllDrives", "true");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`Drive meta ${fileId}: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { id: string; name?: string; mimeType?: string; size?: string };
}

async function driveDownload(token: string, fileId: string, mimeType?: string): Promise<Buffer> {
  // Google Docs native types need export; binary files use alt=media.
  const googleNative = (mimeType || "").startsWith("application/vnd.google-apps.");
  let url: string;
  if (googleNative) {
    const exportMime =
      mimeType === "application/vnd.google-apps.spreadsheet"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : mimeType === "application/vnd.google-apps.document"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/pdf";
    url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`;
  } else {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`Drive download ${fileId}: ${res.status} ${await res.text()}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const sa = loadServiceAccount();
  console.log(`Service account: ${sa.client_email}`);
  console.log(args.dryRun ? "Mode: DRY-RUN (no upload / no DB write)" : "Mode: IMPORT");

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rows, error } = await supabase
    .from("fin_bank_lines")
    .select("id, account_id, bc_url, mode_url, fac_url")
    .is("deleted_at", null);

  if (error) throw error;

  const jobs: DocJob[] = [];
  for (const row of rows || []) {
    const triples: Array<[BanqueDocKind, string | null, DocJob["column"]]> = [
      ["bc", row.bc_url, "bc_url"],
      ["mode", row.mode_url, "mode_url"],
      ["fac", row.fac_url, "fac_url"],
    ];
    for (const [kind, url, column] of triples) {
      if (!url || !url.includes("drive.google.com")) continue;
      if (url.startsWith("storage://")) continue;
      const driveFileId = extractDriveFileId(url);
      if (!driveFileId) continue;
      jobs.push({
        lineId: row.id,
        accountId: row.account_id,
        kind,
        driveUrl: url,
        driveFileId,
        column,
      });
    }
  }

  const selected = args.limit ? jobs.slice(0, args.limit) : jobs;
  console.log(`Jobs: ${selected.length} / ${jobs.length} Drive attachments`);

  const report: Array<Record<string, unknown>> = [];
  if (args.dryRun) {
    for (const job of selected) {
      report.push({
        status: "dry-run",
        ...job,
        storagePath: buildBanqueStoragePath({
          accountId: job.accountId,
          lineId: job.lineId,
          kind: job.kind,
          driveFileId: job.driveFileId,
          ext: "bin",
        }),
      });
    }
  } else {
    const token = await getAccessToken(sa);
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < selected.length; i++) {
      const job = selected[i]!;
      const label = `[${i + 1}/${selected.length}] ${job.kind} ${job.driveFileId}`;
      try {
        const { data: existing } = await supabase
          .from("fin_bank_doc_imports")
          .select("storage_path")
          .eq("line_id", job.lineId)
          .eq("kind", job.kind)
          .maybeSingle();
        if (existing?.storage_path) {
          const ref = toBanqueStorageRef(existing.storage_path);
          await supabase
            .from("fin_bank_lines")
            .update({ [job.column]: ref })
            .eq("id", job.lineId);
          ok += 1;
          report.push({ status: "skipped-existing", ...job, storagePath: existing.storage_path });
          console.log(`${label} → already imported`);
          continue;
        }

        const meta = await driveMeta(token, job.driveFileId);
        const bytes = await driveDownload(token, job.driveFileId, meta.mimeType);
        const ext = guessExtFromMime(meta.mimeType, meta.name);
        const storagePath = buildBanqueStoragePath({
          accountId: job.accountId,
          lineId: job.lineId,
          kind: job.kind,
          driveFileId: job.driveFileId,
          ext,
        });
        const contentType = meta.mimeType || "application/octet-stream";

        const up = await supabase.storage.from(BANQUE_DOCS_BUCKET).upload(storagePath, bytes, {
          contentType,
          upsert: true,
        });
        if (up.error) throw up.error;

        const ins = await supabase.from("fin_bank_doc_imports").upsert(
          {
            line_id: job.lineId,
            kind: job.kind,
            drive_file_id: job.driveFileId,
            drive_url: job.driveUrl,
            storage_path: storagePath,
            file_name: meta.name || `${job.kind}.${ext}`,
            mime_type: contentType,
            size_bytes: bytes.length,
          },
          { onConflict: "line_id,kind" },
        );
        if (ins.error) throw ins.error;

        const ref = toBanqueStorageRef(storagePath);
        const upd = await supabase
          .from("fin_bank_lines")
          .update({ [job.column]: ref })
          .eq("id", job.lineId);
        if (upd.error) throw upd.error;

        ok += 1;
        report.push({
          status: "imported",
          ...job,
          storagePath,
          bytes: bytes.length,
          fileName: meta.name,
          mimeType: contentType,
        });
        console.log(`${label} → OK (${bytes.length} bytes)`);
      } catch (e) {
        fail += 1;
        const message = e instanceof Error ? e.message : String(e);
        report.push({ status: "error", ...job, error: message });
        console.error(`${label} → FAIL: ${message}`);
      }
    }
    console.log(`Done. ok=${ok} fail=${fail}`);
  }

  if (args.out) {
    writeFileSync(resolve(args.out), JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2));
    console.log(`Wrote ${args.out}`);
  } else {
    writeFileSync(
      "/opt/cursor/artifacts/banque-drive-import-report.json",
      JSON.stringify({ generatedAt: new Date().toISOString(), serviceAccount: sa.client_email, report }, null, 2),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
