/** One archived bulletin per employee and month: the file row is keyed by this document type. */
export function bulletinArchiveType(year: number, month: number) {
  return `BULLETIN_${year}_${String(month).padStart(2, "0")}`;
}

/** Key of an archived bulletin in `listAllBulletinArchives`. */
export function bulletinArchiveKey(employeeId: string, year: number, month: number) {
  return `${employeeId}:${bulletinArchiveType(year, month)}`;
}
