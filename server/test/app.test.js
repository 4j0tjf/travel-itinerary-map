import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { createApp } from "../app.js";
import { fetchGoogleSheet } from "../services/google-sheets.js";
const password = "test-password-2026";
const clientHeader = { "X-Travel-Client": "1" };
async function fixture(fn, options = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "travel-test-"));
  let server;
  const start = async () => {
    server = createApp({ dataDir, ...options }).listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    return `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => {
    if (server) {
      const instance = server;
      server = null;
      await new Promise((r, j) => instance.close((e) => (e ? j(e) : r())));
    }
  };
  try {
    await fn({ dataDir, start, stop });
  } finally {
    await stop();
    await rm(dataDir, { recursive: true, force: true });
  }
}
async function register(base, username = "traveler") {
  const response = await fetch(base + "/api/auth/register", {
    method: "POST",
    headers: { ...clientHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(response.status, 201, await response.clone().text());
  return {
    cookie: response.headers.get("set-cookie").split(";")[0],
    user: (await response.json()).user,
    header: response.headers.get("set-cookie"),
  };
}
async function workbook(
  rows,
  headers = [
    "날짜",
    "시간",
    "장소명",
    "주소",
    "위도",
    "경도",
    "메모",
    "이동수단",
    "여행지역",
    "여행명",
  ],
) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("여행 일정");
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  return book.xlsx.writeBuffer();
}
async function upload(
  base,
  cookie,
  bytes,
  filename = "shizuoka.xlsx",
  title = "",
) {
  const form = new FormData();
  form.append("file", new Blob([bytes]), filename);
  if (title) form.append("title", title);
  return fetch(base + "/api/trips", {
    method: "POST",
    headers: { ...clientHeader, Cookie: cookie },
    body: form,
  });
}
const rows = [
  [
    "2026-12-02",
    "10:00",
    "미호노마쓰바라",
    "Shizuoka",
    35.014,
    138.523,
    "바다 산책",
    "WALK",
    "시즈오카",
    "시즈오카",
  ],
  [
    "2026-12-01",
    "15:00",
    "스루가만",
    "Shizuoka",
    34.99,
    138.4,
    "",
    "DRIVE",
    "시즈오카",
    "시즈오카",
  ],
  [
    "2026-12-01",
    "09:00",
    "시즈오카역",
    "Shizuoka",
    34.971,
    138.389,
    "시작",
    "DRIVE",
    "시즈오카",
    "시즈오카",
  ],
];

test("a public subpath supports sessions, spreadsheet import and downloads", async () =>
  fixture(async ({ start }) => {
    const origin = await start();
    const base = origin + "/travel";
    assert.equal((await fetch(origin + "/api/health")).status, 200);
    assert.equal((await fetch(base + "/api/health")).status, 200);
    assert.equal((await fetch(base + "/api/trips")).status, 401);
    const auth = await register(base);
    assert.match(auth.header, /Path=\/travel(?:;|$)/);
    const identity = await fetch(base + "/api/auth/me", { headers: { Cookie: auth.cookie } });
    assert.equal((await identity.json()).user.id, auth.user.id);
    const imported = await upload(base, auth.cookie, await workbook(rows));
    assert.equal(imported.status, 201, await imported.clone().text());
    const trips = await fetch(base + "/api/trips", { headers: { Cookie: auth.cookie } });
    assert.equal((await trips.json()).trips.length, 1);
    const sample = await fetch(base + "/api/sample");
    assert.equal(sample.status, 200);
    assert.match(sample.headers.get("content-disposition"), /itinerary\.xlsx/);
    const loggedOut = await fetch(base + "/api/auth/logout", {
      method: "POST", headers: { ...clientHeader, Cookie: auth.cookie },
    });
    assert.equal(loggedOut.status, 204);
    assert.match(loggedOut.headers.get("set-cookie"), /Path=\/travel(?:;|$)/);
    assert.equal((await fetch(base + "/api/trips", { headers: { Cookie: auth.cookie } })).status, 401);
  }, { basePath: "/travel" }),
);

test("new accounts have zero trips, public endpoints expose no private itinerary", async () =>
  fixture(async ({ start }) => {
    const base = await start();
    assert.equal((await fetch(base + "/api/trips")).status, 401);
    assert.equal((await fetch(base + "/api/itinerary")).status, 404);
    assert.deepEqual(await (await fetch(base + "/api/auth/me")).json(), {
      user: null,
    });
    const auth = await register(base);
    assert.deepEqual(
      await (
        await fetch(base + "/api/trips", { headers: { Cookie: auth.cookie } })
      ).json(),
      { trips: [] },
    );
    assert.match(auth.header, /HttpOnly/);
    assert.match(auth.header, /SameSite=Lax/);
    assert.match(auth.header, /Max-Age=2592000/);
    const sample = await fetch(base + "/api/sample");
    assert.equal(sample.status, 200);
    assert.equal(
      String.fromCharCode(
        ...new Uint8Array(await sample.arrayBuffer()).slice(0, 2),
      ),
      "PK",
    );
  }));

test("upload creates a date/time-sorted named trip and persists through HTTP server restart", async () =>
  fixture(async ({ start, stop, dataDir }) => {
    let base = await start();
    const { cookie } = await register(base);
    const response = await upload(
      base,
      cookie,
      await workbook(rows),
      "시즈오카.xlsx",
    );
    assert.equal(response.status, 201, await response.clone().text());
    const { trip } = await response.json();
    assert.equal(trip.title, "시즈오카");
    assert.equal(trip.region, "시즈오카");
    assert.deepEqual(
      trip.days.map((d) => d.date),
      ["2026-12-01", "2026-12-02"],
    );
    assert.deepEqual(
      trip.days[0].places.map((p) => p.time),
      ["09:00", "15:00"],
    );
    assert.equal(trip.ownerId, undefined);
    await stop();
    base = await start();
    assert.equal(
      (
        await (
          await fetch(base + "/api/auth/me", { headers: { Cookie: cookie } })
        ).json()
      ).user.username,
      "traveler",
    );
    const saved = await (
      await fetch(base + "/api/trips", { headers: { Cookie: cookie } })
    ).json();
    assert.equal(saved.trips.length, 1);
    assert.equal(saved.trips[0].id, trip.id);
    const disk = await readFile(path.join(dataDir, "database.json"), "utf8");
    assert.ok(!disk.includes(password));
    assert.ok(!disk.includes(cookie.split("=")[1]));
    const db = JSON.parse(disk);
    assert.ok(db.users[0].passwordHash && db.users[0].salt);
    assert.ok(db.sessions[0].hash);
  }));

test("users cannot view, rename or delete another user’s trip", async () =>
  fixture(async ({ start }) => {
    const base = await start();
    const alice = await register(base, "alice"),
      bob = await register(base, "bobby");
    const { trip } = await (
      await upload(base, alice.cookie, await workbook(rows))
    ).json();
    assert.deepEqual(
      await (
        await fetch(base + "/api/trips", { headers: { Cookie: bob.cookie } })
      ).json(),
      { trips: [] },
    );
    for (const method of ["GET", "PATCH", "DELETE"]) {
      const response = await fetch(base + "/api/trips/" + trip.id, {
        method,
        headers: {
          ...clientHeader,
          Cookie: bob.cookie,
          "Content-Type": "application/json",
        },
        ...(method === "PATCH"
          ? { body: JSON.stringify({ title: "takeover" }) }
          : {}),
      });
      assert.equal(response.status, 404);
    }
    const own = await fetch(base + "/api/trips/" + trip.id, {
      headers: { Cookie: alice.cookie },
    });
    assert.equal(own.status, 200);
  }));

test("rename and delete are persisted and return to zero trips", async () =>
  fixture(async ({ start, stop }) => {
    let base = await start();
    const { cookie } = await register(base);
    const { trip } = await (
      await upload(base, cookie, await workbook(rows))
    ).json();
    const renamed = await fetch(base + "/api/trips/" + trip.id, {
      method: "PATCH",
      headers: {
        ...clientHeader,
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "겨울 시즈오카" }),
    });
    assert.equal(renamed.status, 200);
    assert.equal((await renamed.json()).trip.title, "겨울 시즈오카");
    await stop();
    base = await start();
    assert.equal(
      (
        await (
          await fetch(base + "/api/trips/" + trip.id, {
            headers: { Cookie: cookie },
          })
        ).json()
      ).trip.title,
      "겨울 시즈오카",
    );
    assert.equal(
      (
        await fetch(base + "/api/trips/" + trip.id, {
          method: "DELETE",
          headers: { ...clientHeader, Cookie: cookie },
        })
      ).status,
      204,
    );
    await stop();
    base = await start();
    assert.deepEqual(
      await (
        await fetch(base + "/api/trips", { headers: { Cookie: cookie } })
      ).json(),
      { trips: [] },
    );
  }));

test("invalid credentials fail; logout and expired sessions cannot access trips", async () =>
  fixture(async ({ start, dataDir }) => {
    const base = await start();
    const { cookie } = await register(base);
    const login = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { ...clientHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "traveler",
        password: "wrong-password",
      }),
    });
    assert.equal(login.status, 401);
    const duplicate = await fetch(base + "/api/auth/register", {
      method: "POST",
      headers: { ...clientHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ username: "traveler", password }),
    });
    assert.equal(duplicate.status, 409);
    assert.equal(
      (
        await fetch(base + "/api/auth/logout", {
          method: "POST",
          headers: { ...clientHeader, Cookie: cookie },
        })
      ).status,
      204,
    );
    assert.equal(
      (await fetch(base + "/api/trips", { headers: { Cookie: cookie } }))
        .status,
      401,
    );
    const good = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { ...clientHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ username: "traveler", password }),
    });
    assert.equal(good.status, 200);
    const newCookie = good.headers.get("set-cookie").split(";")[0];
    assert.notEqual(cookie, newCookie);
    const file = path.join(dataDir, "database.json");
    const db = JSON.parse(await readFile(file, "utf8"));
    db.sessions.forEach((s) => (s.expiresAt = 0));
    await writeFile(file, JSON.stringify(db));
    assert.equal(
      (await fetch(base + "/api/trips", { headers: { Cookie: newCookie } }))
        .status,
      401,
    );
  }));

test("validation rejects bad Excel without saving partial trips; missing coordinates preserve the schedule", async () =>
  fixture(async ({ start }) => {
    const base = await start();
    const { cookie } = await register(base);
    let response = await upload(
      base,
      cookie,
      await workbook([["2026-02-30", "25:00", "", "", 999, 200]]),
    );
    assert.equal(response.status, 400);
    assert.ok((await response.json()).details.length >= 3);
    response = await upload(
      base,
      cookie,
      new TextEncoder().encode("not an xlsx"),
    );
    assert.equal(response.status, 400);
    response = await upload(base, cookie, await workbook(rows), "wrong.csv");
    assert.equal(response.status, 400);
    assert.deepEqual(
      await (
        await fetch(base + "/api/trips", { headers: { Cookie: cookie } })
      ).json(),
      { trips: [] },
    );
    response = await upload(
      base,
      cookie,
      await workbook([
        [
          "2026-12-01",
          "09:00",
          "주소만 있는 장소",
          "Shizuoka",
          "",
          "",
          "좌표 모름",
          "전철",
        ],
      ]),
    );
    assert.equal(response.status, 201);
    const { trip } = await response.json();
    assert.equal(trip.days[0].places[0].lat, null);
    assert.equal(trip.days[0].places[0].mode, "OTHER");
    assert.equal(trip.warnings.length, 2);
  }));

test("mutation protection and login throttling operate before state changes", async () =>
  fixture(
    async ({ start }) => {
      const base = await start();
      const payload = JSON.stringify({ username: "traveler", password });
      assert.equal(
        (
          await fetch(base + "/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
          })
        ).status,
        403,
      );
      for (let i = 0; i < 2; i++)
        assert.equal(
          (
            await fetch(base + "/api/auth/login", {
              method: "POST",
              headers: { ...clientHeader, "Content-Type": "application/json" },
              body: payload,
            })
          ).status,
          401,
        );
      assert.equal(
        (
          await fetch(base + "/api/auth/login", {
            method: "POST",
            headers: { ...clientHeader, "Content-Type": "application/json" },
            body: payload,
          })
        ).status,
        429,
      );
    },
    { authLimit: 2 },
  ));

test("HTTPS proxy cookies are secure and corrupt database files are preserved", async () =>
  fixture(async ({ start, dataDir }) => {
    const base = await start();
    const response = await fetch(base + "/api/auth/register", {
      method: "POST",
      headers: {
        ...clientHeader,
        "Content-Type": "application/json",
        "X-Forwarded-Proto": "https",
      },
      body: JSON.stringify({ username: "traveler", password }),
    });
    assert.equal(response.status, 201);
    assert.match(response.headers.get("set-cookie"), /; Secure/);
    const cookie = response.headers.get("set-cookie").split(";")[0];
    const file = path.join(dataDir, "database.json");
    await writeFile(file, "broken-json");
    const failed = await fetch(base + "/api/trips", {
      headers: { Cookie: cookie },
    });
    assert.equal(failed.status, 500);
    assert.equal(await readFile(file, "utf8"), "broken-json");
  }));

test("Google sheet import uses the workbook validator and saves only to the signed-in account", async () => {
  const bytes = await workbook(rows);
  let requests = 0;
  let deny = false;
  await fixture(async ({ start, stop }) => {
    let origin = await start();
    let base = origin + "/travel";
    const body = JSON.stringify({ url: "https://docs.google.com/spreadsheets/d/1XWJLkAwch5GXAt_7zOFDcg8Wm8Xv29_8PWuuW15qmAE/edit", title: "링크 여행" });
    const headers = { ...clientHeader, "Content-Type": "application/json" };
    const post = (cookie = "") => fetch(base + "/api/trips/from-google-sheet", { method: "POST", headers: { ...headers, Cookie: cookie }, body });
    assert.equal((await post()).status, 401);
    assert.equal(requests, 0);
    const auth = await register(base, "link_traveler");
    const other = await register(base, "other_traveler");
    const forbidden = await fetch(base + "/api/trips/from-google-sheet", { method: "POST", headers: { Cookie: auth.cookie, "Content-Type": "application/json" }, body });
    assert.equal(forbidden.status, 403);
    assert.equal(requests, 0);
    const imported = await post(auth.cookie);
    assert.equal(imported.status, 201, await imported.clone().text());
    const { trip } = await imported.json();
    assert.equal(trip.title, "링크 여행");
    assert.equal(trip.days[0].places[0].name, "시즈오카역");
    assert.equal(requests, 1);
    assert.deepEqual(await (await fetch(base + "/api/trips", { headers: { Cookie: other.cookie } })).json(), { trips: [] });
    deny = true;
    const rejected = await post(auth.cookie);
    assert.equal(rejected.status, 400);
    assert.match((await rejected.json()).error, /공유/);
    await stop(); origin = await start(); base = origin + "/travel";
    const restored = await (await fetch(base + "/api/trips", { headers: { Cookie: auth.cookie } })).json();
    assert.equal(restored.trips.length, 1);
    assert.equal(restored.trips[0].id, trip.id);
  }, {
    basePath: "/travel",
    googleSheetFetcher: (url) => fetchGoogleSheet(url, { fetchImpl: async () => {
      requests++;
      return deny ? new Response("denied", { status: 403 }) : new Response(bytes, { headers: { "content-disposition": 'attachment; filename="public-trip.xlsx"' } });
    } }),
  });
});

test("Google import throttling is per account and failed workbooks are never stored", async () => {
  let requests = 0;
  await fixture(async ({ start }) => {
    const base = await start();
    const one = await register(base, "one_traveler");
    const two = await register(base, "two_traveler");
    const post = (cookie) => fetch(base + "/api/trips/from-google-sheet", {
      method: "POST", headers: { ...clientHeader, Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://docs.google.com/spreadsheets/d/1XWJLkAwch5GXAt_7zOFDcg8Wm8Xv29_8PWuuW15qmAE/edit" }),
    });
    assert.equal((await post(one.cookie)).status, 400);
    assert.equal((await post(one.cookie)).status, 429);
    assert.equal((await post(two.cookie)).status, 400);
    assert.equal(requests, 2);
    assert.deepEqual(await (await fetch(base + "/api/trips", { headers: { Cookie: one.cookie } })).json(), { trips: [] });
  }, { googleImportLimit: 1, googleSheetFetcher: async () => { requests++; return { buffer: Buffer.from("invalid"), filename: "bad.xlsx" }; } });
});

test("concurrent imports do not lose trips", async () =>
  fixture(async ({ start }) => {
    const base = await start();
    const { cookie } = await register(base);
    const bytes = await workbook(rows);
    const imports = await Promise.all([
      upload(base, cookie, bytes, "one.xlsx", "첫 여행"),
      upload(base, cookie, bytes, "two.xlsx", "두 번째 여행"),
    ]);
    assert.ok(imports.every((r) => r.status === 201));
    const { trips } = await (
      await fetch(base + "/api/trips", { headers: { Cookie: cookie } })
    ).json();
    assert.equal(trips.length, 2);
    assert.equal(new Set(trips.map((t) => t.id)).size, 2);
  }));
