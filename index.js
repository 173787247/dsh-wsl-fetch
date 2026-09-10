import { createFetchProvider, readProxyUrl, shouldPinFetchProvider, PROVIDER_ID } from "./lib/fetch.js";

export const name = "dsh-wsl-fetch";
export const inject = ["web", "systemPrompt"];

export function apply(ctx, config = {}) {
  const proxyUrl = readProxyUrl();
  const provider = createFetchProvider({
    proxyUrl,
    timeoutMs: positive(config.timeoutMs, 30_000),
    maxRedirects: integer(config.maxRedirects, 5),
    maxResponseBytes: positive(config.maxResponseBytes, 5_000_000),
    maxBodyChars: positive(config.maxBodyChars, 100_000),
    retries: integer(config.retries, 2),
    retryDelayMs: positive(config.retryDelayMs, 400),
    userAgent: typeof config.userAgent === "string" && config.userAgent.trim() ? config.userAgent.trim() : undefined,
  });

  ctx.web.registerFetchProvider(provider);

  if (provider.available() && shouldPinFetchProvider(ctx.web.fetchProviderId)) {
    ctx.web.fetchProviderId = PROVIDER_ID;
    console.log(`[dsh-wsl-fetch] web_fetch via proxy (${redactProxy(proxyUrl)}) provider=${PROVIDER_ID}`);
  } else if (!provider.available()) {
    console.log("[dsh-wsl-fetch] no HTTP(S)_PROXY; official http fetch stays selected");
  } else {
    console.log(`[dsh-wsl-fetch] registered ${PROVIDER_ID} but left fetchProvider=${ctx.web.fetchProviderId}`);
  }

  ctx.systemPrompt.section({
    name: "runtime:wsl-web-fetch",
    order: 117,
    text: provider.available()
      ? "web_fetch goes through the Windows HTTP proxy (Clash/V2Ray) instead of connecting from WSL to a pinned public IP. Keep using web_fetch for public https pages. Do not fetch localhost or private addresses. If a fetch fails or reports a cross-origin redirect, retry the Location URL directly or switch to another public source; do not loop the same failing URL."
      : "No HTTP(S)_PROXY is set, so web_fetch uses the official direct provider. On Windows+WSL that often fails; set HTTPS_PROXY and restart dsh web, or install dsh-wsl-net and run net_doctor.",
  });
}

function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function integer(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

function redactProxy(url) {
  try {
    const u = new URL(url);
    u.username = u.username ? "x" : "";
    u.password = u.password ? "x" : "";
    return u.origin;
  } catch {
    return "set";
  }
}
