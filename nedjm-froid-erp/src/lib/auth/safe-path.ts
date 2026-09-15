/**
 * Allow only same-origin relative paths (block protocol-relative //evil.com).
 */
export function safeInternalPath(next: unknown, fallback = "/"): string {
  if (typeof next !== "string") return fallback;
  const path = next.trim();
  if (!path.startsWith("/")) return fallback;
  if (path.startsWith("//")) return fallback;
  if (path.includes("\\")) return fallback;
  if (/[\r\n]/.test(path)) return fallback;
  return path;
}
