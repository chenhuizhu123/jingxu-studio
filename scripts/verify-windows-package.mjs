import assert from "node:assert/strict";
import { open, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listPackage, extractFile } from "@electron/asar";

export async function inspectPe(filename, expected = 0x8664) {
  const file = await open(filename, "r");
  try {
    const dos = Buffer.alloc(64);
    assert.equal(
      (await file.read(dos, 0, 64, 0)).bytesRead,
      64,
      "Truncated DOS header",
    );
    assert.equal(
      dos.toString("ascii", 0, 2),
      "MZ",
      `Not a Windows executable: ${filename}`,
    );
    const header = Buffer.alloc(24);
    assert.equal(
      (await file.read(header, 0, 24, dos.readUInt32LE(60))).bytesRead,
      24,
    );
    assert.equal(header.readUInt32LE(0), 0x00004550, "Missing PE signature");
    assert.equal(
      header.readUInt16LE(4),
      expected,
      `Wrong machine type: ${filename}`,
    );
    return {
      architecture: expected === 0x8664 ? "x64" : "x86",
      bytes: (await file.stat()).size,
    };
  } finally {
    await file.close();
  }
}
async function nativeFiles(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const file = join(root, entry.name);
    if (entry.isDirectory()) result.push(...(await nativeFiles(file)));
    else if (entry.isFile() && /\.(node|dll)$/i.test(entry.name))
      result.push(file);
  }
  return result;
}
export async function verifyWindowsPackage(directory, version) {
  const archive = join(directory, "resources/app.asar");
  const entries = listPackage(archive).map((name) =>
    name.replaceAll("\\", "/").replace(/^\//, ""),
  );
  const metadata = JSON.parse(extractFile(archive, "package.json").toString());
  assert.equal(metadata.version, version);
  for (const file of [
    "dist/desktop/main.cjs",
    "dist/server.mjs",
    "dist/studio/index.html",
    "dist/runtime/samples/jingxu-rain-sample-zh.zip",
    "dist/runtime/samples/jingxu-rain-sample-en.zip",
  ]) {
    assert.deepEqual(
      extractFile(archive, file),
      await readFile(resolve(file)),
      `Stale packaged build: ${file}`,
    );
  }
  for (const file of await readdir(resolve("dist/studio/assets"))) {
    if (!file.endsWith(".map"))
      assert.deepEqual(
        extractFile(archive, `dist/studio/assets/${file}`),
        await readFile(resolve("dist/studio/assets", file)),
        `Stale studio asset: ${file}`,
      );
  }
  for (const name of [
    "@langchain/core",
    "@langchain/langgraph",
    "@modelcontextprotocol/sdk",
    "gray-matter",
    "sql.js",
    "yauzl",
    "yazl",
    "sharp",
  ]) {
    assert.ok(
      entries.includes(`node_modules/${name}/package.json`),
      `Missing packaged dependency: ${name}`,
    );
  }
  assert.ok(
    entries.includes("dist/runtime/package-smoke.cjs"),
    "Missing native-host verifier",
  );
  assert.ok(
    !entries.some((name) => /node_modules\/@img\/[^/]*darwin/.test(name)),
    "Mac image binaries leaked into the Windows package",
  );
  const notices = extractFile(
    archive,
    "dist/runtime/THIRD_PARTY_NOTICES.txt",
  ).toString();
  assert.ok(
    notices.includes("@img/sharp-win32-x64"),
    "Missing Windows image-library notices",
  );
  const unpacked = join(directory, "resources/app.asar.unpacked/node_modules");
  const engine = await inspectPe(join(directory, "镜序 Studio.exe"));
  const ffmpeg = await inspectPe(join(unpacked, "ffmpeg-static/ffmpeg.exe"));
  const imageFiles = await nativeFiles(join(unpacked, "@img"));
  assert.ok(
    imageFiles.some((name) => name.endsWith(".node")),
    "Missing Sharp Windows binding",
  );
  assert.ok(
    imageFiles.some((name) => name.endsWith(".dll")),
    "Missing Windows image-library DLLs",
  );
  for (const file of imageFiles) await inspectPe(file);
  return {
    version,
    target: "win32-x64",
    structure: "passed",
    engine,
    ffmpeg,
    imageBinaries: imageFiles.length,
    nativeExecution: "not run; requires Windows",
    guiAcceptance: "pending",
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  console.log(
    JSON.stringify(
      await verifyWindowsPackage(
        resolve(process.argv[2] ?? "release/win-unpacked"),
        pkg.version,
      ),
      null,
      2,
    ),
  );
}
