import { chromium } from "playwright";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const brainstormDir = join(__dirname, "../.superpowers/brainstorm/33807-1776584306");
const outputDir = join(__dirname, "../public/webstore-screenshots");

const variants = [
  { file: "store-final-popup.html",      out: "screenshot-01-otp-codes.png" },
  { file: "store-final-import.html",     out: "screenshot-02-add-account.png" },
  { file: "store-final-protection.html", out: "screenshot-03-password-protection.png" },
  { file: "store-final-backup.html",     out: "screenshot-04-backup-restore.png" }
];

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

for (const variant of variants) {
  const url = pathToFileURL(join(brainstormDir, variant.file)).href;
  console.log(`Capturing: ${variant.file} → ${variant.out}`);

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);

  const outputPath = join(outputDir, variant.out);
  await page.screenshot({ path: outputPath, fullPage: false });
  console.log(`  Saved: ${outputPath}`);
}

await browser.close();
console.log("\nAll screenshots captured.");
