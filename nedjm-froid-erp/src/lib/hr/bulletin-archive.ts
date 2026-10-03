import { createClient } from "@/lib/supabase/server";
import { listPayrollSlips, loadPayrollIrgScales } from "@/lib/actions/hr-ops";
import { loadPayrollBulletinContext } from "@/lib/actions/hr-bulletin";
import { upsertHrFile } from "@/lib/actions/hr-documents";
import { renderBulletinHtml, slipToBulletin } from "@/components/rh/bulletin-print";
import { bulletinRatesFromVars } from "@/lib/hr/bulletin-settings";
import { hrFileDisplayUrl, hrFileHref } from "@/lib/hr/hr-file-url";
import { bulletinArchiveType } from "@/lib/hr/bulletin-archive-key";
import { withPdfRenderer } from "@/lib/pdf/html-to-pdf";
import { archiveFileStem, archiveFolder, hrPdfOptions, requestOrigin, uploadHrPdf } from "@/lib/pdf/print-archive";

const FINAL_STATUSES = new Set(["VALIDATED", "LOCKED"]);

/** Every archived bulletin, by `bulletinArchiveKey`. */
export async function listAllBulletinArchives(): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("hr_employee_files")
    .select("employee_id, doc_type_code, file_url, storage_path")
    .like("doc_type_code", "BULLETIN_%");
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    const url = hrFileDisplayUrl(row.storage_path, row.file_url);
    if (url && /^BULLETIN_\d{4}_\d{2}$/.test(row.doc_type_code)) out[`${row.employee_id}:${row.doc_type_code}`] = url;
  }
  return out;
}

/** Archived bulletins of the month, by employee id. */
export async function listBulletinArchives(year: number, month: number): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("hr_employee_files")
    .select("employee_id, file_url, storage_path")
    .eq("doc_type_code", bulletinArchiveType(year, month));
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    const url = hrFileDisplayUrl(row.storage_path, row.file_url);
    if (url) out[row.employee_id] = url;
  }
  return out;
}

/**
 * Archives the validated / closed bulletins of a run as PDFs rendered from the print HTML.
 * `onlyMissing` keeps bulletins that already have an archive for the month.
 */
export async function archivePayrollBulletins(input: {
  runId: string;
  year: number;
  month: number;
  onlyMissing?: boolean;
}): Promise<{ archived: Record<string, string>; error: string | null }> {
  const archived: Record<string, string> = {};
  try {
    const slips = await listPayrollSlips({ year: input.year, month: input.month });
    if (!slips.ok) return { archived, error: slips.error };
    let targets = slips.data.filter((s) => s.run_id === input.runId && FINAL_STATUSES.has(s.status_code));
    if (input.onlyMissing && targets.length) {
      const existing = await listBulletinArchives(input.year, input.month);
      targets = targets.filter((s) => !existing[s.employee_id]);
    }
    if (!targets.length) return { archived, error: null };

    const [context, irg, origin, supabase] = await Promise.all([
      loadPayrollBulletinContext(),
      loadPayrollIrgScales({ year: input.year, month: input.month }),
      requestOrigin(),
      createClient(),
    ]);
    const settings = context.bulletin;
    const period = `${input.year}-${String(input.month).padStart(2, "0")}`;
    const docType = bulletinArchiveType(input.year, input.month);
    const errors: string[] = [];
    await withPdfRenderer(hrPdfOptions(supabase, origin), async (render) => {
      for (const slip of targets) {
        const model = slipToBulletin(slip, settings, bulletinRatesFromVars(slip.legal_vars, settings), irg.ok ? irg.data : null);
        const pdf = await render(renderBulletinHtml(context.template, [model], origin));
        const path = `${archiveFolder(slip.employee_id)}/BULLETIN-${period}-${crypto.randomUUID()}.pdf`;
        const uploadError = await uploadHrPdf(supabase, path, pdf);
        if (uploadError) {
          errors.push(`${slip.matricule} : ${uploadError}`);
          continue;
        }
        const fileUrl = hrFileHref(path);
        const filed = await upsertHrFile({
          employee_id: slip.employee_id,
          doc_type_code: docType,
          file_url: fileUrl,
          file_name: `BULLETIN_${archiveFileStem(period, slip.matricule || "NA", slip.employee_name || "")}.pdf`,
          storage_path: path,
          notes: `Bulletin de paie ${String(input.month).padStart(2, "0")}/${input.year} · كشف الأجر`,
        });
        if (filed.ok) archived[slip.employee_id] = fileUrl;
        else errors.push(`${slip.matricule} : ${filed.error}`);
      }
    });
    return { archived, error: errors.length ? errors.join(" ; ") : null };
  } catch (e) {
    return { archived, error: e instanceof Error ? e.message : "Échec de l'archivage des bulletins." };
  }
}
