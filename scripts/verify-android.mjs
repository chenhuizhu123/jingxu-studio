import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = resolve("."),
  windows = process.platform === "win32";
const sdk =
  process.env.ANDROID_HOME ??
  process.env.ANDROID_SDK_ROOT ??
  join(root, "artifacts/android-sdk");
const versions = (await readdir(join(sdk, "build-tools")))
  .filter((name) => /^\d+\.\d+\.\d+$/.test(name))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
assert.ok(
  versions.length,
  "Install Android SDK build-tools before checking the APK.",
);
const tools = join(sdk, "build-tools", versions.at(-1));
const java = process.env.JAVA_HOME
  ? join(process.env.JAVA_HOME, "bin", windows ? "java.exe" : "java")
  : "java";
const source = resolve(
  process.argv[2] ??
    "apps/mobile/build/app/outputs/flutter-apk/app-arm64-v8a-release.apk",
);
const pubspec = await readFile("apps/mobile/pubspec.yaml", "utf8");
const version = pubspec.match(/^version:\s*([^+\s]+)/m)?.[1];
assert.ok(version, "Mobile version missing from pubspec.yaml");
assert.ok(
  (await readFile("apps/mobile/lib/build_version.dart", "utf8")).includes(
    `const jingxuVersion = '${version}';`,
  ),
  "Dart display version does not match pubspec.yaml",
);
const signing = execFileSync(
  java,
  [
    "-jar",
    join(tools, "lib/apksigner.jar"),
    "verify",
    "--verbose",
    "--print-certs",
    source,
  ],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
);
assert.ok(
  signing.includes("Verified using v2 scheme (APK Signature Scheme v2): true"),
  "APK v2 signature verification failed",
);
const metadata = execFileSync(
  join(tools, windows ? "aapt.exe" : "aapt"),
  ["dump", "badging", source],
  { encoding: "utf8" },
);
assert.equal(
  metadata.match(/versionName='([^']+)'/)?.[1],
  version,
  "Stale APK version",
);
const abis = [
  ...(metadata.match(/^native-code:(.+)$/m)?.[1] ?? "").matchAll(/'([^']+)'/g),
].map((match) => match[1]);
assert.ok(abis.includes("arm64-v8a"), "APK does not contain ARM64 support");
await mkdir("release/checks", { recursive: true });
const previous = "release/android-package-check.json";
if (existsSync(previous)) {
  const report = JSON.parse(await readFile(previous, "utf8"));
  const saved = `release/checks/android-${report.version}.json`;
  if (!existsSync(saved)) await copyFile(previous, saved);
}
const target = resolve(
  `release/Jingxu-Studio-${version}-android-${abis.length === 1 ? "arm64" : "universal"}-preview.apk`,
);
await copyFile(source, target);
const hash = createHash("sha256");
for await (const bytes of createReadStream(target)) hash.update(bytes);
const result = {
  generatedAt: new Date().toISOString(),
  version,
  versionCode: metadata.match(/versionCode='(\d+)'/)?.[1],
  file: relative(root, target),
  target: abis.length === 1 ? "android-arm64" : "android-universal",
  abis,
  minimumSdk: metadata.match(/sdkVersion:'(\d+)'/)?.[1],
  targetSdk: metadata.match(/targetSdkVersion:'(\d+)'/)?.[1],
  signatureVerified: true,
  signer: signing.match(/Signer #1 certificate DN: (.+)/)?.[1],
  productionSigned: false,
  bytes: (await stat(target)).size,
  sha256: hash.digest("hex"),
  nativeExecution: "not run; no attached Android device",
  guiAcceptance: "pending",
};
const text = JSON.stringify(result, null, 2) + "\n";
await writeFile(previous, text);
await writeFile(`release/checks/android-${version}.json`, text);
console.log(text);
