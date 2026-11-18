import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { routeJobs, createRouteCache } from "../services/route-cache.js";
import { createApp } from "../app.js";
import { createStore } from "../services/store.js";
const p = (n, mode = "DRIVE") => ({ lat: 35 + n / 100, lng: 138 + n / 100, mode });

test("route jobs preserve order, split travel modes and missing stops, and cap at ten intermediates", () => {
  const jobs = routeJobs({ days: [{ date: "one", places: [p(0), p(1), p(2, "WALK"), p(3, "OTHER"), p(4), { ...p(5), lat: null }, p(6), p(7)] }] });
  assert.deepEqual(jobs.map(j => [j.mode, j.stops.length]), [["DRIVE", 3], ["WALK", 2], ["DRIVE", 2]]);
  assert.deepEqual(jobs[0].stops, [p(0), p(1), p(2)].map(({ lat, lng }) => ({ lat, lng })));
  const split = routeJobs({ days: [{ date: "one", places: Array.from({ length: 25 }, (_, i) => p(i)) }] });
  assert.deepEqual(split.map(j => j.stops.length), [12, 12, 3]);
  assert.deepEqual(split[0].stops.at(-1), split[1].stops[0]);
  assert.equal(routeJobs({ days: [{ date: "two", places: [p(0), p(1), p(2)] }] })[0].key, jobs[0].key);
});

test("only geometry is cached, expires at 30 days, and changed jobs/owners cannot reuse it", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "travel-route-cache-"));
  let now = 1000;
  try {
    const cache = createRouteCache(dir, { now: () => now });
    await cache.put("owner", "trip", ["job"], "job", [p(0), p(1)]);
    const stored = await cache.get("owner", "trip", ["job"]);
    assert.deepEqual(Object.keys(stored.job).sort(), ["expiresAt", "path"]);
    assert.deepEqual(Object.keys(stored.job.path[0]).sort(), ["lat", "lng"]);
    assert.deepEqual(await cache.get("other", "trip", ["job"]), {});
    await assert.rejects(cache.put("owner", "trip", ["job"], "stale", [p(0), p(1)]), { status: 409 });
    await assert.rejects(cache.put("owner", "trip", ["job"], "job", [{ lat: 999, lng: 138 }, p(1)]), { status: 400 });
    now += 30 * 86400000;
    await cache.pruneExpired();
    assert.deepEqual(await cache.get("owner", "trip", ["job"]), {});
    assert.deepEqual(await readdir(path.join(dir, "route-cache")), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("route endpoints enforce ownership, reject stale jobs and preserve cached geometry across reads", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "travel-route-api-"));
  const server = createApp({ dataDir: dir, basePath: "/travel" }).listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/travel/api`;
  const call = (url, cookie, method = "GET", body) => fetch(base + url, { method, headers: { "X-Travel-Client": "1", "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    const ownerResponse = await call("/auth/register", "", "POST", { username: "route_owner", password: "test-password-2026" });
    const cookie = ownerResponse.headers.get("set-cookie").split(";")[0];
    const { user } = await ownerResponse.json();
    const otherResponse = await call("/auth/register", "", "POST", { username: "route_other", password: "test-password-2026" });
    const otherCookie = otherResponse.headers.get("set-cookie").split(";")[0];
    const store = createStore(dir);
    await store.update(db => db.trips.push({ id: "trip", ownerId: user.id, days: [{ date: "one", places: [p(0), p(1)] }] }));
    assert.equal((await call("/trips/trip/routes", "")).status, 401);
    assert.equal((await call("/trips/trip/routes", otherCookie)).status, 404);
    const { jobs } = await (await call("/trips/trip/routes", cookie)).json();
    assert.equal((await call("/trips/trip/routes", cookie, "POST", { key: jobs[0].key, path: [p(0), p(1)] })).status, 200);
    const response = await (await call("/trips/trip/routes", cookie)).json();
    assert.equal(response.cached[jobs[0].key].path.length, 2);
    await store.update(db => { db.trips[0].days[0].places[1] = p(2); });
    assert.equal((await call("/trips/trip/routes", cookie, "POST", { key: jobs[0].key, path: [p(0), p(1)] })).status, 409);
    assert.deepEqual((await (await call("/trips/trip/routes", cookie)).json()).cached, {});
    assert.equal((await call("/trips/trip", cookie, "DELETE")).status, 204);
  } finally { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
});
