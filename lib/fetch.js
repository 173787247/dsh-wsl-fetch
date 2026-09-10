import { isIP } from "node:net";

export const PROVIDER_ID = "wsl-proxy";
export const DEFAULT_USER_AGENT = "deepseek-harness-wsl-fetch/0.1.1 (+https://github.com/173787247/dsh-wsl-fetch)";
export const MAX_URL_LENGTH = 2048;

/** Read the HTTP(S) proxy URL from env. Empty string when unset. */
export function readProxyUrl(env = process.env) {
  const raw = env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy || "";
  return String(raw).trim();
}

export function isPrivateIp(ip) {
  const raw = String(ip || "").replace(/^\[|\]$/g, "");
  if (!raw) return true;
  if (raw.includes(".")) {
    const p = raw.split(".").map((n) => Number(n));
    if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    if (p[0] === 10 || p[0] === 127 || p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
    return false;
  }
  const h = raw.toLowerCase();
  if (h === "::1" || h === "::" || h === "0:0:0:0:0:0:0:1") return true;
  if (h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  if (h.startsWith("::ffff:")) return isPrivateIp(h.slice(7));
  return false;
}

export function isBlockedHostname(hostname) {
  const host = String(hostname || "").replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) return true;
  if (host === "localhost" || host === "0.0.0.0") return true;
  if (
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".lan")
  ) {
    return true;
  }
  if (isIP(host)) return isPrivateIp(host);
  return false;
}

export function classifyContentType(contentType) {
  const mime = (contentType ?? "").replace(/;.*$/s, "").trim().toLowerCase();
  if (!mime) return "text";
  if (mime === "text/html" || mime === "application/xhtml+xml") return "html";
  if (mime.startsWith("text/")) return "text";
  if (mime === "application/json" || mime === "application/xml" || mime.endsWith("+json") || mime.endsWith("+xml")) {
    return "text";
  }
  return undefined;
}

export function parseFetchUrl(input) {
  const raw = String(input ?? "").trim();
  if (!raw) {
    const err = Object.assign(new Error("empty URL"), { code: "WEB_INVALID_URL" });
    throw err;
  }
  if (raw.length > MAX_URL_LENGTH) {
    throw Object.assign(new Error(`URL exceeds the maximum length of ${MAX_URL_LENGTH}`), { code: "WEB_INVALID_URL" });
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw Object.assign(new Error(`invalid URL "${raw}"`), { code: "WEB_INVALID_URL" });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw Object.assign(new Error(`unsupported URL protocol "${url.protocol}"`), { code: "WEB_INVALID_URL" });
  }
  if (url.username || url.password) {
    throw Object.assign(new Error("URLs with credentials are blocked"), { code: "WEB_BLOCKED_URL" });
  }
  if (isBlockedHostname(url.hostname)) {
    throw Object.assign(new Error(`URL hostname "${url.hostname}" is not a public destination`), { code: "WEB_BLOCKED_URL" });
  }
  return url;
}

export function isRedirectStatus(status) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

export function isSameOrigin(a, b) {
  return a.protocol === b.protocol && a.hostname === b.hostname && a.port === b.port;
}

/** Allow www.example.com ↔ example.com only (same port/protocol). Still blocks real cross-site hops. */
export function isWwwHostAlias(a, b) {
  if (a.protocol !== b.protocol || a.port !== b.port) return false;
  const ha = String(a.hostname || "").toLowerCase();
  const hb = String(b.hostname || "").toLowerCase();
  if (ha === hb) return true;
  return ha === `www.${hb}` || hb === `www.${ha}`;
}

export function shouldFollowRedirect(from, to) {
  return isSameOrigin(from, to) || isWwwHostAlias(from, to);
}

export function shouldPinFetchProvider(existingId) {
  return existingId == null || existingId === "" || existingId === "http";
}

export function formatNetworkCause(error) {
  if (!error || typeof error !== "object") return String(error ?? "unknown");
  const parts = [];
  const code = error.code || error.cause?.code;
  if (code) parts.push(String(code));
  const msg = error instanceof Error ? error.message : String(error);
  if (msg && msg !== "fetch failed") parts.push(msg);
  else if (msg === "fetch failed" && !code) parts.push("fetch failed (proxy/TLS/timeout)");
  const causeMsg = error.cause instanceof Error ? error.cause.message : error.cause?.message;
  if (causeMsg && causeMsg !== msg) parts.push(String(causeMsg));
  return parts.filter(Boolean).join(": ") || "fetch failed";
}

function translateNetwork(error, signal) {
  if (signal?.aborted) {
    return Object.assign(new Error("web fetch aborted"), { code: "WEB_ABORTED", cause: error });
  }
  const detail = formatNetworkCause(error);
  return Object.assign(new Error(`web fetch failed: ${detail}`), { code: "WEB_PROVIDER_ERROR", cause: error });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const proxyAgents = new Map();

async function getSharedProxyAgent(proxyUrl) {
  const { ProxyAgent } = await import("undici");
  let agent = proxyAgents.get(proxyUrl);
  if (!agent) {
    agent = new ProxyAgent(proxyUrl);
    proxyAgents.set(proxyUrl, agent);
  }
  return agent;
}

export async function readCapped(response, maxBytes, signal) {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (Number.isFinite(length) && length > maxBytes) {
      await response.body?.cancel();
      throw Object.assign(new Error(`response exceeds the maximum of ${maxBytes} bytes`), { code: "WEB_FETCH_TOO_LARGE" });
    }
  }
  if (response.body == null) return { bytes: new Uint8Array(0), truncatedByBytes: false };
  const chunks = [];
  let total = 0;
  let truncatedByBytes = false;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - total;
      if (value.byteLength > remaining) {
        chunks.push(value.subarray(0, remaining));
        total += remaining;
        truncatedByBytes = true;
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } catch (error) {
    throw translateNetwork(error, signal);
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, truncatedByBytes };
}

