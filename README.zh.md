# dsh-wsl-fetch

> **套件：** [dsh-wsl-kit](https://github.com/173787247/dsh-wsl-kit)。`KIT_SET=daily` 或 `llm` 都会安装本插件。

**版本 / 兼容一行：** 见下方 **兼容性**（与 [dsh-wsl-kit](https://github.com/173787247/dsh-wsl-kit#compatibility-2026-09) 同步）。

让官方 **`web_fetch`** 从 WSL 走 Windows HTTP 代理，而不是直连公网 IP。

[English → README.md](./README.md)

## 兼容性

| 项 | 值 |
|----|----|
| **插件** | `dsh-wsl-fetch` **0.1.1** |
| **最低 dsh** | ≥ **0.1.2**（Windows 中继 `:3081` 一次性 `?token=`） |
| **最新验证** | 以 [dsh-wsl-kit 兼容性](https://github.com/173787247/dsh-wsl-kit#compatibility-2026-09) 为准（当前 **`0.1.5-rc.1`**）— 套件唯一真源 |
| **套件档位** | `daily`（亦含于 `github` / `full`；fetch+net 亦在 `llm`） |
| **云端 Flash** | settings / `llm-deepseek` 使用 **`deepseek-flash`**（V4.1 Flash）；本插件不配置模型 id |
| **Agent Teams** | 上游实验包；本插件不依赖 |

套件版本地板：[`check-plugin-versions.sh`](https://github.com/173787247/dsh-wsl-kit/blob/master/scripts/check-plugin-versions.sh)。故障树：[TROUBLESHOOTING.zh.md](https://github.com/173787247/dsh-wsl-kit/blob/master/docs/TROUBLESHOOTING.zh.md)。

**范围：** 进程内官方 `web_fetch` 走 undici `ProxyAgent`。需要 `HTTP(S)_PROXY`。经 Clash 遇到 Cloudflare 403/1010 需对该域名 **DIRECT**——不在本插件能力内。

## 为什么

官方 `dsh-web-fetch-http` 在 WSL 解析 DNS 后，用自定义 undici `Agent` **直连**该 IP，从而绕过 `NODE_USE_ENV_PROXY`。DeepSeek API 可以通，Mattermost / 文档站的 `web_fetch` 却报 `TypeError: fetch failed`。

`dsh-wsl-net` 只给 bash/npm **子进程**注入代理，管不到进程内的 `web_fetch`。

本插件注册 `wsl-proxy`；存在 `HTTPS_PROXY` / `HTTP_PROXY` 时选中它，用 `ProxyAgent` 抓公网 HTTPS。内网和 localhost 仍然拒绝。

## 安装

```sh
dsh plugin --profile web add github:173787247/dsh-wsl-fetch
```

或经套件：`KIT_SET=daily bash install.sh`（已含本插件）。

本地目录：

```sh
dsh plugin --profile web add /path/to/dsh-wsl-fetch
```

用套件 [`restart-dsh-web.sh`](https://github.com/173787247/dsh-wsl-kit/blob/master/scripts/restart-dsh-web.sh) 重启（带 `NODE_USE_ENV_PROXY=1` 和代理环境）。**新开会话**。

awesome 已收录：[条目](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/data/plugins/173787247__dsh-wsl-fetch.yml)（[#4736](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/4736) 已合）。

## 配置

```yaml
- id: dsh-wsl-fetch
  name: dsh-wsl-fetch
  config:
    timeoutMs: 30000
    maxRedirects: 5
    retries: 2
    retryDelayMs: 400
```

| 键 | 默认 | 含义 |
|----|------|------|
| `timeoutMs` | `30000` | 单次抓取超时 |
| `maxRedirects` | `5` | 同站重定向（允许 `www` ↔ 裸域） |
| `retries` | `2` | 代理/网络瞬时失败后的额外重试 |
| `retryDelayMs` | `400` | 重试基础间隔（× 次数） |
| `maxResponseBytes` | `5000000` | 响应体字节上限 |
| `maxBodyChars` | `100000` | 解码后字符上限 |
| `userAgent` | 产品 UA | 请求 User-Agent |

没有 `HTTP(S)_PROXY` 时插件保持注册但**不可用**，继续走官方 `http`。

## 成功 / 失败怎么判断

- 日志出现 `[dsh-wsl-fetch] web_fetch via proxy (...:端口) provider=wsl-proxy` → 后端已启用。
- UI 变红但有上述日志 → **单个 URL** 的代理/TLS/站点问题，换源再抓；不是「没装插件」。
- 经 Clash 遇到 Cloudflare **403 / 1010** → 站点 WAF；对该域名加 Clash **DIRECT**。本插件改不了 WAF。

## 测试

```sh
npm test
# 走真实代理（与 dsh web_fetch 同路径）
bash scripts/stress.sh
```

## 变更记录

见 [CHANGELOG.md](./CHANGELOG.md)。

## 许可

MIT
