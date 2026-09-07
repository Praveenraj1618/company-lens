export class InputError extends Error { status = 400; }
export function publicUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new InputError("Enter a valid HTTPS URL."); }
  const h = url.hostname.toLowerCase().replace(/\.$/, "");
  // Only DNS names, HTTPS and standard ports; reject numeric encodings and local suffixes.
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") ||
    h.includes(":") || /^[\d.]+$/.test(h) || !h.includes(".") ||
    /(^|\.)(localhost|local|internal|test|invalid|onion|home|lan)$/.test(h) ||
    /(^|\.)(metadata\.google\.internal|localtest\.me|nip\.io|sslip\.io)$/.test(h)) {
    throw new InputError("Use a public HTTPS website without credentials or a custom port.");
  }
  if (raw.length > 2000) throw new InputError("URL is too long.");
  return url;
}
export function publicAddress(ip: string): boolean {
  if (ip.includes(":")) {
    // Limit to global unicast; exclude special-purpose, documentation and transition ranges.
    if (!/^[0-9a-f:]+$/i.test(ip) || !/^[23][0-9a-f]{3}:/i.test(ip)) return false;
    const [first, second = "0"] = ip.split(":").map(v => v || "0");
    const a = parseInt(first, 16), b = parseInt(second, 16);
    return !(a === 0x2002 || (a === 0x2001 && (b < 0x200 || b === 0xdb8)) || (a === 0x3fff && b < 0x1000));
  }
  const n = ip.split(".").map(Number);
  if (n.length !== 4 || n.some(v => !Number.isInteger(v) || v < 0 || v > 255)) return false;
  const [a, b, c] = n;
  // /24 special-use blocks must not exclude public hosts in the surrounding /16.
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && [0, 2].includes(c)) || (b === 88 && c === 99))) ||
    (a === 198 && ([18, 19].includes(b) || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
}

export async function checkDns(host: string, fetcher: typeof fetch = fetch): Promise<void> {
  const answers = await Promise.all(["A", "AAAA"].map(async type => {
    const response = await fetcher(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, {
      headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(5000), redirect: "error",
    });
    if (!response.ok) throw new InputError("Could not verify the source hostname. Try again later.");
    const data = await response.json() as { Status: number; Answer?: { type: number; data: string }[] };
    if (data.Status !== 0) throw new InputError("The source hostname could not be resolved.");
    return (data.Answer ?? []).filter(a => a.type === 1 || a.type === 28).map(a => a.data);
  }));
  const addresses = answers.flat();
  if (!addresses.length || addresses.some(ip => !publicAddress(ip))) throw new InputError("The source does not resolve exclusively to public addresses.");
}
export async function readLimited(response: Response, maxBytes = 1_500_000): Promise<string> {
  if (Number(response.headers.get("content-length")) > maxBytes) throw new InputError("Source exceeds the 1.5 MB retrieval limit.");
  if (!response.body) return "";
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  let size = 0, text = "";
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new InputError("Source exceeds the 1.5 MB retrieval limit.");
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function fetchPublic(raw: string, accept: string, fetcher: typeof fetch = fetch): Promise<{ text: string; url: string; contentType: string }> {
  let url = publicUrl(raw);
  for (let redirect = 0; redirect < 4; redirect++) {
    await checkDns(url.hostname, fetcher);
    const response = await fetcher(url, {
      headers: { "user-agent": "CompanyLens/1.0 (company news research; bounded fetch)", accept },
      redirect: "manual", signal: AbortSignal.timeout(10000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location"); await response.body?.cancel();
      if (!location) throw new InputError("Source returned an invalid redirect.");
      url = publicUrl(new URL(location, url).toString()); continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new InputError(`Source returned HTTP ${response.status}. Access restrictions are respected.`); }
    const contentType = response.headers.get("content-type") ?? "";
    if (!/(text\/|xml|json|html)/i.test(contentType)) { await response.body?.cancel(); throw new InputError("Only text articles and XML/JSON feeds are supported."); }
    return { text: await readLimited(response), url: url.toString(), contentType };
  }
  throw new InputError("Source redirects too many times.");
}
export function sameOriginWrite(request: Request): void {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site" || (origin && origin !== new URL(request.url).origin)) throw new InputError("Cross-origin writes are not allowed.");
}
