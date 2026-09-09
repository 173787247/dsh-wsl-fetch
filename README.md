# dsh-wsl-fetch

> **Kit:** [dsh-wsl-kit](https://github.com/173787247/dsh-wsl-kit). Use `KIT_SET=daily`.

DeepSeek Harness plugin: make official **`web_fetch`** use the Windows HTTP proxy from WSL.

[中文说明 ↓](#中文)

## Why

Official `dsh-web-fetch-http` resolves DNS in WSL, then connects **directly** to that public IP with a custom undici `Agent`. That bypasses `NODE_USE_ENV_PROXY`. DeepSeek API can work (global `fetch` + proxy) while Mattermost/docs `web_fetch` fails with `TypeError: fetch failed`.

`dsh-wsl-net` only injects proxy env into **child** bash/npm. It cannot fix in-process `web_fetch`.

This plugin registers fetch provider `wsl-proxy` and, when `HTTPS_PROXY` / `HTTP_PROXY` is set, selects it so `web_fetch` uses undici `ProxyAgent`.

Private/localhost URLs stay blocked.

## Install

```sh
dsh plugin --profile web add github:173787247/dsh-wsl-fetch
```

Or a local checkout:

```sh
dsh plugin --profile web add /path/to/dsh-wsl-fetch
```

Restart `dsh web` with `NODE_USE_ENV_PROXY=1` and your proxy env (see dsh-wsl-kit `restart-dsh-web.sh`). Open a **new** session.

## Config

```yaml
- id: dsh-wsl-fetch
  name: dsh-wsl-fetch
  config:
    timeoutMs: 30000
    maxRedirects: 5
```

| Key | Default | Meaning |
|-----|---------|---------|
| `timeoutMs` | `30000` | Fetch deadline |
| `maxRedirects` | `5` | Same-origin redirects |
| `maxResponseBytes` | `5000000` | Body byte cap |
| `maxBodyChars` | `100000` | Decoded char cap |
| `userAgent` | product UA | Request User-Agent |

If `HTTP(S)_PROXY` is missing, the plugin stays registered but **unavailable**; official `http` remains selected.

## Test

```sh
npm test
# live proxy path (same as dsh web_fetch)
bash scripts/stress.sh
```

## License

MIT

---

## 中文

官方 `web_fetch` 在 WSL 里先 DNS、再**直连公网 IP**，不走 Windows 上的 Clash。于是 API 通、抓网页失败。

本插件在有 `HTTPS_PROXY` 时把 `web_fetch` 切到 `wsl-proxy`（undici `ProxyAgent`）。仍拒绝内网 / localhost。

安装后重启 `dsh web`，**新开会话**。
