import { mkdir, writeFile } from "node:fs/promises";
import manifest from "../manifest.config";

await mkdir("public", { recursive: true });
await writeFile("public/manifest.json", JSON.stringify(manifest, null, 2));
