import { cp, rm } from "node:fs/promises";
await rm("website/src", { recursive: true, force: true });
await cp("apps/website/src", "website/src", { recursive: true });
await cp("apps/website/build.mjs", "website/build.mjs");
console.log("Canonical website staged for the private Sites deployment.");
