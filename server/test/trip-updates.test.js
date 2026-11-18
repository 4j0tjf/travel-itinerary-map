import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import ExcelJS from "exceljs";
import { createApp } from "../app.js";
import { HttpError } from "../utils/errors.js";

const headers = { "X-Travel-Client": "1" };
const linkOne = "https://docs.google.com/spreadsheets/d/1XWJLkAwch5GXAt_7zOFDcg8Wm8Xv29_8PWuuW15qmAE/edit";
const linkTwo = "https://docs.google.com/spreadsheets/d/1kpkSds-_GxCFNjXxtQpocX0XsITLaNgTsJpvwi5cQ2c/edit";
async function excel(date = "2026-12-01", name = "원래 장소") {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("여행 일정");
  sheet.addRow(["날짜", "시간", "종료시간", "장소명", "주소", "위도", "경도", "메모", "이동수단", "이미지URL", "여행지역", "여행명"]);
  sheet.addRow([date, "09:00", "10:00", name, "Shizuoka", 35, 138, "메모", "DRIVE", "", "시즈오카", "파일 안 제목"]);
  book.addWorksheet("가볼 만한 곳").addRow(["별도의 추천 데이터"]);
  book.addWorksheet("호텔 추천").addRow(["호텔 원본 보존"]);
  return Buffer.from(await book.xlsx.writeBuffer());
}
async function fixture(fn, options = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "travel-update-test-"));
  let server;
  let base;
  const start = async () => {
    server = createApp({ dataDir, basePath: "/travel", ...options }).listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    base = `http://127.0.0.1:${server.address().port}/travel`;
  };
  const stop = async () => {
    if (server) { const current = server; server = null; await new Promise(resolve => current.close(resolve)); }
  };
  const call = (route, cookie, method = "GET", body) => fetch(base + route, {
    method, headers: { ...headers, ...(cookie ? { Cookie: cookie } : {}), ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
  });
  const register = async username => {
    const response = await call("/api/auth/register", "", "POST", { username, password: "test-password-2026" });
    assert.equal(response.status, 201);
    return response.headers.get("set-cookie").split(";")[0];
  };
  const upload = (cookie, bytes, route = "/api/trips", revision) => {
    const form = new FormData();
    form.append("file", new Blob([bytes]), "trip.xlsx");
    if (revision !== undefined) form.append("revision", String(revision));
    if (route === "/api/trips") form.append("title", "유지할 여행 이름");
    return call(route, cookie, route === "/api/trips" ? "POST" : "PUT", form);
  };
  try { await start(); await fn({ dataDir, call, register, upload, stop, start }); }
  finally { await stop(); await rm(dataDir, { recursive: true, force: true }); }
}

test("original workbook round-trips, replacements keep identity, and failures preserve the current journey", async () => fixture(async ({ dataDir, call, register, upload, stop, start }) => {
  const owner = await register("file_owner");
  const other = await register("file_other");
  const original = await excel();
  const createdResponse = await upload(owner, original);
  assert.equal(createdResponse.status, 201);
  const { trip } = await createdResponse.json();
  assert.equal(trip.workbookAvailable, true);
  assert.equal(trip.source.kind, "excel");
  assert.equal("workbook" in trip, false);
  const endpoint = `/api/trips/${trip.id}`;
  const downloaded = await call(endpoint + "/workbook", owner);
  assert.equal(downloaded.headers.get("x-workbook-source"), "original");
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), original);
  assert.equal((await call(endpoint + "/workbook", other)).status, 404);
  assert.equal((await upload(other, original, endpoint + "/workbook", 0)).status, 404);
  assert.equal((await call(endpoint + "/source", other, "PATCH", { url: linkOne })).status, 404);
  assert.equal((await call(endpoint + "/refresh", other, "POST", {})).status, 404);
  const changed = await excel("2026-12-08", "수정된 장소");
  const replacement = await upload(owner, changed, endpoint + "/workbook", 0);
  assert.equal(replacement.status, 200);
  const { trip: updated } = await replacement.json();
  assert.equal(updated.id, trip.id);
  assert.equal(updated.title, trip.title);
  assert.equal(updated.createdAt, trip.createdAt);
  assert.equal(updated.revision, 1);
  assert.equal(updated.days[0].date, "2026-12-08");
  assert.equal(updated.days[0].places[0].name, "수정된 장소");
  assert.equal((await (await call("/api/trips", owner)).json()).trips.length, 1);
  assert.deepEqual(Buffer.from(await (await call(endpoint + "/workbook", owner)).arrayBuffer()), changed);
  assert.equal((await upload(owner, Buffer.from("invalid"), endpoint + "/workbook", 1)).status, 400);
  assert.equal((await upload(owner, original, endpoint + "/workbook", 0)).status, 409);
  assert.equal((await call(endpoint + "/source", owner, "PATCH", { url: linkOne, revision: true })).status, 400);
  assert.equal((await call(endpoint + "/refresh", owner, "POST", {})).status, 400);
  assert.deepEqual((await (await call(endpoint, owner)).json()).trip, updated);
  assert.equal((await readdir(path.join(dataDir, "workbooks"))).length, 1);
  await stop(); await start();
  assert.deepEqual(Buffer.from(await (await call(endpoint + "/workbook", owner)).arrayBuffer()), changed);
  assert.equal((await call(endpoint, other)).status, 404);
  assert.equal((await call(endpoint, owner, "DELETE")).status, 204);
  assert.equal((await readdir(path.join(dataDir, "workbooks"))).length, 0);
}));

