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
  "--color-info",
  "--color-info-soft",
  "--color-info-border",
  "--color-success",
  "--color-success-strong",
  "--color-warning",
  "--color-warning-dot",
  "--color-danger",
  "--color-danger-strong",
  "--color-danger-text",
  "--color-danger-action",
  "--color-danger-action-soft",
  "--color-danger-border",
  "--color-danger-dot",
  "--color-focus-ring",
  "--color-overlay",
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
  "--font-size-body-xl",
  "--font-size-title-sm",
  "--font-size-title",
  "--font-size-title-lg",
  "--font-size-title-xl",
  "--font-size-display-sm",
  "--font-size-display",
  "--otp-card-height",
  "--otp-card-height-compact",
  "--otp-card-padding-y",
  "--otp-card-padding-x",
  "--otp-card-padding-y-compact",
  "--otp-card-row-gap",
  "--otp-card-column-gap",
  "--otp-card-code-row-offset",
  "--otp-card-code-row-offset-compact",
  "--otp-code-size-compact",
  "--otp-marker-size",
  "--otp-marker-size-compact",
  "--otp-marker-font-size",
  "--otp-marker-font-size-compact"
];

describe("design system tokens", () => {
  it("defines shared tokens for app surfaces, typography, spacing, and density", () => {
    const tokenSource = readFileSync("src/styles/tokens.css", "utf8");

    for (const token of requiredTokens) {
      expect(tokenSource).toContain(`${token}:`);
    }

    expect(tokenSource).toContain("--otp-card-height: 64px;");
    expect(tokenSource).toContain("--otp-card-height-compact: 60px;");
    expect(tokenSource).toContain("--otp-card-padding-y: 9px;");
    expect(tokenSource).toContain("--otp-card-padding-y-compact: 7px;");
    expect(tokenSource).toContain("--otp-marker-size: 26px;");
    expect(tokenSource).toContain("--otp-marker-size-compact: 24px;");
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

  it("uses semantic status color tokens for warning, success, and danger states", () => {
    const popupStyles = readFileSync("src/popup/styles.css", "utf8");
    const settingsStyles = readFileSync("src/settings/styles.css", "utf8");
    const importStyles = readFileSync("src/import/styles.css", "utf8");

    expect(popupStyles).toContain("background: var(--color-danger-soft);");
    expect(popupStyles).toContain("background: var(--color-warning-dot);");
    expect(popupStyles).toContain("background: var(--color-danger-dot);");
    expect(popupStyles).toContain("background: var(--color-danger-action);");
    expect(popupStyles).toContain("color: var(--color-danger-text);");
    expect(settingsStyles).toContain("background: var(--color-danger-action-soft);");
    expect(settingsStyles).toContain("color: var(--color-danger-text);");
    expect(importStyles).toContain("background: var(--color-info-soft);");
    expect(importStyles).toContain("color: var(--color-info);");
    expect(importStyles).toContain("color: var(--color-danger-text);");
  });

  it("uses OTP density tokens for card spacing, code size, and marker size", () => {
    const popupStyles = readFileSync("src/popup/styles.css", "utf8");
    const entryRowBlock = popupStyles.slice(
      popupStyles.indexOf("\n.entry-row {") + 1,
      popupStyles.indexOf(".density-compact .entry-row {")
    );
    const compactRowBlock = popupStyles.slice(
      popupStyles.indexOf(".density-compact .entry-row {"),
      popupStyles.indexOf(".entry-identity {")
    );
    const codeRowBlock = popupStyles.slice(
      popupStyles.indexOf(".entry-code-row {"),
      popupStyles.indexOf(".density-compact .entry-code-row {")
    );
    const compactCodeRowBlock = popupStyles.slice(
      popupStyles.indexOf(".density-compact .entry-code-row {"),
      popupStyles.indexOf(".service-name,")
    );
    const markerBlock = popupStyles.slice(
      popupStyles.indexOf(".entry-marker {"),
      popupStyles.indexOf(".density-compact .entry-marker {")
    );
    const compactMarkerBlock = popupStyles.slice(
      popupStyles.indexOf(".density-compact .entry-marker {"),
      popupStyles.indexOf(".color-grid {")
    );

    expect(entryRowBlock).toContain("padding: var(--otp-card-padding-y) var(--otp-card-padding-x);");
    expect(entryRowBlock).toContain("row-gap: var(--otp-card-row-gap);");
    expect(entryRowBlock).toContain("column-gap: var(--otp-card-column-gap);");
    expect(compactRowBlock).toContain("padding: var(--otp-card-padding-y-compact) var(--otp-card-padding-x);");
    expect(entryRowBlock).toContain("grid-template-areas:");
    expect(codeRowBlock).toContain("padding: 0;");
    expect(compactCodeRowBlock).toContain("padding-left: 0;");
    expect(popupStyles).toContain("font-size: var(--otp-code-size-compact);");
    expect(markerBlock).toContain("width: var(--otp-marker-size);");
    expect(markerBlock).toContain("font-size: var(--otp-marker-font-size);");
    expect(compactMarkerBlock).toContain("width: var(--otp-marker-size-compact);");
    expect(compactMarkerBlock).toContain("font-size: var(--otp-marker-font-size-compact);");
  });
});
