import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("content script bundle safety", () => {
  it("keeps the content script source self-contained for chrome.scripting injection", () => {
    const source = readFileSync("src/content/index.ts", "utf8");

    expect(source).not.toContain("from \"../background/messages\"");
    expect(source).toContain("open-capture-overlay");
    expect(source).toContain("capture-selection-result");
    expect(source).toContain("capture-status");
    expect(source).not.toContain("open-import-overlay");
  });
});
