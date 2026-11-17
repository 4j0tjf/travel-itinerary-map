import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchGoogleSheet } from "../services/google-sheets.js";

const id = "1XWJLkAwch5GXAt_7zOFDcg8Wm8Xv29_8PWuuW15qmAE";
const link = `https://docs.google.com/spreadsheets/d/${id}/edit?usp=sharing#gid=7`;
const file = () => new Response(Buffer.from([0x50, 0x4b, 3, 4]), {
  headers: { "content-disposition": "attachment; filename*=UTF-8''%EC%97%AC%ED%96%89.xlsx" },
});

test("Google links become a credential-free Excel export request", async () => {
  const calls = [];
  const result = await fetchGoogleSheet(link, { fetchImpl: async (url, options) => {
    calls.push({ url, options }); return file();
  } });
  assert.equal(calls[0].url, `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`);
  assert.equal(calls[0].options.redirect, "manual");
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(result.filename, "여행.xlsx");
  assert.deepEqual([...result.buffer], [0x50, 0x4b, 3, 4]);
  const withKey = `https://docs.google.com/spreadsheets/u/0/d/${id}/edit?resourcekey=0-safe_key`;
  await fetchGoogleSheet(withKey, { fetchImpl: async (url) => {
    assert.equal(new URL(url).searchParams.get("resourcekey"), "0-safe_key"); return file();
  } });
});

test("untrusted inputs are rejected before any network access", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return file(); };
  for (const input of [null, {}, "", "http://127.0.0.1", link.replace("https:", "http:"),
    link.replace("docs.google.com", "docs.google.com.evil.test"),
    link.replace("docs.google.com", "user:pass@docs.google.com"),
    link.replace("docs.google.com", "docs.google.com:7000"),
    `https://docs.google.com/spreadsheets/d/e/${id}/pubhtml`,
    `https://docs.google.com/document/d/${id}/edit`,
    link + "x".repeat(2100)]) {
    await assert.rejects(fetchGoogleSheet(input, { fetchImpl }), (error) => error.status === 400);
  }
  assert.equal(calls, 0);
});

test("export redirects stay on Google Sheets download hosts", async () => {
  let calls = 0;
  const result = await fetchGoogleSheet(link, { fetchImpl: async (url) => {
    calls++;
    if (calls === 1) return new Response(null, { status: 307, headers: { location: "https://doc-0g-4g-sheets.googleusercontent.com/export/example" } });
    assert.match(url, /^https:\/\/doc-0g-4g-sheets\.googleusercontent\.com\//);
    return file();
  } });
  assert.equal(result.buffer.length, 4);
  for (const destination of ["http://127.0.0.1:7000/api/health", "https://evil.test/", "https://accounts.google.com/ServiceLogin", "https://doc-sheets.googleusercontent.com.evil.test/"]) {
    calls = 0;
    await assert.rejects(fetchGoogleSheet(link, { fetchImpl: async () => {
      calls++; return new Response(null, { status: 302, headers: { location: destination } });
    } }), (error) => error.status === 400);
    assert.equal(calls, 1);
  }
  calls = 0;
  await assert.rejects(fetchGoogleSheet(link, { fetchImpl: async () => {
    calls++; return new Response(null, { status: 302, headers: { location: link } });
  } }), (error) => error.status === 400);
  assert.equal(calls, 5);
});

test("sharing failures, response limits and timeouts return useful errors", async () => {
  for (const response of [new Response("denied", { status: 403 }),
    new Response("missing", { status: 404 }),
    new Response("<html>Sign in</html>", { headers: { "content-type": "text/html" } }),
    new Response("not an Excel file")]) {
    await assert.rejects(fetchGoogleSheet(link, { fetchImpl: async () => response }), /공유/);
  }
  await assert.rejects(fetchGoogleSheet(link, { fetchImpl: async () => new Response("data", { headers: { "content-length": "6000000" } }) }), /5MB/);
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(8)); controller.enqueue(new Uint8Array(8)); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(fetchGoogleSheet(link, { maxBytes: 10, fetchImpl: async () => new Response(body) }), /5MB/);
  assert.equal(cancelled, true);
  await assert.rejects(fetchGoogleSheet(link, { fetchImpl: async () => new Response(null, { status: 429 }) }), (error) => error.status === 429);
  await assert.rejects(fetchGoogleSheet(link, { fetchImpl: async () => { throw new DOMException("Timed out", "TimeoutError"); } }), (error) => error.status === 408);
});
