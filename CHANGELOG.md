## 0.1.2

- adviceForFetchFailure tips on WAF/proxy/DNS in web_fetch errors.

# Changelog

## 0.1.1

- Retry transient proxy/network failures (default `retries: 2`).
- Reuse a shared undici `ProxyAgent` instead of open/close per request.
- Follow `www.` ↔ apex host redirects on the same site.
- Surface undici/TLS cause codes in `web fetch failed: …` messages.
- Prompt: on redirect/failure, retry the Location URL or another source.
- Docs: EN/ZH README aligned for dsh `0.1.5-rc.1`, kit Daily/LLM install, and Cloudflare 1010 / red-UI notes.

## 0.1.0

- Register `ctx.web` fetch provider `wsl-proxy` using undici `ProxyAgent`.
- Pin `fetchProviderId` when `HTTP(S)_PROXY` is set and the current id is unset or `http`.
- Block localhost / RFC1918 / link-local / credentialed URLs.
