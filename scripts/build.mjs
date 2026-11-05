import { build } from "esbuild";
import { mkdir, copyFile, cp } from "node:fs/promises";
import { writeThirdPartyNotices } from "./third-party-notices.mjs";
await mkdir("dist/desktop", { recursive: true });
await build({
  entryPoints: ["apps/server/src/index.ts"],
  outfile: "dist/server.mjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  packages: "external",
  sourcemap: true,
});
await build({
  entryPoints: ["apps/desktop/main.ts"],
  outfile: "dist/desktop/main.cjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  packages: "external",
  sourcemap: true,
});
await build({
  entryPoints: ["scripts/package-smoke.ts"],
  outfile: "dist/runtime/package-smoke.cjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  packages: "external",
});
await cp("packages/core/skills", "dist/skills", { recursive: true });
await mkdir("dist/runtime", { recursive: true });
await copyFile(
  "node_modules/sql.js/dist/sql-wasm.wasm",
  "dist/runtime/sql-wasm.wasm",
);
await cp("apps/website/src/samples", "dist/runtime/samples", {
  recursive: true,
});
await cp("resources/fonts", "dist/runtime/fonts", { recursive: true });
const noticeCount = await writeThirdPartyNotices(
  "dist/runtime/THIRD_PARTY_NOTICES.txt",
);
console.log(`Included notices for ${noticeCount} installed runtime packages.`);
console.log("Built studio, API, Electron main and bundled Skills.");
