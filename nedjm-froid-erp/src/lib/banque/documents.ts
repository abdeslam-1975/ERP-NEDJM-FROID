export const BANQUE_DOCS_BUCKET = "banque-docs";
export const BANQUE_DOC_KINDS = ["bc", "mode", "fac"] as const;
export type BanqueDocKind = (typeof BANQUE_DOC_KINDS)[number];

const STORAGE_PREFIX = "storage://banque-docs/";
const DRIVE_FILE_RE =
  /(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?.*id=)|docs\.google\.com\/.*[?&]id=)([a-zA-Z0-9_-]{10,})/;

export function isBanqueDocKind(value: string): value is BanqueDocKind {
  return (BANQUE_DOC_KINDS as readonly string[]).includes(value);
}

/** Extract Google Drive file id from archive hyperlink. */
export function extractDriveFileId(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const m = trimmed.match(DRIVE_FILE_RE);
  return m?.[1] ?? null;
}

export function isDriveDocumentUrl(url: string | null | undefined): boolean {
  return Boolean(extractDriveFileId(url));
}

export function toBanqueStorageRef(storagePath: string): string {
  const path = storagePath.replace(/^\/+/, "");
  return `${STORAGE_PREFIX}${path}`;
}

export function parseBanqueStorageRef(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed.startsWith(STORAGE_PREFIX)) return null;
  const path = trimmed.slice(STORAGE_PREFIX.length).replace(/^\/+/, "");
  return path || null;
}

export function isBanqueDocumentHref(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  return (
    trimmed.startsWith(STORAGE_PREFIX) ||
    trimmed.startsWith("/api/banque/documents/") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:")
  );
}

export function banqueDocumentApiPath(lineId: string, kind: BanqueDocKind): string {
  return `/api/banque/documents/${lineId}/${kind}`;
}

export function resolveBanqueDocumentHref(
  lineId: string,
  kind: BanqueDocKind,
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (parseBanqueStorageRef(trimmed) || trimmed.startsWith("/api/banque/documents/")) {
    return banqueDocumentApiPath(lineId, kind);
  }
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:")
  ) {
    return trimmed;
  }
  return null;
}

export function guessExtFromMime(mime: string | null | undefined, fileName?: string | null): string {
  if (fileName) {
    const m = fileName.toLowerCase().match(/\.([a-z0-9]{2,5})$/);
    if (m) return m[1];
  }
  const map: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  };
  return map[(mime || "").toLowerCase()] || "bin";
}

export function buildBanqueStoragePath(params: {
  accountId: string;
  lineId: string;
  kind: BanqueDocKind;
  driveFileId: string;
  ext: string;
}): string {
  const ext = params.ext.replace(/^\./, "").toLowerCase() || "bin";
  return `${params.accountId}/${params.lineId}/${params.kind}__${params.driveFileId}.${ext}`;
}
