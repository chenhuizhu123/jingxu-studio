import { chmod, copyFile, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  addVersion,
  buildStoryboard,
  createProject,
  id,
  now,
} from "../packages/core/src/model";
import { exportProjectPackage } from "../packages/core/src/package-archive";
import { Store } from "../packages/core/src/store";

const stories = {
  zh: {
    name: "雨夜来信",
    description: "三镜头竖屏示例。含演示插画和台词字幕，无需 API Key。",
    style: "雨夜青绿色调",
    script:
      "角色：林晚、陈序\n雨夜，便利店的灯还亮着。\n林晚：你为什么现在才来？\n陈序递来一封没有署名的信。",
    scene: "旧城便利店 · 雨夜",
    reply: "因为这封信今晚才送到。",
  },
  en: {
    name: "Letters in the Rain",
    description:
      "Three vertical shots with sample illustrations and dialogue captions. No API key required.",
    style: "Rainy night in teal",
    script:
      "Cast: Maya, Sam\nThe last bus leaves a rain-soaked street.\nMaya: Why did you come back?\nSam hands her an unsigned letter.",
    scene: "Corner store · Rainy night",
    reply: "The letter arrived tonight.",
  },
} as const;

const output = resolve("apps/website/src/samples");
const root = await mkdtemp(join(tmpdir(), "jingxu-site-sample-"));
let store: Store | undefined;
try {
  store = await Store.open(root);
  await mkdir(output, { recursive: true });
  for (const language of ["zh", "en"] as const) {
    const { scene, reply, ...story } = stories[language];
    const project = createProject({ ...story, format: "9:16" });
    buildStoryboard(project, language);
    for (const [index, shot] of project.shots.entries()) {
      const file = `media/${id()}.png`;
      const path = store.path(file);
      await copyFile(`apps/mobile/assets/demo-${index + 1}.png`, path);
      shot.scene = scene;
      shot.duration = 4;
      if (index === 2) shot.dialogue = reply;
      addVersion(
        project,
        shot.id,
        {
          id: id(),
          file,
          kind: "image",
          name: `Demo ${index + 1}.png`,
          mime: "image/png",
          size: (await stat(path)).size,
          createdAt: now(),
        },
        shot.prompt,
        "demo",
        "demo",
      );
    }
    for (const [index, character] of project.characters.entries()) {
      character.referenceId = project.assets[index].id;
    }
    const archive = await exportProjectPackage(store, project);
    const filename = `jingxu-rain-sample-${language}.zip`;
    await copyFile(store.path(archive.file), join(output, filename));
    await chmod(join(output, filename), 0o644);
    console.log(filename, (await stat(join(output, filename))).size, "bytes");
  }
} finally {
  store?.close();
  await rm(root, { recursive: true, force: true });
}
