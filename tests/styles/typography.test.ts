import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appFontStack =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

const rootStyleFiles = [
  "src/capture/styles.css",
  "src/popup/styles.css",
  "src/settings/styles.css",
  "src/store-preview/styles.css"
];

describe("typography styling", () => {
  it("uses a modern cross-platform system font stack for app UI text", () => {
    for (const path of rootStyleFiles) {
      const source = readFileSync(path, "utf8");

      expect(source).toContain(`font-family: ${appFontStack};`);
      expect(source).not.toContain('"SF Pro Display"');
      expect(source).not.toContain('"SF Pro Text"');
    }

    const contentSource = readFileSync("src/content/index.ts", "utf8");

    expect(contentSource).toContain(appFontStack);
    expect(contentSource).not.toContain("SF Pro Display");
    expect(contentSource).not.toContain("SF Pro Text");
  });
});
