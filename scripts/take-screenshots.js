// scripts/take-screenshots.js — Capturas de demostración (móvil + escritorio).
// Usa Chromium serverless (@sparticuz) + librerías locales extraídas + fontconfig.
process.env.LD_LIBRARY_PATH = '/tmp/pw-libs/lib' + (process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : '');
process.env.FONTCONFIG_FILE = '/tmp/pw-libs/fcroot/fonts.conf';
process.env.FONTCONFIG_PATH = '/tmp/pw-libs/fcroot';

const { chromium } = require('/tmp/pw/node_modules/playwright');
const { spawnSync } = require('child_process');
const fs = require('fs');

const BASE = process.env.APP_URL || 'http://localhost:3103';
const OUT = '/home/node/.openclaw/workspace/finance-docs-wt/README-assets';

// (ruta, nombre archivo)
const PAGES = [
  ['/', 'dashboard'],
  ['/wallets', 'wallets'],
  ['/wallets/1', 'wallet-detail'],
  ['/transactions', 'transactions'],
  ['/exchanges', 'exchanges'],
  ['/rates', 'rates'],
  ['/reports', 'reports'],
  ['/categories', 'categories'],
  ['/settings', 'settings'],
  ['/recurring-payments', 'recurring'],
];

const ARGS = [
  '--headless=old', '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
  '--no-zygote', '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist', '--disable-software-rasterizer', '--run-all-compositor-stages-before-draw',
  '--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none',
  '--disable-background-networking', '--disable-sync', '--no-first-run', '--disable-notifications',
];

async function shot(page, outPath) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(200);
  await page.screenshot({ path: outPath, type: 'jpeg', quality: 82, animations: 'disabled' });
}

async function runView(view) {
  const isM = view === 'mobile';
  const browser = await chromium.launch({
    executablePath: '/tmp/chromium',
    args: ARGS,
    headless: true,
  });
  const ctx = await browser.newContext({
    viewport: isM ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: isM ? 2 : 1,
    isMobile: isM,
    hasTouch: isM,
  });
  const page = await ctx.newPage();
  for (const [url, name] of PAGES) {
    const outPath = `${OUT}/${name}-${view}.jpg`;
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      try {
        await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.waitForTimeout(3200);
        await shot(page, outPath);
        ok = true;
        console.log('saved', `${name}-${view}.jpg`);
      } catch (e) {
        console.log(`retry ${name}-${view} (${attempt}):`, e.message.split('\n')[0]);
        await page.goto('about:blank').catch(() => {});
        await page.waitForTimeout(800);
      }
    }
    if (!ok) console.log('FAILED', `${name}-${view}`);
  }
  await browser.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const view of ['mobile', 'desktop']) {
    console.log(`\n=== VISTA ${view.toUpperCase()} ===`);
    await runView(view);
  }
  console.log('\nCapturas finalizadas ✅');
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
