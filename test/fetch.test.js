import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyContentType,
  createFetchProvider,
  isBlockedHostname,
  isPrivateIp,
  parseFetchUrl,
  readProxyUrl,
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
});

describe("shouldPinFetchProvider", () => {
  it("pins when unset or official http", () => {
    assert.equal(shouldPinFetchProvider(undefined), true);
    assert.equal(shouldPinFetchProvider("http"), true);
    assert.equal(shouldPinFetchProvider("exa"), false);
  });
});
