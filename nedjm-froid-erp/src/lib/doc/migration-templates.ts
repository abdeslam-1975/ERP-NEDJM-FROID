import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const MIGRATIONS = path.resolve(__dirname, "../../../../supabase/migrations");

/** Latest seeded template of a document type, read from the SQL migrations (tests only). */
export function seededTemplate(docType: string) {
  const marker = `$${docType}$`;
  let found: string | null = null;
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(path.join(MIGRATIONS, file), "utf8");
    const start = sql.indexOf(marker);
    if (start < 0) continue;
    const end = sql.indexOf(marker, start + marker.length);
    if (end > start) found = sql.slice(start + marker.length, end).replace(/\r\n/g, "\n");
  }
  if (found == null) throw new Error(`Aucun modèle initial pour ${docType}`);
  return found;
}
