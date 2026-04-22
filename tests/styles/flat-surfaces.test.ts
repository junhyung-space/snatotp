import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styleFiles = [
  "src/capture/styles.css",
  "src/import/styles.css",
  "src/popup/styles.css",
  "src/settings/styles.css",
  "src/store-preview/styles.css"
];

describe("flat surface styling", () => {
  it("keeps app styles free of gradients, shadows, and backdrop blur", () => {
    const combinedStyles = styleFiles
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(combinedStyles).not.toContain("linear-gradient");
    expect(combinedStyles).not.toContain("radial-gradient");
    expect(combinedStyles).not.toContain("box-shadow");
    expect(combinedStyles).not.toContain("drop-shadow");
    expect(combinedStyles).not.toContain("backdrop-filter");
  });
});
