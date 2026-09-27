export const CONTRACT_DOCS_BUCKET = "contract-docs";
export const CONTRACT_DOC_MAX_BYTES = 25 * 1024 * 1024;

export const CONTRACT_DOC_KINDS = [
  { value: "CONTRAT", label: "Contrat signé" },
  { value: "EXTRAIT", label: "Extrait du contrat" },
  { value: "AVENANT", label: "Avenant" },
  { value: "ANNEXE", label: "Annexe / BPU" },
  { value: "CAHIER_CHARGES", label: "Cahier des charges" },
  { value: "PV", label: "Procès-verbal" },
  { value: "CORRESPONDANCE", label: "Correspondance" },
  { value: "AUTRE", label: "Autre" },
] as const;

export type ContractDocKind = (typeof CONTRACT_DOC_KINDS)[number]["value"];

export type ContractDocFormat = "PDF" | "WORD" | "EXCEL" | "IMAGE";

const BY_EXTENSION: Record<string, { mime: string; format: ContractDocFormat }> = {
  pdf: { mime: "application/pdf", format: "PDF" },
  doc: { mime: "application/msword", format: "WORD" },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    format: "WORD",
  },
  xls: { mime: "application/vnd.ms-excel", format: "EXCEL" },
  xlsx: {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    format: "EXCEL",
  },
  csv: { mime: "text/csv", format: "EXCEL" },
  jpg: { mime: "image/jpeg", format: "IMAGE" },
  jpeg: { mime: "image/jpeg", format: "IMAGE" },
  png: { mime: "image/png", format: "IMAGE" },
  webp: { mime: "image/webp", format: "IMAGE" },
  heic: { mime: "image/heic", format: "IMAGE" },
  heif: { mime: "image/heif", format: "IMAGE" },
};

export const CONTRACT_DOC_ACCEPT = Object.keys(BY_EXTENSION)
  .map((ext) => `.${ext}`)
  .join(",");

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/** The extension decides the stored type; browsers often send an empty or generic MIME. */
export function resolveContractDocType(
  fileName: string,
): { ext: string; mime: string; format: ContractDocFormat } | null {
  const ext = extensionOf(fileName);
  const known = BY_EXTENSION[ext];
  return known ? { ext, ...known } : null;
}

export function contractDocIssue(fileName: string, size: number): string | null {
  if (!resolveContractDocType(fileName)) {
    return "Formats acceptés : PDF, Word, Excel/CSV, JPG, PNG, WEBP, HEIC.";
  }
  if (!Number.isFinite(size) || size <= 0) return "Fichier vide.";
  if (size > CONTRACT_DOC_MAX_BYTES) return "Fichier trop volumineux (25 Mo maximum).";
  return null;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SAFE_PATH = new RegExp(`^(${UUID})/(${UUID})\\.([a-z0-9]{2,5})$`, "i");

export function contractDocPath(contractId: string, fileId: string, ext: string): string {
  return `${contractId}/${fileId}.${ext}`;
}

/** Paths are `<contract_id>/<uuid>.<ext>` and must belong to the given contract. */
export function isContractDocPath(path: string, contractId: string): boolean {
  const match = SAFE_PATH.exec(path);
  return Boolean(match && match[1].toLowerCase() === contractId.toLowerCase());
}

/** Gemini reads PDF and images directly; .docx is converted to text first. */
export const ANALYSABLE_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export function isAnalysable(fileName: string): boolean {
  const type = resolveContractDocType(fileName);
  return Boolean(type && ANALYSABLE_MIME.has(type.mime));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
