// Route IFSCA document links through our own mirror (/d) so they keep working
// even when ifsca.gov.in is unreachable. Non-IFSCA URLs pass through untouched.

const IFSCA_HOST = "ifsca.gov.in";

export function isIfscaDoc(url?: string | null): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname === IFSCA_HOST && /ViewFile/i.test(u.pathname);
  } catch {
    return false;
  }
}

// For use in the site. Returns a link that goes through our mirror for IFSCA
// docs, or the original URL otherwise (undefined for empty).
export function docHref(url?: string | null): string | undefined {
  if (!url) return undefined;
  return isIfscaDoc(url) ? `/d?u=${encodeURIComponent(url)}` : url;
}
