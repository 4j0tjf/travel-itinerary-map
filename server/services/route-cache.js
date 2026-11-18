import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { HttpError } from "../utils/errors.js";

const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const validPoint = p => Number.isFinite(p?.lat) && Number.isFinite(p?.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
export function routeJobs(trip) {
  const jobs = [];
  for (const day of trip.days) {
    let job;
    for (let i = 0; i < day.places.length - 1; i++) {
      const from = day.places[i], to = day.places[i + 1];
      if (!validPoint(from) || !validPoint(to) || !["DRIVE", "WALK"].includes(from.mode)) { job = undefined; continue; }
      if (!job || job.mode !== from.mode || job.stops.length === 12) {
        job = { date: day.date, mode: from.mode, stops: [{ lat: from.lat, lng: from.lng }] };
        jobs.push(job);
      }
      job.stops.push({ lat: to.lat, lng: to.lng });
    }
  }
  return jobs.map(job => ({ ...job, key: digest(["road-v1", job.mode, job.stops]) }));
}

// Store only route geometry. Google permits temporary coordinate caching for 30 days.
export function createRouteCache(dataDir, { now = Date.now } = {}) {
  const directory = path.join(dataDir, "route-cache");
  const filename = (owner, trip) => path.join(directory, digest([owner, trip]) + ".json");
  let queue = Promise.resolve();
  const serialized = fn => { const pending = queue.then(fn); queue = pending.catch(() => {}); return pending; };
  async function read(file) {
    try { return JSON.parse(await readFile(file, "utf8")); }
    catch (error) { if (error.code === "ENOENT") return {}; throw error; }
  }
  async function save(file, entries) {
    if (!Object.keys(entries).length) { await rm(file, { force: true }); return; }
    await mkdir(directory, { recursive: true });
    const temporary = file + "." + randomUUID() + ".tmp";
    try { await writeFile(temporary, JSON.stringify(entries), { mode: 0o600 }); await rename(temporary, file); }
    finally { await rm(temporary, { force: true }); }
  }
  function retain(entries, keys) {
    return Object.fromEntries(Object.entries(entries).filter(([key, entry]) =>
      (!keys || keys.has(key)) && entry.expiresAt > now() && Array.isArray(entry.path) && entry.path.length >= 2 && entry.path.every(validPoint)));
  }
  return {
    get(owner, trip, keys) { return serialized(async () => {
      const file = filename(owner, trip), entries = await read(file), kept = retain(entries, new Set(keys));
      if (Object.keys(entries).length !== Object.keys(kept).length) await save(file, kept);
      return kept;
    }); },
    put(owner, trip, keys, key, points) { return serialized(async () => {
      if (!keys.includes(key)) throw new HttpError(409, "일정이 변경되었습니다. 경로를 다시 불러와 주세요.");
      if (!Array.isArray(points) || points.length < 2 || points.length > 12000 || !points.every(validPoint)) throw new HttpError(400, "경로 좌표 형식이 올바르지 않습니다.");
      const file = filename(owner, trip), entries = retain(await read(file), new Set(keys));
      const entry = { path: points.map(({ lat, lng }) => ({ lat, lng })), expiresAt: now() + 30 * 86400000 };
      entries[key] = entry;
      await save(file, entries);
      return entry;
    }); },
    remove(owner, trip) { return serialized(() => rm(filename(owner, trip), { force: true })); },
    pruneExpired() { return serialized(async () => {
      let files;
      try { files = await readdir(directory); } catch (error) { if (error.code === "ENOENT") return; throw error; }
      for (const name of files.filter(name => /^[a-f0-9]{64}\.json$/.test(name))) {
        const file = path.join(directory, name), entries = await read(file), kept = retain(entries);
        if (Object.keys(entries).length !== Object.keys(kept).length) await save(file, kept);
      }
    }); },
  };
}
