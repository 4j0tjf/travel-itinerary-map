import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { HttpError } from "../utils/errors.js";
const scrypt = promisify(scryptCallback);
const COOKIE = "travel_session";
const SESSION_AGE = 30 * 24 * 60 * 60 * 1000;
const digest = (token) => createHash("sha256").update(token).digest("hex");
// 본인에게만 돌려주는 정보다. 지도 키는 브라우저에서 Google 지도를 불러올 때 쓴다.
const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  mapsApiKey: user.mapsApiKey || "",
});
// Google API 키는 AIza로 시작하는 39자다.
const MAPS_KEY = /^AIza[0-9A-Za-z_-]{35}$/;
const cookieOptions = (req) => ({
  httpOnly: true,
  sameSite: "lax",
  secure: req.secure,
  path: req.baseUrl || "/",
});
function tokenFrom(req) {
  return (
    (req.headers.cookie || "")
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(COOKIE + "="))
      ?.slice(COOKIE.length + 1) || ""
  );
}
function credentials(body) {
  const username =
    typeof body?.username === "string"
      ? body.username.trim().toLowerCase()
      : "";
  const password = body?.password;
  if (!/^[a-z0-9_-]{3,32}$/.test(username))
    throw new HttpError(
      400,
      "아이디는 영문 소문자·숫자·_·-로 3~32자 입력해 주세요.",
    );
  if (
    typeof password !== "string" ||
    password.length < 10 ||
    password.length > 128
  )
    throw new HttpError(400, "비밀번호는 10~128자로 입력해 주세요.");
  return { username, password };
}
export function createAuth(store) {
  async function startSession(userId, req, res) {
    const token = randomBytes(32).toString("hex");
    const expiresAt = Date.now() + SESSION_AGE;
    const old = tokenFrom(req);
    await store.update((db) => {
      db.sessions = db.sessions.filter(
        (s) => s.expiresAt > Date.now() && s.hash !== digest(old),
      );
      db.sessions.push({ hash: digest(token), userId, expiresAt });
    });
    res.cookie(COOKIE, token, { ...cookieOptions(req), maxAge: SESSION_AGE });
  }
  return {
    async attach(req, _res, next) {
      try {
        const token = tokenFrom(req);
        if (token && /^[a-f0-9]{64}$/.test(token)) {
          const db = await store.read();
          const session = db.sessions.find(
            (s) => s.hash === digest(token) && s.expiresAt > Date.now(),
          );
          req.user =
            session && db.users.find((user) => user.id === session.userId);
        }
        next();
      } catch (error) {
        next(error);
      }
    },
    requireUser(req, _res, next) {
      if (!req.user) return next(new HttpError(401, "로그인이 필요합니다."));
      next();
    },
    async register(req, res) {
      const { username, password } = credentials(req.body);
      const salt = randomBytes(16).toString("hex");
      const hash = Buffer.from(await scrypt(password, salt, 64)).toString(
        "hex",
      );
      const user = {
        id: randomUUID(),
        username,
        salt,
        passwordHash: hash,
        createdAt: new Date().toISOString(),
      };
      await store.update((db) => {
        if (db.users.some((u) => u.username === username))
          throw new HttpError(409, "이미 사용 중인 아이디입니다.");
        db.users.push(user);
      });
      await startSession(user.id, req, res);
      res.status(201).json({ user: publicUser(user) });
    },
    async login(req, res) {
      const { username, password } = credentials(req.body);
      const db = await store.read();
      const user = db.users.find((u) => u.username === username);
      // Equal-cost password hashing also runs for unknown usernames.
      const calculated = Buffer.from(
        await scrypt(password, user?.salt || "missing-user-salt", 64),
      );
      const expected = user
        ? Buffer.from(user.passwordHash, "hex")
        : Buffer.alloc(64);
      if (!timingSafeEqual(calculated, expected) || !user)
        throw new HttpError(401, "아이디 또는 비밀번호를 확인해 주세요.");
      await startSession(user.id, req, res);
      res.json({ user: publicUser(user) });
    },
    me(req, res) {
      res.json({ user: req.user ? publicUser(req.user) : null });
    },
    async setMapsKey(req, res) {
      const key = typeof req.body?.key === "string" ? req.body.key.trim() : "";
      if (!MAPS_KEY.test(key))
        throw new HttpError(
          400,
          "Google Maps API 키 형식이 아닙니다. AIza로 시작하는 39자 키를 붙여 넣어 주세요.",
        );
      const user = await store.update((db) => {
        const user = db.users.find((u) => u.id === req.user.id);
        if (!user) throw new HttpError(401, "로그인이 필요합니다.");
        user.mapsApiKey = key;
        user.mapsApiKeyUpdatedAt = new Date().toISOString();
        return user;
      });
      res.json({ user: publicUser(user) });
    },
    async removeMapsKey(req, res) {
      const user = await store.update((db) => {
        const user = db.users.find((u) => u.id === req.user.id);
        if (!user) throw new HttpError(401, "로그인이 필요합니다.");
        delete user.mapsApiKey;
        delete user.mapsApiKeyUpdatedAt;
        return user;
      });
      res.json({ user: publicUser(user) });
    },
    async logout(req, res) {
      const hash = digest(tokenFrom(req));
      await store.update((db) => {
        db.sessions = db.sessions.filter(
          (s) => s.hash !== hash && s.expiresAt > Date.now(),
        );
      });
      res.clearCookie(COOKIE, cookieOptions(req));
      res.status(204).end();
    },
  };
}
