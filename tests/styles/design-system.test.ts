import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styleFiles = [
  "src/capture/styles.css",
  "src/import/styles.css",
  "src/popup/styles.css",
  "src/settings/styles.css",
  "src/store-preview/styles.css"
];

const requiredTokens = [
  "--font-ui",
  "--font-code",
  "--color-bg-app",
  "--color-surface",
  "--color-surface-subtle",
  "--color-surface-hover",
  "--color-border-subtle",
  "--color-border-card",
  "--color-text-primary",
  "--color-text-secondary",
  "--color-text-muted",
  "--color-accent",
  "--color-success",
  "--color-warning",
  "--color-danger",
  "--space-1",
  "--space-2",
  "--space-3",
  "--space-4",
  "--radius-control",
  "--radius-card",
  "--radius-panel",
  "--radius-dialog",
  "--radius-pill",
  "--font-size-caption",
  "--font-size-label",
  "--font-size-body",
  "--font-size-title",
  "--font-size-display",
  "--otp-card-height",
  "--otp-card-height-compact"
];

describe("design system tokens", () => {
  it("defines shared tokens for app surfaces, typography, spacing, and density", () => {
    const tokenSource = readFileSync("src/styles/tokens.css", "utf8");

    for (const token of requiredTokens) {
      expect(tokenSource).toContain(`${token}:`);
    }
  });

  it("connects every app stylesheet to the shared token file", () => {
    for (const path of styleFiles) {
      const source = readFileSync(path, "utf8");

      expect(source.startsWith('@import "../styles/tokens.css";')).toBe(true);
    }
  });

  it("uses tokenized primitives for popup surfaces and typography", () => {
    const popupStyles = readFileSync("src/popup/styles.css", "utf8");
    const popupShellBlock = popupStyles.slice(
      popupStyles.indexOf(".popup-shell {"),
      popupStyles.indexOf(".locked-shell {")
    );
    const entryRowBlock = popupStyles.slice(
      popupStyles.indexOf("\n.entry-row {") + 1,
      popupStyles.indexOf(".density-compact .entry-row {")
    );

    expect(popupStyles).toContain("font-family: var(--font-ui);");
    expect(popupStyles).toContain("font-family: var(--font-code);");
    expect(popupShellBlock).toContain("background: var(--color-bg-app);");
    expect(entryRowBlock).toContain("min-height: var(--otp-card-height);");
    expect(entryRowBlock).toContain("border-radius: var(--radius-card);");
    expect(entryRowBlock).toContain("border: 1px solid var(--color-border-card);");
    expect(entryRowBlock).toContain("background: var(--color-surface);");
  });
});
