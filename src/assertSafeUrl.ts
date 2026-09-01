import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_V4 = [
  /^127\./, /^10\./, /^192\.168\./, /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^0\./,
];

/**
 * Validates that a URL is safe to fetch — blocks private/internal IPs
 * to prevent SSRF attacks against cloud metadata endpoints or internal services.
 *
 * @param raw - The URL string to validate
 * @returns The parsed URL if safe
 * @throws Error if the URL targets a private/internal address or uses a blocked protocol
 *
 * @remarks
 * Caveats:
 * - Does not fully close DNS rebinding (address can change between check and fetch).
 *   For airtight protection, pin the resolved IP in the request agent.
 * - Does not re-check redirect targets. Disable redirect-following or re-check each hop,
 *   since a public URL can 302 to 169.254.169.254.
 */
export async function assertSafeUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`Blocked protocol: ${url.protocol}`);
  }
  // Resolve first — a hostname can point anywhere.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const ip = isIP(host) ? host : (await lookup(host)).address;
  if (BLOCKED_V4.some((re) => re.test(ip)) || ip === "::1" || ip.startsWith("fc") || ip.startsWith("fe80")) {
    throw new Error(`Blocked private address: ${ip}`);
  }
  return url;
}
