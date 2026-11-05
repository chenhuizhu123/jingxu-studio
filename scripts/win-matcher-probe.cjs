const {
  FileMatcher,
  getMainFileMatchers,
} = require("app-builder-lib/out/fileMatcher");
const { AppFileWalker } = require("app-builder-lib/out/util/AppFileWalker");
const path = require("path");
const cwd = process.cwd();
const destination = path.join(cwd, "release", "win-unpacked", "resources", "app");
const files = ["dist/**", "package.json", "!dist/**/*.map"];
const config = { files, includePdb: false };
const packager = {
  config,
  projectDir: cwd,
  buildResourcesDir: "build",
  isPrepackedAppAsar: false,
  debugLogger: { isEnabled: false, add() {} },
  areNodeModulesHandledExternally: true,
};
const platformPackager = { info: packager, platform: "win32" };
const matchers = getMainFileMatchers(
  cwd,
  destination,
  (s) => s,
  { files },
  platformPackager,
  path.join(cwd, "release"),
  false,
);
for (const matcher of matchers) {
  console.log("=== matcher from:", matcher.from);
  console.log("patterns:", JSON.stringify(matcher.patterns, null, 2));
  const walker = new AppFileWalker(matcher, packager);
  const stat = { isDirectory: () => false };
  for (const rel of [
    "dist/desktop/main.cjs",
    "dist/server.mjs",
    "dist/studio/index.html",
  ]) {
    const f = path.join(cwd, rel);
    console.log("file filter", rel, "=>", walker.filter(f, stat));
  }
  const dirstat = { isDirectory: () => true };
  for (const rel of ["dist", "dist/desktop", "dist/runtime"]) {
    const f = path.join(cwd, rel);
    console.log(
      "dir consume",
      rel,
      "=> returns(true=skip):",
      walker.consume(f, dirstat),
    );
  }
}
