import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("feedback color semantics", () => {
  it("keeps popup duplicate feedback styled as a warning", () => {
    const source = readFileSync("src/popup/styles.css", "utf8");

    expect(source).toContain(".import-message.warning { background: #fff4df; color: #9a5b10; }");
  });

  it("keeps standalone import failure feedback on an AA-safe error palette", () => {
    const source = readFileSync("src/import/styles.css", "utf8");

    expect(source).toContain("background: #fef2f2;");
    expect(source).toContain("color: #991b1b;");
  });
});
