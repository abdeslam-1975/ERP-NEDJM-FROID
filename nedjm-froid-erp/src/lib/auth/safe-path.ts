/**
 * Allow only same-origin relative paths (block protocol-relative //evil.com).
 */
export function safeInternalPath(next: unknown, fallback = "/"): string {
  if (typeof next !== "string") return fallback;
  const path = next.trim();
  if (!path.startsWith("/")) return fallback;
  if (path.startsWith("//")) return fallback;
  if (path.includes("\\")) return fallback;
  // Browsers drop tabs and other control characters, so "/\t/evil.com" would become "//evil.com".
  if (/[\u0000-\u001f\u007f]/.test(path)) return fallback;
  return path;
}
