import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("feedback color semantics", () => {
  it("keeps popup duplicate feedback styled as a warning", () => {
    const source = readFileSync("src/popup/styles.css", "utf8");

    expect(source).toContain(
      ".import-message.warning { background: var(--color-warning-soft); color: var(--color-warning); }"
    );
  });

  it("keeps standalone import failure feedback on an AA-safe error palette", () => {
    const source = readFileSync("src/import/styles.css", "utf8");

    expect(source).toContain("background: var(--color-danger-soft);");
    expect(source).toContain("color: var(--color-danger-text);");
  });
});
