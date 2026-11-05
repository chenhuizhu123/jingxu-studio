import { mkdir, writeFile } from "node:fs/promises";
import { posterSvg } from "../packages/core/src/media";
await mkdir("website/src/assets", { recursive: true });
for (let i = 0; i < 4; i++)
  await writeFile(`website/src/assets/scene-${i + 1}.svg`, posterSvg(i));
await writeFile(
  "website/src/assets/mark.svg",
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="15" fill="#284d37"/><path d="M16 22h32v29H16zM16 14h32v9H16z" fill="none" stroke="#c8dfa7" stroke-width="3"/><path d="M22 14l6 9m6-9 6 9" stroke="#c8dfa7" stroke-width="3"/></svg>',
);
