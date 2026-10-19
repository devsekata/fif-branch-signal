import type { NextConfig } from "next";
import { copyFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";

/* MapLibre looks for its worker next to its own script, which the bundler moves; the worker and the
 * chunk it imports are served from public/ instead, copied from the installed version on every dev or build. */
const maplibre = dirname(require.resolve("maplibre-gl/dist/maplibre-gl.mjs"));
mkdirSync(join(__dirname, "public/maplibre"), { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) copyFileSync(join(maplibre, f), join(__dirname, "public/maplibre", f));

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
