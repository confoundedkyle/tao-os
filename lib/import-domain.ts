// Pure helpers for the client "import from domain" feature, split out of the
// streaming route so the security-critical input normalisation and host check
// can be unit-tested in isolation.

/** Reduce arbitrary user input ("https://www.Acme.com/about?x=1") to a bare
 *  registrable-looking domain ("acme.com"). Returns null if it doesn't look
 *  like a domain. */
export function normalizeDomain(raw: string): string | null {
  let host = raw.trim().toLowerCase();
  if (!host) return null;
  host = host.replace(/^[a-z]+:\/\//, ""); // strip scheme
  host = host.split("/")[0]; // drop path/query
  host = host.split("@").pop()!; // drop any userinfo
  host = host.split(":")[0]; // drop port
  host = host.replace(/^www\./, ""); // drop www
  // A plausible domain: labels of letters/digits/hyphens, a dot, and a TLD.
  if (!/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host)) return null;
  return host;
}

/** True when `url`'s host is the target domain or a subdomain of it. Used as an
 *  SSRF guard before scraping a model-supplied URL. */
export function hostIsWithinDomain(url: string, domain: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  return host === domain || host.endsWith(`.${domain}`);
}
