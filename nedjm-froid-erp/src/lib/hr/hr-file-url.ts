export const HR_DOCS_BUCKET = "hr-docs";

const SAFE_PATH = /^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/;

/** Object paths are `<employeeId>/<name>.<ext>`; anything else is rejected. */
export function isSafeHrFilePath(path: string | null | undefined): path is string {
  return typeof path === "string" && SAFE_PATH.test(path) && !path.includes("..");
}

/** App link to a private HR document (the route checks the session and signs the URL). */
export function hrFileHref(path: string): string {
  return `/api/rh/fichier?p=${encodeURIComponent(path).replace(/%2F/g, "/")}`;
}

/** Stored link for display: private objects always go through the app route. */
export function hrFileDisplayUrl(
  storagePath: string | null | undefined,
  storedUrl: string | null | undefined,
): string | null {
  if (isSafeHrFilePath(storagePath)) return hrFileHref(storagePath);
  return storedUrl || null;
}
