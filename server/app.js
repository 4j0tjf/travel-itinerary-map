import express from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import multer from "multer";
import { rateLimit } from "express-rate-limit";
import { createStore, root } from "./services/store.js";
import { createAuth } from "./services/auth.js";
import { parseExcel } from "./services/excel.js";
import { HttpError } from "./utils/errors.js";

export function createApp({
  dataDir = path.join(root, "data"),
  authLimit = 30,
  basePath = "",
} = {}) {
  const app = express();
  const store = createStore(dataDir);
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
        .map(({ ownerId, ...trip }) => trip),
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
  app.post("/api/trips", upload.single("file"), async (req, res) => {
    if (!req.file)
      throw new HttpError(400, "업로드할 .xlsx 파일을 선택해 주세요.");
    let filename = req.file.originalname;
    // Multipart clients encode filenames as UTF-8; Busboy exposes legacy latin1 by default.
    const decoded = Buffer.from(filename, "latin1").toString("utf8");
    if (!decoded.includes("\uFFFD")) filename = decoded;
    const parsed = await parseExcel(req.file.buffer, {
      filename,
      title: req.body?.title,
      sheetName: req.body?.sheetName,
    });
    const now = new Date().toISOString();
    const trip = {
      ...parsed.itinerary,
      warnings: parsed.warnings,
      sourceSheet: parsed.sheetName,
      createdAt: now,
      updatedAt: now,
    };
    await store.update((db) => {
      if (db.trips.filter((t) => t.ownerId === req.user.id).length >= 100)
        throw new HttpError(
          400,
          "여행은 계정당 최대 100개까지 저장할 수 있습니다.",
        );
      db.trips.push({ ...trip, ownerId: req.user.id });
    });
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
    const { ownerId, ...trip } = owned(await store.read(), req);
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
      const { ownerId, ...result } = stored;
      return result;
    });
    res.json({ trip });
  });
  app.delete("/api/trips/:id", async (req, res) => {
    await store.update((db) => {
      const trip = owned(db, req);
      db.trips.splice(db.trips.indexOf(trip), 1);
    });
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