test("sheet links save without importing, refresh replaces the same journey, and Google errors leave data intact", async () => {
  let bytes = await excel();
  let deny = false;
  const requests = [];
  await fixture(async ({ call, register }) => {
    const owner = await register("sheet_owner");
    const response = await call("/api/trips/from-google-sheet", owner, "POST", { url: linkOne + "?usp=sharing", title: "시트 여행" });
    assert.equal(response.status, 201);
    const { trip } = await response.json();
    assert.equal(trip.source.googleSheetUrl, linkOne);
    const endpoint = `/api/trips/${trip.id}`;
    const savedResponse = await call(endpoint + "/source", owner, "PATCH", { url: linkTwo, revision: 0 });
    assert.equal(savedResponse.status, 200);
    const { trip: saved } = await savedResponse.json();
    assert.equal(requests.length, 1);
    assert.deepEqual(saved.days, trip.days);
    assert.equal(saved.source.googleSheetUrl, linkTwo);
    bytes = await excel("2026-12-09", "최신 시트 장소");
    const refreshedResponse = await call(endpoint + "/refresh", owner, "POST", { revision: saved.revision });
    assert.equal(refreshedResponse.status, 200);
    const { trip: refreshed } = await refreshedResponse.json();
    assert.deepEqual(requests, [linkOne, linkTwo]);
    assert.equal(refreshed.id, trip.id);
    assert.equal(refreshed.title, "시트 여행");
    assert.equal(refreshed.days[0].places[0].name, "최신 시트 장소");
    assert.equal(refreshed.source.kind, "google-sheet");
    assert.deepEqual(Buffer.from(await (await call(endpoint + "/workbook", owner)).arrayBuffer()), bytes);
    const invalidLink = await call(endpoint + "/source", owner, "PATCH", { url: "https://example.com/private", revision: refreshed.revision });
    assert.equal(invalidLink.status, 400);
    deny = true;
    assert.equal((await call(endpoint + "/refresh", owner, "POST", { revision: refreshed.revision })).status, 400);
    assert.deepEqual((await (await call(endpoint, owner)).json()).trip, refreshed);
    assert.deepEqual(Buffer.from(await (await call(endpoint + "/workbook", owner)).arrayBuffer()), bytes);
  }, { googleSheetFetcher: async url => { requests.push(url); if (deny) throw new HttpError(400, "공유 설정을 확인해 주세요."); return { buffer: bytes, filename: "google-trip.xlsx" }; } });
});

test("a slow refresh cannot overwrite a concurrent edit or leave orphaned workbook files", async () => {
  const bytes = await excel("2026-12-09", "늦게 도착한 시트");
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await fixture(async ({ dataDir, call, register, upload }) => {
    const owner = await register("concurrent_owner");
    const original = await excel();
    const { trip } = await (await upload(owner, original)).json();
    const endpoint = `/api/trips/${trip.id}`;
    const { trip: linked } = await (await call(endpoint + "/source", owner, "PATCH", { url: linkOne, revision: 0 })).json();
    const pending = call(endpoint + "/refresh", owner, "POST", { revision: linked.revision });
    await started;
    let renamed;
    try { renamed = await call(endpoint, owner, "PATCH", { title: "동시에 바꾼 이름" }); }
    finally { release(); }
    assert.equal(renamed.status, 200);
    assert.equal((await pending).status, 409);
    const current = (await (await call(endpoint, owner)).json()).trip;
    assert.equal(current.title, "동시에 바꾼 이름");
    assert.equal(current.days[0].places[0].name, "원래 장소");
    assert.deepEqual(Buffer.from(await (await call(endpoint + "/workbook", owner)).arrayBuffer()), original);
    assert.equal((await readdir(path.join(dataDir, "workbooks"))).length, 1);
  }, { googleSheetFetcher: async () => { entered(); await gate; return { buffer: bytes, filename: "delayed.xlsx" }; } });
});

test("legacy journeys export their current itinerary and can register a link for future refresh", async () => fixture(async ({ dataDir, call, register, upload }) => {
  const owner = await register("legacy_owner");
  const { trip } = await (await upload(owner, await excel())).json();
  const file = path.join(dataDir, "database.json");
  const db = JSON.parse(await readFile(file, "utf8"));
  delete db.trips[0].workbook; delete db.trips[0].source; delete db.trips[0].revision;
  await writeFile(file, JSON.stringify(db));
  const endpoint = `/api/trips/${trip.id}`;
  const current = (await (await call(endpoint, owner)).json()).trip;
  assert.equal(current.workbookAvailable, false);
  assert.equal(current.revision, 0);
  const response = await call(endpoint + "/workbook", owner);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-workbook-source"), "generated");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await response.arrayBuffer()));
  assert.equal(book.worksheets.length, 1);
  assert.equal(book.worksheets[0].getCell("D2").value, "원래 장소");
  assert.equal(book.worksheets[0].getCell("L2").value, "유지할 여행 이름");
  assert.equal((await call(endpoint + "/refresh", owner, "POST", {})).status, 400);
  assert.equal((await call(endpoint + "/source", owner, "PATCH", { url: linkOne, revision: 0 })).status, 200);
}));
