import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "../../manifest.config";

describe("extension manifest", () => {
  it("requests permissions needed by the MVP flows", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toContain("storage");
    expect(manifest.permissions).toContain("clipboardWrite");
    expect(manifest.permissions).toContain("activeTab");
    expect(manifest.permissions).toContain("scripting");
    expect(manifest.permissions).toContain("alarms");
    expect(manifest.permissions).not.toContain("tabs");
  });

  it("builds popup, capture, and settings extension pages", () => {
    const source = readFileSync("vite.config.ts", "utf8");

    expect(source).toContain('popup: "src/popup/index.html"');
    expect(source).toContain('capture: "src/capture/index.html"');
    expect(source).toContain('settings: "src/settings/index.html"');
    expect(source).not.toContain('import: "src/import/index.html"');
  });

  it("registers an options page in the manifest", () => {
    expect(manifest.options_ui?.page).toBe("src/settings/index.html");
  });
});
