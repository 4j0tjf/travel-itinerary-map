import express from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import multer from "multer";
import { rateLimit } from "express-rate-limit";
import { createStore, root } from "./services/store.js";
import { createAuth } from "./services/auth.js";
import { parseExcel } from "./services/excel.js";
import { HttpError } from "./utils/errors.js";
import { fetchGoogleSheet, normalizeGoogleSheetLink } from "./services/google-sheets.js";
import { createWorkbookStorage, exportCurrentItinerary, workbookFilename } from "./services/workbooks.js";

export function createApp({
  dataDir = path.join(root, "data"),
  authLimit = 30,
  basePath = "",
  googleSheetFetcher = fetchGoogleSheet,
  googleImportLimit = 10,
} = {}) {
  const app = express();
  const store = createStore(dataDir);
  const workbooks = createWorkbookStorage(dataDir);
  const auth = createAuth(store);
  app.disable("x-powered-by");
  app.set("trust proxy", "loopback");
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  // Custom request header prevents cross-origin HTML form requests. No cross-origin CORS is enabled.
  app.use("/api", (req, _res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("X-Travel-Client") !== "1"
    )
      return next(
        new HttpError(
          403,
          "허용되지 않은 요청입니다. 페이지를 새로고침해 주세요.",
        ),
      );
    next();
  });
  app.use(express.json({ limit: "16kb" }));
  app.use("/api", auth.attach);
  app.get("/api/health", (_req, res) =>
    res.json({ status: "ok", version: "0.2.0" }),
  );
  const loginLimiter = rateLimit({
    windowMs: 15 * 60000,
    limit: authLimit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "로그인 시도가 많습니다. 15분 후 다시 시도해 주세요." },
  });
  app.post("/api/auth/register", loginLimiter, auth.register);
  app.post("/api/auth/login", loginLimiter, auth.login);
  app.get("/api/auth/me", auth.me);
  app.post("/api/auth/logout", auth.logout);
  app.get("/api/sample", (_req, res) =>
    res.download(path.join(root, "sample/itinerary.xlsx"), "itinerary.xlsx"),
  );

  app.use("/api/trips", auth.requireUser);
  app.get("/api/trips", async (req, res) => {
    const db = await store.read();
    res.json({
      trips: db.trips
        .filter((t) => t.ownerId === req.user.id)
        .map(publicTrip),
    });
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 3, fieldSize: 1000 },
    fileFilter: (_req, file, cb) =>
      cb(
        /\.xlsx$/i.test(file.originalname)
          ? null
          : new HttpError(400, ".xlsx 파일만 업로드할 수 있습니다."),
        /\.xlsx$/i.test(file.originalname),
      ),
  });
  function publicTrip({ ownerId, workbook, ...trip }) {
    return { ...trip, revision: trip.revision ?? 0, workbookAvailable: Boolean(workbook) };
  }
  function uploadFilename(file) {
    const decoded = Buffer.from(file.originalname, "latin1").toString("utf8");
    return workbookFilename(decoded.includes("\uFFFD") ? file.originalname : decoded);
  }
  async function saveTrip(parsed, ownerId, file) {
    const now = new Date().toISOString();
    const workbook = await workbooks.put(file.buffer, file.filename);
    const trip = {
      ...parsed.itinerary,
      warnings: parsed.warnings,
      sourceSheet: parsed.sheetName,
      createdAt: now,
      updatedAt: now,
      revision: 0,
      workbook,
      source: { kind: file.googleSheetUrl ? "google-sheet" : "excel", filename: workbook.filename, importedAt: now,
        ...(file.googleSheetUrl ? { googleSheetUrl: file.googleSheetUrl } : {}) },
    };
    try { await store.update((db) => {
      if (db.trips.filter((t) => t.ownerId === ownerId).length >= 100)
        throw new HttpError(
          400,
          "여행은 계정당 최대 100개까지 저장할 수 있습니다.",
        );
      db.trips.push({ ...trip, ownerId });
    }); } catch (error) { await workbooks.remove(workbook); throw error; }
    return publicTrip(trip);
  }
  app.post("/api/trips", upload.single("file"), async (req, res) => {
    if (!req.file) throw new HttpError(400, "업로드할 .xlsx 파일을 선택해 주세요.");
    const filename = uploadFilename(req.file);
    const parsed = await parseExcel(req.file.buffer, {
      filename, title: req.body?.title, sheetName: req.body?.sheetName,
    });
    const trip = await saveTrip(parsed, req.user.id, { buffer: req.file.buffer, filename });
    res.status(201).json({ trip });
  });
  const importLimiter = rateLimit({
    windowMs: 15 * 60000, limit: googleImportLimit,
    keyGenerator: (req) => req.user.id,
    standardHeaders: "draft-8", legacyHeaders: false,
    message: { error: "구글 시트 가져오기는 15분에 10번까지 가능합니다. 잠시 후 다시 시도해 주세요." },
  });
  app.post("/api/trips/from-google-sheet", importLimiter, async (req, res) => {
    const { url, title = "" } = req.body || {};
    if (typeof url !== "string" || !url.trim() || typeof title !== "string" || title.length > 80) {
      throw new HttpError(400, "구글 시트 링크와 여행 이름(최대 80자)을 확인해 주세요.");
    }
    const db = await store.read();
    if (db.trips.filter((t) => t.ownerId === req.user.id).length >= 100) {
      throw new HttpError(400, "여행은 계정당 최대 100개까지 저장할 수 있습니다.");
    }
    const googleSheetUrl = normalizeGoogleSheetLink(url);
    const { buffer, filename } = await googleSheetFetcher(googleSheetUrl);
    const parsed = await parseExcel(buffer, { filename, title });
    const trip = await saveTrip(parsed, req.user.id, { buffer, filename, googleSheetUrl });
    res.status(201).json({ trip });
  });
  const owned = (db, req) => {
    const trip = db.trips.find(
      (t) => t.id === req.params.id && t.ownerId === req.user.id,
    );
    if (!trip) throw new HttpError(404, "여행 일정을 찾을 수 없습니다.");
    return trip;
  };
  app.get("/api/trips/:id", async (req, res) => {
    res.json({ trip: publicTrip(owned(await store.read(), req)) });
  });
  function checkRevision(trip, revision) {
    if (!["number", "string"].includes(typeof revision) || revision === "" || !Number.isSafeInteger(Number(revision)) || Number(revision) < 0) throw new HttpError(400, "일정 버전이 올바르지 않습니다. 페이지를 새로고침해 주세요.");
    if (Number(revision) !== (trip.revision ?? 0)) throw new HttpError(409, "다른 요청에서 일정이 변경되었습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.");
  }
  async function loadOwned(req, _res, next) {
    req.tripSnapshot = owned(await store.read(), req);
    next();
  }
  async function replaceTrip(req, file, kind) {
    const snapshot = req.tripSnapshot;
    checkRevision(snapshot, req.body?.revision);
    const parsed = await parseExcel(file.buffer, { filename: file.filename, title: snapshot.title });
    const workbook = await workbooks.put(file.buffer, file.filename);
    let previous;
    let result;
    try {
      result = await store.update(db => {
        const stored = owned(db, req);
        checkRevision(stored, snapshot.revision ?? 0);
        previous = stored.workbook;
        const now = new Date().toISOString();
        const source = { ...stored.source, kind, filename: workbook.filename, importedAt: now };
        Object.assign(stored, parsed.itinerary, { id: snapshot.id, title: stored.title, createdAt: stored.createdAt,
          warnings: parsed.warnings, sourceSheet: parsed.sheetName, updatedAt: now, revision: (stored.revision ?? 0) + 1,
          workbook, source });
        return publicTrip(stored);
      });
    } catch (error) { await workbooks.remove(workbook); throw error; }
    await workbooks.remove(previous);
    return result;
  }
  app.get("/api/trips/:id/workbook", loadOwned, async (req, res) => {
    let trip = req.tripSnapshot;
    let buffer;
    if (trip.workbook) {
      try { buffer = await workbooks.read(trip.workbook); }
      catch (error) {
        if (error.code !== "ENOENT") throw error;
        // A concurrent replacement may have retired the file after our first read.
        trip = owned(await store.read(), req);
        if (trip.workbook) buffer = await workbooks.read(trip.workbook);
      }
    }
    if (!buffer) buffer = await exportCurrentItinerary(trip);
    res.set("X-Workbook-Source", trip.workbook ? "original" : "generated");
    res.attachment(trip.workbook?.filename || workbookFilename(trip.title));
    res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").send(buffer);
  });
  app.put("/api/trips/:id/workbook", loadOwned, upload.single("file"), async (req, res) => {
    if (!req.file) throw new HttpError(400, "수정한 .xlsx 파일을 선택해 주세요.");
    const trip = await replaceTrip(req, { buffer: req.file.buffer, filename: uploadFilename(req.file) }, "excel");
    res.json({ trip });
  });
  app.patch("/api/trips/:id/source", loadOwned, async (req, res) => {
    const googleSheetUrl = normalizeGoogleSheetLink(req.body?.url);
    checkRevision(req.tripSnapshot, req.body?.revision);
    const trip = await store.update(db => {
      const stored = owned(db, req);
      checkRevision(stored, req.tripSnapshot.revision ?? 0);
      stored.source = { kind: "excel", importedAt: stored.createdAt, ...stored.source, googleSheetUrl, linkUpdatedAt: new Date().toISOString() };
      stored.updatedAt = new Date().toISOString();
      stored.revision = (stored.revision ?? 0) + 1;
      return publicTrip(stored);
    });
    res.json({ trip });
  });
  app.post("/api/trips/:id/refresh", loadOwned, importLimiter, async (req, res) => {
    checkRevision(req.tripSnapshot, req.body?.revision);
    const url = req.tripSnapshot.source?.googleSheetUrl;
    if (!url) throw new HttpError(400, "먼저 이 여행의 구글 시트 링크를 등록해 주세요.");
    const file = await googleSheetFetcher(url);
    const trip = await replaceTrip(req, file, "google-sheet");
    res.json({ trip });
  });
  app.patch("/api/trips/:id", async (req, res) => {
    const title = req.body?.title;
    if (typeof title !== "string" || !title.trim() || title.trim().length > 80)
      throw new HttpError(400, "일정 이름은 1~80자로 입력해 주세요.");
    const trip = await store.update((db) => {
      const stored = owned(db, req);
      stored.title = title.trim();
      stored.updatedAt = new Date().toISOString();
      stored.revision = (stored.revision ?? 0) + 1;
      return publicTrip(stored);
    });
    res.json({ trip });
  });
  app.delete("/api/trips/:id", async (req, res) => {
    const reference = await store.update((db) => {
      const trip = owned(db, req);
      db.trips.splice(db.trips.indexOf(trip), 1);
      return trip.workbook;
    });
    await workbooks.remove(reference);
    res.status(204).end();
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "지원하지 않는 API입니다." }),
  );
  const dist = path.join(root, "client/dist");
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(path.join(dist, "index.html")),
    );
  }
  app.use((error, _req, res, _next) => {
    const status =
      error instanceof multer.MulterError ||
      error.type === "entity.parse.failed"
        ? 400
        : error.status || 500;
    if (status >= 500) console.error("Request failed:", error.message);
    res
      .status(status)
      .json({
        error:
          error instanceof multer.MulterError
            ? "파일 크기(최대 5MB)와 업로드 양식을 확인해 주세요."
            : status >= 500
              ? "서버에서 데이터를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
              : error.message,
        ...(error.details ? { details: error.details } : {}),
      });
  });
  const prefix = basePath.replace(/\/+$/, "");
  if (!prefix) return app;
  // Keep direct local checks available while serving the complete app below a public prefix.
  const mounted = express();
  mounted.disable("x-powered-by");
  mounted.set("trust proxy", "loopback");
  mounted.use(prefix, app);
  mounted.use(app);
  return mounted;
}
