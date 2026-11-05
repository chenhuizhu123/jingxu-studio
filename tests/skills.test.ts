import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import matter from "gray-matter";
import { readSkills } from "../packages/core/src/agent";
import { Store } from "../packages/core/src/store";

let store: Store | undefined;
afterEach(async () => {
  if (!store) return;
  const root = store.root;
  store.close();
  store = undefined;
  await rm(root, { recursive: true, force: true });
});
async function setup() {
  store = await Store.open(await mkdtemp(join(tmpdir(), "jingxu-skills-")));
  const builtin = join(store.root, "builtin");
  await mkdir(builtin);
  return { builtin, custom: join(store.root, "skills") };
}
describe("Open-source skill compatibility", () => {
  it("loads flat files and standard SKILL.md folders with YAML multiline descriptions", async () => {
    const { builtin, custom } = await setup();
    await writeFile(
      join(builtin, "repair.md"),
      matter.stringify("Read project first.", {
        name: "Repair",
        description: "Check: faces, scenes and timing.\nKeep prior candidates.",
      }),
    );
    await mkdir(join(custom, "brand"));
    await writeFile(
      join(custom, "brand", "SKILL.md"),
      "---\nname: brand\ndescription: >\n  Keep a consistent voice\n  across short videos.\n---\n\nRead references/voice.md as guidance.",
    );
    const skills = await readSkills(store!, builtin);
    expect(skills.map((s) => s.id).sort()).toEqual(["brand", "repair"]);
    expect(skills.find((s) => s.id === "brand")).toMatchObject({
      builtin: false,
      description: "Keep a consistent voice across short videos.\n",
    });
    expect(skills.find((s) => s.id === "repair")?.description).toContain(
      "Check: faces",
    );
  });
  it("preserves old preview skills whose metadata used literal newline separators", async () => {
    const { builtin, custom } = await setup();
    await writeFile(
      join(custom, "legacy.md"),
      "---\\nname: legacy\\ndescription: Keep versions\\n---\\nRead project.\nThen repair.",
    );
    const [skill] = await readSkills(store!, builtin);
    expect(skill.name).toBe("legacy");
    expect(skill.content).toContain("\nRead project.\nThen repair.");
  });
  it("skips invalid and oversized files without hiding healthy skills or executing JS metadata", async () => {
    const { builtin, custom } = await setup();
    await writeFile(
      join(custom, "ok.md"),
      matter.stringify("Instructions", { name: "ok", description: "Okay" }),
    );
    await writeFile(
      join(custom, "invalid.md"),
      "---\nname: [bad yaml\n---\nText",
    );
    await writeFile(
      join(custom, "no-description.md"),
      "---\nname: missing\n---\nText",
    );
    await writeFile(
      join(custom, "empty.md"),
      matter.stringify("", { name: "empty", description: "Empty" }),
    );
    await writeFile(join(custom, "large.md"), "x".repeat(50_001));
    await writeFile(
      join(custom, "code.md"),
      "---javascript\n(globalThis.__skillExecuted = true)\n---\nText",
    );
    await symlink(join(custom, "ok.md"), join(custom, "linked.md"));
    expect((await readSkills(store!, builtin)).map((s) => s.id)).toEqual([
      "ok",
    ]);
    expect((globalThis as any).__skillExecuted).toBeUndefined();
  });
  it("allows an explicitly saved custom skill to override the bundled copy", async () => {
    const { builtin, custom } = await setup();
    for (const [root, name] of [
      [builtin, "Bundled"],
      [custom, "Custom"],
    ]) {
      await writeFile(
        join(root, "repair.md"),
        matter.stringify("Instructions", { name, description: "Repair" }),
      );
    }
    expect(await readSkills(store!, builtin)).toMatchObject([
      { id: "repair", name: "Custom", builtin: false },
    ]);
  });
});
