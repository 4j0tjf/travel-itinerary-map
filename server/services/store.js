import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
export const root = fileURLToPath(new URL("../../", import.meta.url));
const emptyDatabase = () => ({
  version: 1,
  users: [],
  sessions: [],
  trips: [],
});

// One Node process owns the JSON file. Every mutation is serialized and atomically replaced.
export function createStore(dataDir) {
  const file = path.join(dataDir, "database.json");
  let queue = Promise.resolve();
  async function read() {
    try {
      const data = JSON.parse(await readFile(file, "utf8"));
      if (
        data.version !== 1 ||
        !["users", "sessions", "trips"].every((key) => Array.isArray(data[key]))
      ) {
        throw new Error("Invalid database format");
      }
      return data;
    } catch (error) {
      if (error.code === "ENOENT") return emptyDatabase();
      throw error; // Preserve corrupt files rather than silently overwriting them.
    }
  }
  async function save(data) {
    await mkdir(dataDir, { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(data, null, 2) + "\n", {
        mode: 0o600,
      });
      await rename(temporary, file);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  return {
    async read() {
      await queue;
      return read();
    },
    update(operation) {
      const pending = queue.then(async () => {
        const data = await read();
        const result = await operation(data);
        await save(data);
        return result;
      });
      queue = pending.catch(() => {});
      return pending;
    },
  };
}
