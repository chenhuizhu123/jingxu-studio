import { readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

// Traverse installed runtime dependencies without executing their code.
export async function writeThirdPartyNotices(
  destination,
  packageFile = resolve("package.json"),
) {
  const root = resolve(packageFile);
  const rootPackage = JSON.parse(await readFile(root, "utf8"));
  const visited = new Set(),
    entries = [];
  async function visit(name, parent) {
    const require = createRequire(parent);
    const candidates = (require.resolve.paths(name) ?? []).map((dir) =>
      join(dir, name, "package.json"),
    );
    const file = candidates.find(existsSync);
    if (!file || visited.has(file)) return;
    visited.add(file);
    const pkg = JSON.parse(await readFile(file, "utf8"));
    const section = [
      `${pkg.name} ${pkg.version}`,
      `License: ${typeof pkg.license === "string" ? pkg.license : JSON.stringify(pkg.license ?? "See upstream notices")}`,
    ];
    if (pkg.repository)
      section.push(
        `Source: ${typeof pkg.repository === "string" ? pkg.repository : pkg.repository.url}`,
      );
    const notices = (await readdir(dirname(file)))
      .filter((name) =>
        /^(licen[cs]e|copying|notice|third[-_]party[-_]notices?)(\.|$)/i.test(
          name,
        ),
      )
      .sort();
    for (const notice of notices) {
      const content = await readFile(join(dirname(file), notice), "utf8").catch(
        () => "",
      );
      if (content) section.push(`\n${notice}\n${content}`);
    }
    entries.push({
      name: `${pkg.name}@${pkg.version}`,
      text: section.join("\n"),
    });
    for (const dependency of Object.keys({
      ...pkg.dependencies,
      ...pkg.optionalDependencies,
      ...pkg.peerDependencies,
    })) {
      await visit(dependency, file);
    }
  }
  for (const name of Object.keys(rootPackage.dependencies))
    await visit(name, root);
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const header =
    "Jingxu Studio — third-party runtime notices\nGenerated from installed packages.\nElectron runtime notices and font OFL notices are shipped separately.\nFFmpeg binary licensing and corresponding-source obligations require artifact-specific handling; this inventory is not a substitute.\n\n";
  await writeFile(
    destination,
    header +
      entries.map((e) => e.text).join("\n\n------------------------------\n\n"),
  );
  return entries.length;
}
