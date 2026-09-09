# dsh-wsl-fetch

> **套件：** [dsh-wsl-kit](https://github.com/173787247/dsh-wsl-kit)。推荐 `KIT_SET=daily`。

让官方 **`web_fetch`** 从 WSL 走 Windows HTTP 代理，而不是直连公网 IP。

[English → README.md](./README.md)

## 为什么

官方 `dsh-web-fetch-http` 在 WSL 解析 DNS 后，用自定义 undici `Agent` **直连**该 IP，从而绕过 `NODE_USE_ENV_PROXY`。DeepSeek API 可以通，Mattermost / 文档站的 `web_fetch` 却报 `TypeError: fetch failed`。

`dsh-wsl-net` 只给 bash/npm **子进程**注入代理，管不到进程内的 `web_fetch`。

本插件注册 `wsl-proxy`；存在 `HTTPS_PROXY` / `HTTP_PROXY` 时选中它，用 `ProxyAgent` 抓公网 HTTPS。内网和 localhost 仍然拒绝。

## 安装

```sh
dsh plugin --profile web add github:173787247/dsh-wsl-fetch
```

本地目录：

```sh
dsh plugin --profile web add /path/to/dsh-wsl-fetch
```

用套件里的 `restart-dsh-web.sh` 重启（带 `NODE_USE_ENV_PROXY=1` 和代理环境）。**新开会话**。

## 配置

```yaml
- id: dsh-wsl-fetch
  name: dsh-wsl-fetch
  config:
    timeoutMs: 30000
    maxRedirects: 5
```

没有 `HTTP(S)_PROXY` 时插件不可用，继续走官方 `http`。

## 测试

```sh
npm test
```

## 许可

MIT
