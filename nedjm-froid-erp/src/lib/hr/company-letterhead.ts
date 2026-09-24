export const COMPANY_LETTERHEAD_PATH = "/hr-letterhead.png";

/** Same image as the employee card. Absolute so print frames can load it. */
export function companyLetterheadUrl(configured: string | null | undefined, origin = "") {
  const url = (configured ?? "").trim();
  if (!url) return `${origin}${COMPANY_LETTERHEAD_PATH}`;
  if (/^(https?:|data:)/i.test(url)) return url;
  if (url.startsWith("/")) return `${origin}${url}`;
  return `${origin}/${url}`;
}
