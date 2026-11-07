import { build } from "esbuild";
import { mkdir, copyFile, cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { writeThirdPartyNotices } from "./third-party-notices.mjs";

// p-queue v10 is pure ESM. When left external in a CJS bundle, Node's
// require(esm) bridge combined with esbuild's __toESM wrapper yields
// `import_p_queue.default === <module namespace>`, so `new PQueue()` throws
// "not a constructor" and the Electron main process hangs before opening a
// window. Force these packages into the bundle instead.
const bundlePureEsmDeps = {
  name: "bundle-pure-esm-deps",
  setup(api) {
    api.onResolve({ filter: /^p-queue$/ }, (args) => ({
      path: fileURLToPath(import.meta.resolve(args.path)),
    }));
  },
};
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
  plugins: [bundlePureEsmDeps],
  sourcemap: true,
  define: {
    "process.env.JINGXU_BILLING_API_URL": JSON.stringify(
      process.env.JINGXU_BILLING_API_URL ?? "",
    ),
    "process.env.JINGXU_BILLING_ENFORCE": JSON.stringify(
      process.env.JINGXU_BILLING_ENFORCE ?? "",
    ),
  },
});
await build({
  entryPoints: ["apps/billing/src/worker.ts"],
  outfile: "dist/billing/worker.mjs",
  bundle: true,
  platform: "neutral",
  target: "es2023",
  format: "esm",
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
  plugins: [bundlePureEsmDeps],
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
