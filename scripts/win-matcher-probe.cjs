const { FileMatcher } = require("app-builder-lib/out/fileMatcher");
const { Minimatch } = require("minimatch");
const path = require("path");
const cwd = process.cwd();
console.log("--- direct minimatch:");
console.log(
  "dist/** vs dist/desktop/main.cjs =",
  new Minimatch("dist/**", { dot: true }).match("dist/desktop/main.cjs"),
);
console.log("--- FileMatcher filter:");
const m = new FileMatcher(
  cwd,
  path.join(cwd, "release", "app"),
  (s) => s,
  ["dist/**", "package.json", "!dist/**/*.map"],
);
console.log("normalized patterns:", m.patterns);
const filter = m.createFilter();
const stat = { isDirectory: () => false };
for (const rel of [
  "dist/desktop/main.cjs",
  "dist/server.mjs",
  "dist/studio/index.html",
  "package.json",
]) {
  console.log(rel, "=>", filter(path.join(cwd, rel), stat));
}
console.log("--- dir partial matches:");
const dirstat = { isDirectory: () => true };
for (const rel of ["dist", "dist/desktop"]) {
  console.log(rel, "=>", filter(path.join(cwd, rel), dirstat));
}

// Replicate production walk: builder-util walk + filter, same as appFileCopier
(async () => {
  const { walk } = await import("builder-util/out/fs.js");
  const found = [];
  await walk(
    cwd,
    (file, stat) => filter(file, stat),
    {
      consume: (file, stat) => {
        if (file.includes(`${path.sep}dist${path.sep}`)) found.push(file);
      },
      isIncludeDir: false,
    },
  );
  console.log("--- walked dist entries:", found.length);
  console.log(found.slice(0, 8).join("\n"));
})();

