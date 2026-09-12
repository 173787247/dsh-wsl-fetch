import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adviceForFetchFailure,
  classifyContentType,
  createFetchProvider,
  formatNetworkCause,
  isBlockedHostname,
  isPrivateIp,
  isWwwHostAlias,
  parseFetchUrl,
  readProxyUrl,
  shouldFollowRedirect,
  shouldPinFetchProvider,
} from "../lib/fetch.js";

describe("readProxyUrl", () => {
  it("prefers HTTPS_PROXY", () => {
    assert.equal(readProxyUrl({ HTTPS_PROXY: "http://127.0.0.1:16006", HTTP_PROXY: "http://127.0.0.1:9" }), "http://127.0.0.1:16006");
  });
});

describe("isPrivateIp / isBlockedHostname", () => {
  it("blocks RFC1918, loopback, and link-local", () => {
    assert.equal(isPrivateIp("10.0.0.1"), true);
    assert.equal(isPrivateIp("192.168.1.1"), true);
    assert.equal(isPrivateIp("127.0.0.1"), true);
    assert.equal(isPrivateIp("169.254.1.1"), true);
    assert.equal(isPrivateIp("172.16.0.1"), true);
    assert.equal(isPrivateIp("8.8.8.8"), false);
  });

  it("blocks localhost and .local names", () => {
    assert.equal(isBlockedHostname("localhost"), true);
    assert.equal(isBlockedHostname("foo.local"), true);
    assert.equal(isBlockedHostname("docs.mattermost.com"), false);
  });
});

describe("parseFetchUrl", () => {
  it("accepts public https", () => {
    const url = parseFetchUrl("https://docs.mattermost.com/overview/index.html");
    assert.equal(url.hostname, "docs.mattermost.com");
  });

  it("rejects credentials and private hosts", () => {
    assert.throws(() => parseFetchUrl("https://user:pass@example.com/"), { code: "WEB_BLOCKED_URL" });
    assert.throws(() => parseFetchUrl("http://127.0.0.1/"), { code: "WEB_BLOCKED_URL" });
    assert.throws(() => parseFetchUrl("ftp://example.com/"), { code: "WEB_INVALID_URL" });
  });
});

describe("classifyContentType", () => {
  it("maps html and json", () => {
    assert.equal(classifyContentType("text/html; charset=utf-8"), "html");
    assert.equal(classifyContentType("application/json"), "text");
    assert.equal(classifyContentType("image/png"), undefined);
  });
});

describe("createFetchProvider", () => {
  it("is unavailable without a proxy", () => {
    const p = createFetchProvider({ proxyUrl: "" });
    assert.equal(p.available(), false);
  });

  it("fetches through the injected request helper", async () => {
    const encoder = new TextEncoder();
    const body = encoder.encode("<html>ok</html>");
    const p = createFetchProvider({
      proxyUrl: "http://127.0.0.1:16006",
      async request() {
        return {
          response: {
            status: 200,
            headers: new Headers({ "content-type": "text/html" }),
            body: new ReadableStream({
              start(c) {
                c.enqueue(body);
                c.close();
              },
            }),
          },
          close: async () => {},
        };
      },
    });
    const result = await p.fetch({ url: "https://example.com/" });
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.kind, "html");
    assert.match(result.body.content, /ok/);
  });

  it("retries transient network failures", async () => {
    let calls = 0;
    const encoder = new TextEncoder();
    const body = encoder.encode("ok");
    const p = createFetchProvider({
      proxyUrl: "http://127.0.0.1:16006",
      retries: 2,
      retryDelayMs: 1,
      async request() {
        calls += 1;
        if (calls < 3) throw new Error("fetch failed");
        return {
          response: {
            status: 200,
            headers: new Headers({ "content-type": "text/plain" }),
            body: new ReadableStream({
              start(c) {
                c.enqueue(body);
                c.close();
              },
            }),
          },
          close: async () => {},
        };
      },
    });
    const result = await p.fetch({ url: "https://example.com/" });
    assert.equal(calls, 3);
    assert.equal(result.body.content, "ok");
  });

  it("follows www to apex redirects", async () => {
    let step = 0;
    const encoder = new TextEncoder();
    const body = encoder.encode("<html>apex</html>");
    const p = createFetchProvider({
      proxyUrl: "http://127.0.0.1:16006",
      async request(url) {
        step += 1;
        if (step === 1) {
          assert.equal(url.hostname, "www.example.com");
          return {
            response: {
              status: 301,
              headers: new Headers({ location: "https://example.com/" }),
              body: null,
            },
            close: async () => {},
          };
        }
        assert.equal(url.hostname, "example.com");
        return {
          response: {
            status: 200,
            headers: new Headers({ "content-type": "text/html" }),
            body: new ReadableStream({
              start(c) {
                c.enqueue(body);
                c.close();
              },
            }),
          },
          close: async () => {},
        };
      },
    });
    const result = await p.fetch({ url: "https://www.example.com/" });
    assert.equal(result.url, "https://example.com/");
    assert.match(result.body.content, /apex/);
  });
});

describe("redirect helpers", () => {
  it("treats www as same-site alias", () => {
    const a = new URL("https://www.example.com/");
    const b = new URL("https://example.com/");
    assert.equal(isWwwHostAlias(a, b), true);
    assert.equal(shouldFollowRedirect(a, b), true);
    assert.equal(shouldFollowRedirect(a, new URL("https://evil.com/")), false);
  });

  it("formats opaque fetch failed causes", () => {
    assert.match(formatNetworkCause(new Error("fetch failed")), /proxy\/TLS\/timeout/);
  });

  it("adviceForFetchFailure covers WAF and missing proxy", () => {
    const waf = adviceForFetchFailure("403 Forbidden error code: 1010");
    assert.ok(waf.some((t) => /DIRECT|WAF|403/i.test(t)));
  });
});

describe("shouldPinFetchProvider", () => {
  it("pins when unset or official http", () => {
    assert.equal(shouldPinFetchProvider(undefined), true);
    assert.equal(shouldPinFetchProvider("http"), true);
    assert.equal(shouldPinFetchProvider("exa"), false);
  });
});
