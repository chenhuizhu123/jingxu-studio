import { spawn } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import assert from "node:assert/strict";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { extractFile } from "@electron/asar";
const mac = process.platform === "darwin";
if (!mac && process.platform !== "win32")
  throw new Error("Run this check on a native macOS or Windows package host.");
const binary = resolve(
  process.argv[2] ??
    (mac
      ? "release/mac-arm64/镜序 Studio.app/Contents/MacOS/镜序 Studio"
      : "release/win-unpacked/镜序 Studio.exe"),
);
const resources = mac
  ? resolve(dirname(binary), "../Resources")
  : join(dirname(binary), "resources");
const env = { ...process.env, ELECTRON_RUN_AS_NODE: "1" };
delete env.JINGXU_FFMPEG;
const archive = join(resources, "app.asar");
// @electron/asar resolves entries with the host path separator, so the
// names passed to extractFile must use path.join on Windows too.
const asarPath = (...parts) => join(...parts);
const version = JSON.parse(await readFile("package.json", "utf8")).version;
assert.equal(
  JSON.parse(extractFile(archive, "package.json").toString()).version,
  version,
  "Packaged version does not match the current source version",
);
for (const file of [
  "dist/desktop/main.cjs",
  "dist/server.mjs",
  "dist/studio/index.html",
  "dist/runtime/samples/jingxu-rain-sample-zh.zip",
  "dist/runtime/samples/jingxu-rain-sample-en.zip",
]) {
  assert.deepEqual(
    extractFile(archive, asarPath(...file.split("/"))),
    await readFile(resolve(file)),
    `Packaged build is stale: ${file}`,
  );
}
for (const file of await readdir(resolve("dist/studio/assets"))) {
  if (!file.endsWith(".map"))
    assert.deepEqual(
      extractFile(archive, asarPath("dist", "studio", "assets", file)),
      await readFile(resolve("dist/studio/assets", file)),
      `Packaged studio asset is stale: ${file}`,
    );
}
const report = resolve(
  process.argv[3] ??
    (mac
      ? "release/mac-package-check.json"
      : "release/windows-runtime-check.json"),
);
let output = "";
const child = spawn(
  binary,
  [join(resources, "app.asar", "dist", "runtime", "package-smoke.cjs")],
  { stdio: ["ignore", "pipe", "inherit"], env },
);
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
  process.stdout.write(chunk);
});
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("close", async (code) => {
  process.exitCode = code ?? 1;
  if (code !== 0) return;
  try {
    const result = JSON.parse(output.trim());
    assert.equal(result.result, "passed");
    const hash = createHash("sha256");
    for await (const bytes of createReadStream(archive)) hash.update(bytes);
    await mkdir(dirname(report), { recursive: true });
    await writeFile(
      report,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          version,
          target: `${process.platform}-${process.arch}`,
          mode: "electron-node-no-ui",
          archiveSha256: hash.digest("hex"),
          ...result,
          guiAcceptance: "pending",
        },
        null,
        2,
      ) + "\n",
    );
    console.log(`Recorded package check: ${report}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
});
