#!/usr/bin/env node
/**
 * Stress the same web_fetch path dsh uses (undici ProxyAgent / wsl-proxy).
 * Usage: HTTPS_PROXY=http://127.0.0.1:16006 node scripts/stress.mjs
 */
import { createFetchProvider, parseFetchUrl, readProxyUrl } from "../lib/fetch.js";

const URLS = [
  "https://docs.mattermost.com/",
  "https://docs.mattermost.com/guides/administration.html",
  "https://www.mattermost.com/",
  "https://example.com/",
  "https://www.deepseek.com/",
  "https://api.deepseek.com/",
  "https://github.com/mattermost/mattermost",
  "https://www.163.com/",
];

const ROUNDS = Number(process.env.STRESS_ROUNDS || 3);
const CONCURRENCY = Number(process.env.STRESS_CONCURRENCY || 4);
const TIMEOUT_MS = Number(process.env.STRESS_TIMEOUT_MS || 20_000);

function now() {
  return Date.now();
}

async function pool(items, limit, worker) {
  const out = [];
  let i = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return out;
}

async function main() {
  const proxyUrl = readProxyUrl();
  if (!proxyUrl) {
    console.error("FAIL: no HTTP(S)_PROXY — this is not the dsh path");
    process.exit(2);
  }
  console.log(`proxy=${proxyUrl.replace(/\/\/([^:@/]+):([^@/]+)@/, "//x:x@")} rounds=${ROUNDS} concurrency=${CONCURRENCY}`);

  const blocked = [];
  for (const bad of ["http://127.0.0.1/", "http://192.168.1.1/", "https://localhost/"]) {
    try {
      parseFetchUrl(bad);
      blocked.push({ url: bad, ok: false, note: "should have blocked" });
    } catch (e) {
      blocked.push({ url: bad, ok: e.code === "WEB_BLOCKED_URL", note: e.code });
    }
  }

  const provider = createFetchProvider({ proxyUrl, timeoutMs: TIMEOUT_MS });
  const jobs = [];
  for (let r = 1; r <= ROUNDS; r++) {
    for (const url of URLS) jobs.push({ round: r, url });
  }

  const t0 = now();
  const results = await pool(jobs, CONCURRENCY, async (job) => {
    const started = now();
    try {
      const res = await provider.fetch({ url: job.url });
      return {
        ...job,
        ok: res.statusCode >= 200 && res.statusCode < 500,
        status: res.statusCode,
        kind: res.body?.kind,
        chars: res.body?.content?.length ?? 0,
        ms: now() - started,
      };
    } catch (e) {
      return {
        ...job,
        ok: false,
        status: 0,
        error: `${e.code || "ERR"} ${e.message}`.slice(0, 160),
        ms: now() - started,
      };
    }
  });
  const elapsed = now() - t0;

  const ok = results.filter((r) => r.ok);
  const fail = results.filter((r) => !r.ok);
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  const pct = (p) => ms[Math.min(ms.length - 1, Math.floor((ms.length - 1) * p))];

  console.log("=== fetches ===");
  for (const r of results) {
    const mark = r.ok ? "OK " : "FAIL";
    console.log(`${mark} r${r.round} ${String(r.status).padStart(3)} ${String(r.ms).padStart(5)}ms ${r.url} ${r.error || `${r.kind} ${r.chars}c`}`);
  }
  console.log("=== ssrf ===");
  for (const b of blocked) {
    console.log(`${b.ok ? "OK " : "FAIL"} block ${b.url} ${b.note}`);
  }
  console.log("=== summary ===");
  console.log(`total=${results.length} ok=${ok.length} fail=${fail.length} wall=${elapsed}ms`);
  if (ms.length) console.log(`latency_ms min=${ms[0]} p50=${pct(0.5)} p90=${pct(0.9)} max=${ms[ms.length - 1]}`);
  const ssrfOk = blocked.every((b) => b.ok);
  if (fail.length || !ssrfOk) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
