import { spawn, spawnSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import assert from "node:assert/strict";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { extractFile, listPackage } from "@electron/asar";
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
delete env.JINGXU_FFPROBE;
const archive = join(resources, "app.asar");
for (const entry of listPackage(archive)) {
  assert.match(
    entry,
    /^[/\\](?:dist|node_modules|package\.json)(?:[/\\]|$)/,
    `Unexpected file packaged in desktop app: ${entry}`,
  );
}
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
const mediaRoot = join(resources, "app.asar.unpacked", "node_modules");
const suffix = mac ? "" : ".exe";
const mediaLicenses = {};
for (const [name, file] of [
  ["ffmpeg", join(mediaRoot, "ffmpeg-static", `ffmpeg${suffix}`)],
  [
    "ffprobe",
    join(
      mediaRoot,
      "ffprobe-static",
      "bin",
      process.platform,
      process.arch,
      `ffprobe${suffix}`,
    ),
  ],
]) {
  const license = spawnSync(file, ["-L"], {
    encoding: "utf8",
    timeout: 10000,
    windowsHide: true,
  });
  if (license.error) throw license.error;
  assert.equal(license.status, 0, `${name} license inspection failed`);
  const details = `${license.stderr}\n${license.stdout}`;
  const configuration = details.match(/^\s*configuration: (.+)$/m)?.[1];
  assert.ok(
    configuration && license.stdout.trim(),
    `${name} license metadata missing`,
  );
  mediaLicenses[name] = {
    version: details.match(new RegExp(`^${name} version .+$`, "m"))?.[0],
    nonfree:
      /(?:^|\s)--enable-nonfree(?:\s|$)/.test(configuration) ||
      /not legally redistributable/i.test(details),
    license: license.stdout.trim(),
  };
}
const nonfree = Object.keys(mediaLicenses).filter(
  (name) => mediaLicenses[name].nonfree,
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
          mediaLicenses,
          mediaDistribution: nonfree.length
            ? "blocked-nonfree"
            : "source-and-license-review-required",
          guiAcceptance: "pending",
        },
        null,
        2,
      ) + "\n",
    );
    console.log(`Recorded package check: ${report}`);
    if (process.env.JINGXU_REQUIRE_REDISTRIBUTABLE_MEDIA === "1") {
      assert.equal(
        nonfree.length,
        0,
        `Distribution blocked: bundled ${nonfree.join(", ")} was built with nonfree components`,
      );
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
});
