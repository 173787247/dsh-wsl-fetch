# Changelog

## 0.1.0

- Register `ctx.web` fetch provider `wsl-proxy` using undici `ProxyAgent`.
- Pin `fetchProviderId` when `HTTP(S)_PROXY` is set and the current id is unset or `http`.
- Block localhost / RFC1918 / link-local / credentialed URLs.
