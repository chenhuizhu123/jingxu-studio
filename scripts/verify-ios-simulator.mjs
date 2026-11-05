import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve, relative, join } from "node:path";

assert.equal(
  process.platform,
  "darwin",
  "iOS Simulator artifacts require a macOS build host.",
);
const root = resolve(".");
const pubspec = await readFile("apps/mobile/pubspec.yaml", "utf8");
const match = pubspec.match(/^version:\s*([^+\s]+)\+(\d+)/m);
assert.ok(match, "Mobile version/build missing");
const [, version, buildNumber] = match;
const app = resolve(
  process.argv[2] ?? "apps/mobile/build/ios/iphonesimulator/Runner.app",
);
const metadata = JSON.parse(
  execFileSync(
    "plutil",
    ["-convert", "json", "-o", "-", join(app, "Info.plist")],
    { encoding: "utf8" },
  ),
);
assert.equal(
  metadata.CFBundleShortVersionString,
  version,
  "Stale simulator app version",
);
assert.equal(
  metadata.CFBundleVersion,
  buildNumber,
  "Stale simulator app build",
);
assert.deepEqual(
  metadata.CFBundleSupportedPlatforms,
  ["iPhoneSimulator"],
  "This verifier only distributes Simulator apps",
);
const architectures = execFileSync(
  "lipo",
  ["-archs", join(app, metadata.CFBundleExecutable)],
  { encoding: "utf8" },
)
  .trim()
  .split(/\s+/);
assert.ok(architectures.every((a) => ["arm64", "x86_64"].includes(a)));
await mkdir("release/checks", { recursive: true });
const target = resolve(
  `release/Jingxu-Studio-${version}-ios-simulator-preview.zip`,
);
execFileSync("ditto", [
  "-c",
  "-k",
  "--sequesterRsrc",
  "--keepParent",
  app,
  target,
]);
const hash = createHash("sha256");
for await (const bytes of createReadStream(target)) hash.update(bytes);
const result = {
  generatedAt: new Date().toISOString(),
  version,
  buildNumber,
  platforms: metadata.CFBundleSupportedPlatforms,
  architectures,
  file: relative(root, target),
  bytes: (await stat(target)).size,
  sha256: hash.digest("hex"),
  artifactKind: "iOS Simulator app",
  iphoneInstallable: false,
  nativeExecution: "not run",
  guiAcceptance: "pending",
};
await writeFile(
  `release/checks/ios-simulator-${version}.json`,
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
