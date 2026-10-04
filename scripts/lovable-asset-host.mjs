// Shared by vite.config.ts (`npm run dev`) and scripts/dev-local.mjs (`npm run dev:local`).
// The Lovable Vite config already includes an asset proxy for `/__l5e/assets-v1/*` (e.g. the
// São Paulo risk grid). It is only active when LOVABLE_PREVIEW_HOST is set, so outside Lovable we
// default it to this project's preview host, read from the asset manifest's project_id.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ENV = "LOVABLE_PREVIEW_HOST";
const MANIFEST = "src/assets/risk-grid.json.asset.json";

/** Mirrors the Lovable config's own sandbox detection (not exported by the package). */
const inLovableSandbox = () =>
  process.env.LOVABLE_SANDBOX === "1" || !!process.env.DEV_SERVER__PROJECT_PATH;

/** `id-preview--<project_id>.lovable.app`, or undefined if the manifest is missing/invalid. */
export function defaultPreviewHost(root = process.cwd()) {
  try {
    const { project_id } = JSON.parse(readFileSync(join(root, MANIFEST), "utf8"));
    return typeof project_id === "string" && /^[\w-]+$/.test(project_id)
      ? `id-preview--${project_id}.lovable.app`
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Sets LOVABLE_PREVIEW_HOST for local dev servers unless it was set explicitly or Lovable's own
 * sandbox is running (which serves assets itself). Returns the host in effect, if any.
 */
export function ensurePreviewHost(root = process.cwd()) {
  const explicit = process.env[ENV]?.trim();
  if (explicit) return explicit;
  if (inLovableSandbox()) return undefined;
  const host = defaultPreviewHost(root);
  if (host) process.env[ENV] = host;
  return host;
}
