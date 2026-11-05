import { z } from "zod";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { projectManifestSchema } from "../packages/core/src/project-package";
const schema = z.toJSONSchema(projectManifestSchema, { target: "draft-7" });
const text = JSON.stringify(schema, null, 2) + "\n";
if (process.argv.includes("--check")) {
  for (const filename of [
    "packages/shared/contracts/project-package.schema.json",
    "apps/mobile/assets/project-package.schema.json",
  ]) {
    if ((await readFile(filename, "utf8")) !== text)
      throw new Error(`Project schema is stale: ${filename}`);
  }
  console.log(
    "Shared desktop/mobile package schemas match the current contract.",
  );
  process.exit(0);
}
await mkdir("packages/shared/contracts", { recursive: true });
await writeFile("packages/shared/contracts/project-package.schema.json", text);
await writeFile("apps/mobile/assets/project-package.schema.json", text);
console.log("Project package schema generated for TypeScript and Flutter.");
