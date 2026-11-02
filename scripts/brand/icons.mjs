// Renders PNG app icons from the SVG app icon. Run from the project root; needs playwright-core and a local Chrome:
//   CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe" node scripts/brand/icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const src = path.join(root, 'web/public/brand/happyn8-app-icon.svg');
const SIZES = { 'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512 };

const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true });
const page = await browser.newPage();
for (const [name, size] of Object.entries(SIZES)) {
  await page.setViewportSize({ width: size, height: size });
  const svg = fs.readFileSync(src, 'utf8').replace('width="512" height="512"', `width="${size}" height="${size}"`);
  await page.setContent(`<body style="margin:0">${svg}</body>`);
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size }, omitBackground: true });
  for (const dir of ['web/public/brand', 'docs/brand/logos']) fs.writeFileSync(path.join(root, dir, name), png);
}
await browser.close();
console.log(`Wrote ${Object.keys(SIZES).join(', ')}`);
