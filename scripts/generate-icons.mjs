// Gera os PNGs de ícone (public/icon/*.png) e o promo tile (store/promo-440x280.png)
// a partir de assets/icon.svg e assets/promo.html, usando o Chromium do Playwright.
import { chromium } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = await readFile(path.join(root, 'assets/icon.svg'), 'utf8');
const SIZES = [16, 32, 48, 128];

await mkdir(path.join(root, 'public/icon'), { recursive: true });
await mkdir(path.join(root, 'store'), { recursive: true });

const browser = await chromium.launch();
try {
  for (const size of SIZES) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const sized = svg.replace(/<svg /, `<svg width="${size}" height="${size}" `);
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:transparent">${sized}</body></html>`,
    );
    await page.screenshot({
      path: path.join(root, `public/icon/${size}.png`),
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size },
    });
    await page.close();
  }

  const promo = await browser.newPage({ viewport: { width: 440, height: 280 } });
  await promo.goto(pathToFileURL(path.join(root, 'assets/promo.html')).href);
  await promo.screenshot({ path: path.join(root, 'store/promo-440x280.png') });
  await promo.close();
} finally {
  await browser.close();
}
console.log('Ícones e promo tile gerados.');
