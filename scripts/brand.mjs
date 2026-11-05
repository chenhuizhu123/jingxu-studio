import sharp from "sharp";
import { mkdir, readFile } from "node:fs/promises";
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="224" fill="#284d37"/><rect x="240" y="360" width="544" height="424" rx="42" fill="none" stroke="#c8dfa7" stroke-width="35"/><path d="M240 352l522-126 29 122-522 126z" fill="#c8dfa7"/><path d="M345 327l93 101m77-141 93 101m77-142 93 101" stroke="#284d37" stroke-width="32"/><path d="M443 523l172 101-172 101z" fill="#c8dfa7"/></svg>';
await mkdir("resources", { recursive: true });
await sharp(Buffer.from(svg)).png().toFile("resources/icon.png");
const root = "apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset";
const icons = JSON.parse(await readFile(`${root}/Contents.json`, "utf8"));
for (const icon of icons.images) {
  if (!icon.filename) continue;
  const size =
    Number(icon.size.split("x")[0]) * Number(icon.scale.replace("x", ""));
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(`${root}/${icon.filename}`);
}
for (const [density, size] of [
  ["mdpi", 48],
  ["hdpi", 72],
  ["xhdpi", 96],
  ["xxhdpi", 144],
  ["xxxhdpi", 192],
]) {
  const root = `apps/mobile/android/app/src/main/res/mipmap-${density}`;
  await mkdir(root, { recursive: true });
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(`${root}/ic_launcher.png`);
}
console.log("Original Jingxu icons generated for Electron and Flutter.");