export function decodeBody(bytes, contentType, maxChars) {
  const charset = /;\s*charset\s*=\s*"?([^";]+)"?/i.exec(contentType ?? "")?.[1]?.trim() || "utf-8";
  let decoded;
  try {
    decoded = new TextDecoder(charset).decode(bytes);
  } catch {
    decoded = new TextDecoder("utf-8").decode(bytes);
  }
  const truncatedByChars = decoded.length > maxChars;
  return {
    content: truncatedByChars ? decoded.slice(0, maxChars) : decoded,
    truncatedByChars,
  };
}

export function createFetchProvider(options = {}) {
  const proxyUrl = options.proxyUrl ?? readProxyUrl();
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 30_000;
  const maxRedirects = Number.isInteger(options.maxRedirects) ? options.maxRedirects : 5;
  const maxResponseBytes = Number.isFinite(options.maxResponseBytes) ? options.maxResponseBytes : 5_000_000;
  const maxBodyChars = Number.isFinite(options.maxBodyChars) ? options.maxBodyChars : 100_000;
  const retries = Number.isInteger(options.retries) && options.retries >= 0 ? options.retries : 2;
  const retryDelayMs = Number.isFinite(options.retryDelayMs) && options.retryDelayMs >= 0 ? options.retryDelayMs : 400;
  const userAgent = options.userAgent || DEFAULT_USER_AGENT;
  const requestFn = options.request || defaultRequest;

  return {
    id: PROVIDER_ID,
    available() {
      return Boolean(proxyUrl);
    },
    async fetch(request, signal) {
      if (signal?.aborted) {
        throw Object.assign(new Error("web fetch aborted"), { code: "WEB_ABORTED" });
      }
      const deadline = AbortSignal.any([
        signal ?? new AbortController().signal,
        AbortSignal.timeout(timeoutMs),
      ]);
      let current = parseFetchUrl(request?.url);
      let redirects = 0;
      let networkAttempt = 0;
      for (;;) {
        let handled;
        try {
          handled = await requestFn(current, {
            proxyUrl,
            userAgent,
            signal: deadline,
          });
          networkAttempt = 0;
        } catch (error) {
          if (error && typeof error === "object" && "code" in error && error.code) throw error;
          if (networkAttempt < retries && !deadline.aborted) {
            networkAttempt += 1;
            await sleep(retryDelayMs * networkAttempt);
            continue;
          }
          throw translateNetwork(error, deadline);
        }
        const response = handled.response;
        try {
          if (isRedirectStatus(response.status)) {
            if (redirects >= maxRedirects) {
              await response.body?.cancel();
              throw Object.assign(new Error(`exceeded the maximum of ${maxRedirects} redirects`), { code: "WEB_REDIRECT_BLOCKED" });
            }
            const location = response.headers.get("location");
            if (!location) {
              await response.body?.cancel();
              throw Object.assign(new Error(`redirect response (HTTP ${response.status}) without a Location header`), { code: "WEB_PROVIDER_ERROR" });
            }
            let next;
            try {
              next = parseFetchUrl(new URL(location, current).toString());
            } catch (error) {
              await response.body?.cancel();
              throw error;
            }
            if (!shouldFollowRedirect(current, next)) {
              await response.body?.cancel();
              throw Object.assign(
                new Error(`cross-origin redirect to ${next.origin} is not followed automatically; retry against that URL directly`),
                { code: "WEB_REDIRECT_BLOCKED" },
              );
            }
            await response.body?.cancel();
            current = next;
            redirects += 1;
            continue;
          }
          const kind = classifyContentType(response.headers.get("content-type"));
          if (kind === undefined) {
            await response.body?.cancel();
            throw Object.assign(new Error(`unsupported content type "${response.headers.get("content-type") ?? "unknown"}"`), { code: "WEB_UNSUPPORTED_CONTENT_TYPE" });
          }
          const { bytes, truncatedByBytes } = await readCapped(response, maxResponseBytes, deadline);
          const decoded = decodeBody(bytes, response.headers.get("content-type"), maxBodyChars);
          return {
            url: current.toString(),
            statusCode: response.status,
            body: { kind, content: decoded.content },
            truncated: truncatedByBytes || decoded.truncatedByChars,
          };
        } finally {
          await handled.close?.();
        }
      }
    },
  };
}

async function defaultRequest(url, { proxyUrl, userAgent, signal }) {
  const { fetch } = await import("undici");
  const dispatcher = await getSharedProxyAgent(proxyUrl);
  const response = await fetch(url, {
    method: "GET",
    redirect: "manual",
    headers: {
      "user-agent": userAgent,
      accept: "text/html,application/xhtml+xml,text/*;q=0.9,application/json;q=0.8,*/*;q=0.1",
      "accept-language": "zh-TW,zh;q=0.9,en;q=0.8",
    },
    signal,
    dispatcher,
  });
  // Shared ProxyAgent — do not close per request.
  return { response, close: async () => {} };
}
