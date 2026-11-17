import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const clientRequire = createRequire(
  new URL("../client/package.json", import.meta.url),
);
const viteBin = path.join(
  path.dirname(clientRequire.resolve("vite/package.json")),
  "bin/vite.js",
);
const children = [
  spawn(process.execPath, ["--watch", "server/index.js"], {
    cwd: root,
    stdio: "inherit",
  }),
  spawn(
    process.execPath,
    [
      viteBin,
      "--config",
      "client/vite.config.ts",
      "--host",
      "0.0.0.0",
      ...process.argv.slice(2),
    ],
    { cwd: root, stdio: "inherit" },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
}
for (const child of children) {
  child.on("exit", (code) => stop(code || 0));
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
