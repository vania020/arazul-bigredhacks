import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const asset = JSON.parse(
  readFileSync(new URL("src/assets/risk-grid.json.asset.json", root), "utf8"),
);
// The existing Lovable Vite plugin proxies hosted assets when this is present.
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
    env: {
      ...process.env,
      LOVABLE_PREVIEW_HOST:
        process.env.LOVABLE_PREVIEW_HOST || `id-preview--${asset.project_id}.lovable.app`,
    },
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
