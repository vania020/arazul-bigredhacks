import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ensurePreviewHost } from "./lovable-asset-host.mjs";

const root = new URL("../", import.meta.url);
// The existing Lovable Vite plugin proxies hosted assets when this is present. vite.config.ts
// applies the same default, so `npm run dev` (port 8080) works too; this script only pins the
// historical 127.0.0.1:5180 origin.
ensurePreviewHost(fileURLToPath(root));
const server = spawn(
  process.execPath,
  [
    fileURLToPath(new URL("node_modules/vite/bin/vite.js", root)),
    "dev",
    "--host",
    "127.0.0.1",
    "--port",
    "5180",
    "--strictPort",
    ...process.argv.slice(2),
  ],
  {
    cwd: fileURLToPath(root),
    stdio: "inherit",
    env: process.env,
  },
);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
server.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
server.on("exit", (code, signal) => {
  process.exit(code ?? (signal === "SIGINT" ? 130 : 1));
});
