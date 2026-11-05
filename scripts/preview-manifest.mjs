import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = resolve("."),
  version = JSON.parse(await readFile("package.json", "utf8")).version;
const macApp = resolve(process.argv[2] ?? "release/mac-arm64/镜序 Studio.app");
const macDirectory = resolve(macApp, "../..");
async function sha256(file) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest("hex");
}
const read = async (name) =>
  JSON.parse(await readFile(join(root, "release", name), "utf8"));
const mac = await read("mac-package-check.json"),
  windows = await read("windows-package-check.json"),
  android = await read("android-package-check.json");
for (const report of [mac, windows])
  assert.equal(report.version, version, "Artifact report version mismatch");
assert.equal(mac.result, "passed");
assert.equal(
  mac.archiveSha256,
  await sha256(join(macApp, "Contents/Resources/app.asar")),
);
assert.equal(windows.structure, "passed");
assert.equal(android.signatureVerified, true);
const paths = [
  {
    file: join(macDirectory, `Jingxu-Studio-${version}-mac-arm64.dmg`),
    target: "macos-arm64",
    checks: "mac-package-check.json",
  },
  {
    file: join(macDirectory, `Jingxu-Studio-${version}-mac-arm64.zip`),
    target: "macos-arm64",
    checks: "mac-package-check.json",
  },
  {
    file: resolve(`release/Jingxu-Studio-${version}-win-x64.exe`),
    target: "windows-x64",
    checks: "windows-package-check.json",
  },
  {
    file: resolve(
      android.file ??
        `release/Jingxu-Studio-${android.version}-android-arm64-preview.apk`,
    ),
    target: android.target,
    checks: "android-package-check.json",
  },
];
const mobileVersion = (
  await readFile("apps/mobile/pubspec.yaml", "utf8")
).match(/^version:\s*([^+\s]+)/m)?.[1];
let ios;
try {
  ios = await read(`checks/ios-simulator-${mobileVersion}.json`);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (ios) {
  assert.equal(ios.version, mobileVersion);
  assert.deepEqual(ios.platforms, ["iPhoneSimulator"]);
  assert.equal(ios.iphoneInstallable, false);
  paths.push({
    file: resolve(ios.file),
    target: "ios-simulator",
    checks: `checks/ios-simulator-${ios.version}.json`,
  });
}
const artifacts = [];
for (const entry of paths) {
  const hash = await sha256(entry.file);
  if (entry.target === "windows-x64")
    assert.equal(hash, windows.installer.sha256);
  if (entry.target.startsWith("android-")) assert.equal(hash, android.sha256);
  if (entry.target === "ios-simulator") assert.equal(hash, ios.sha256);
  artifacts.push({
    file: relative(root, entry.file),
    target: entry.target,
    bytes: (await stat(entry.file)).size,
    sha256: hash,
    checks: `release/${entry.checks}`,
    preview: true,
    productionSigned: false,
  });
}
const manifest = {
  generatedAt: new Date().toISOString(),
  versions: {
    macos: mac.version,
    windows: windows.version,
    android: android.version,
    iosSimulator: ios?.version,
  },
  guiAcceptance: "pending",
  nativeExecution: {
    macos: "core engine passed in Electron Node mode; no UI",
    windows: "not run; preview authorized by user",
    android: "not run; no attached device",
    ios: "no signed device release",
  },
  artifacts,
};
await writeFile(
  "release/preview-manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      versions: manifest.versions,
      files: artifacts.map((entry) => ({
        file: entry.file,
        bytes: entry.bytes,
      })),
    },
    null,
    2,
  ),
);
