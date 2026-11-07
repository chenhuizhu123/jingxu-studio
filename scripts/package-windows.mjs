import { spawn } from "node:child_process";
import {
  cp,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { writeThirdPartyNotices } from "./third-party-notices.mjs";
import { inspectPe, verifyWindowsPackage } from "./verify-windows-package.mjs";

const root = resolve("."),
  artifacts = join(root, "artifacts");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
async function run(binary, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${binary} exited with ${code}`)),
    );
  });
}
async function sha256(file) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest("hex");
}
if (process.platform === "win32")
  throw new Error(
    "On Windows, use npm run package:win and npm run test:package.",
  );
await mkdir(artifacts, { recursive: true });
const reuseIndex = process.argv.indexOf("--reuse-stage");
const stage =
  reuseIndex >= 0
    ? resolve(process.argv[reuseIndex + 1] ?? "")
    : await mkdtemp(join(artifacts, "windows-package-"));
if (reuseIndex >= 0) {
  if (
    !stage.startsWith(artifacts + sep) ||
    !basename(stage).startsWith("windows-package-")
  )
    throw new Error(
      "Only this project's owned Windows staging directories can be reused.",
    );
  const marker = JSON.parse(
    await readFile(join(stage, "jingxu-windows-staging.json"), "utf8"),
  );
  if (marker.target !== "win32-x64" || marker.version !== pkg.version)
    throw new Error("Staging target/version mismatch.");
  for (const name of ["package.json", "package-lock.json"]) {
    if ((await sha256(join(stage, name))) !== (await sha256(join(root, name))))
      throw new Error(`Staging ${name} changed; create a new stage.`);
  }
  console.log(`Reusing verified Windows dependencies in ${stage}`);
} else {
  console.log(`Preparing isolated Windows dependencies in ${stage}`);
  for (const name of ["package.json", "package-lock.json"])
    await copyFile(join(root, name), join(stage, name));
  await run(
    "npm",
    [
      "ci",
      "--omit=dev",
      "--include=optional",
      "--os=win32",
      "--cpu=x64",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
    ],
    { cwd: stage },
  );
  // Use the pinned upstream install script and its target-platform variables.
  // It downloads Windows FFmpeg and its license, without executing the binary.
  await run(
    process.execPath,
    [join(stage, "node_modules/ffmpeg-static/install.js")],
    {
      cwd: stage,
      env: {
        ...process.env,
        npm_config_platform: "win32",
        npm_config_arch: "x64",
      },
    },
  );
}
await inspectPe(join(stage, "node_modules/ffmpeg-static/ffmpeg.exe"));
// ffprobe-static bundles its Windows binary in the npm package; no install
// script is needed, but verify the staged copy before packaging.
await inspectPe(
  join(stage, "node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe"),
);
await rm(join(stage, "dist"), { recursive: true, force: true });
await cp(join(root, "dist"), join(stage, "dist"), { recursive: true });
await writeThirdPartyNotices(
  join(stage, "dist/runtime/THIRD_PARTY_NOTICES.txt"),
  join(stage, "package.json"),
);
await writeFile(
  join(stage, "jingxu-windows-staging.json"),
  JSON.stringify({ version: pkg.version, target: "win32-x64" }),
);
await run(
  process.execPath,
  [
    join(root, "node_modules/electron-builder/cli.js"),
    "--projectDir",
    stage,
    "--config",
    join(root, "electron-builder.yml"),
    "--win",
    "--x64",
    "--publish",
    "never",
    `-c.electronVersion=${pkg.devDependencies.electron}`,
    `-c.directories.output=${join(root, "release")}`,
    `-c.icon=${join(root, "resources/icon.png")}`,
    "-c.win.signExecutable=false",
  ],
  { cwd: root, env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" } },
);
const result = await verifyWindowsPackage(
  join(root, "release/win-unpacked"),
  pkg.version,
);
const installer = join(
  root,
  `release/Jingxu-Studio-${pkg.version}-win-x64.exe`,
);
await inspectPe(installer, 0x14c); // The NSIS installer is x86; the installed app is x64.
const ffmpegPkg = JSON.parse(
  await readFile(
    join(stage, "node_modules/ffmpeg-static/package.json"),
    "utf8",
  ),
);
const ffprobePkg = JSON.parse(
  await readFile(
    join(stage, "node_modules/ffprobe-static/package.json"),
    "utf8",
  ),
);
const report = {
  generatedAt: new Date().toISOString(),
  ...result,
  installer: { file: installer, sha256: await sha256(installer) },
  ffmpeg: {
    ...result.ffmpeg,
    release: ffmpegPkg[ffmpegPkg.name]["binary-release-tag"],
    sha256: await sha256(join(stage, "node_modules/ffmpeg-static/ffmpeg.exe")),
  },
  ffprobe: {
    ...result.ffprobe,
    release: ffprobePkg.version,
    sha256: await sha256(
      join(stage, "node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe"),
    ),
  },
};
await writeFile(
  join(root, "release/windows-package-check.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
