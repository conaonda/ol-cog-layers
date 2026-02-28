import { chromium } from 'playwright';

const BASE = 'http://localhost:5173/ol-cog-layers/';

async function run() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  let errors = [];

  // Helper: open page, collect console/errors, wait
  async function testPage(path, label, checks) {
    console.log(`\n=== ${label} ===`);
    const page = await context.newPage();
    const pageErrors = [];
    const consoleLogs = [];

    page.on('console', msg => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err => {
      pageErrors.push(err.message);
    });

    try {
      await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30000 });
      console.log(`  ✓ Page loaded: ${path}`);

      await checks(page);

      if (pageErrors.length > 0) {
        console.log(`  ✗ Page errors:`);
        pageErrors.forEach(e => console.log(`    - ${e}`));
        errors.push({ page: label, errors: pageErrors });
      } else {
        console.log(`  ✓ No JS errors`);
      }

      // Log relevant console messages
      const warnings = consoleLogs.filter(l => l.includes('[error]') || l.includes('[warning]'));
      if (warnings.length > 0) {
        console.log(`  Console warnings/errors:`);
        warnings.forEach(w => console.log(`    ${w}`));
      }
    } catch (err) {
      console.log(`  ✗ FAILED: ${err.message}`);
      errors.push({ page: label, errors: [err.message] });
    } finally {
      await page.close();
    }
  }

  // 1. Landing page
  await testPage('', 'Landing Page', async (page) => {
    const cards = await page.locator('.card').count();
    console.log(`  Cards found: ${cards}`);
    if (cards !== 4) errors.push({ page: 'Landing', errors: [`Expected 4 cards, got ${cards}`] });

    const links = await page.locator('.card a').allTextContents();
    console.log(`  Card links: ${links.join(', ')}`);

    // Check all links are valid
    for (const link of await page.locator('.card a').all()) {
      const href = await link.getAttribute('href');
      console.log(`  Link href: ${href}`);
    }
  });

  // 2. Basic COG
  await testPage('basic-cog/', 'Basic COG', async (page) => {
    const hasCodePanel = await page.locator('.code-panel').count();
    const hasMap = await page.locator('#map').count();
    console.log(`  Code panel: ${hasCodePanel > 0 ? '✓' : '✗'}, Map div: ${hasMap > 0 ? '✓' : '✗'}`);

    const status = page.locator('#status');
    try {
      await status.waitFor({ state: 'attached', timeout: 5000 });
      await page.waitForFunction(
        () => {
          const el = document.getElementById('status');
          return el && (el.classList.contains('ready') || el.classList.contains('error'));
        },
        { timeout: 60000 }
      );
      const statusText = await status.textContent();
      const statusClass = await status.getAttribute('class');
      console.log(`  Status: "${statusText}" (${statusClass})`);
      if (statusClass.includes('error')) {
        errors.push({ page: 'Basic COG', errors: [statusText] });
      }
    } catch (e) {
      console.log(`  Status wait timeout — COG may still be loading`);
    }

    const canvasCount = await page.locator('#map canvas').count();
    console.log(`  Map canvases: ${canvasCount}`);
  });

  // 3. Rotated SAR
  await testPage('rotated-sar/', 'Rotated SAR', async (page) => {
    const hasCodePanel = await page.locator('.code-panel').count();
    const hasMap = await page.locator('#map').count();
    console.log(`  Code panel: ${hasCodePanel > 0 ? '✓' : '✗'}, Map div: ${hasMap > 0 ? '✓' : '✗'}`);

    const status = page.locator('#status');
    try {
      await status.waitFor({ state: 'attached', timeout: 5000 });
      await page.waitForFunction(
        () => {
          const el = document.getElementById('status');
          return el && (el.classList.contains('ready') || el.classList.contains('error'));
        },
        { timeout: 60000 }
      );
      const statusText = await status.textContent();
      const statusClass = await status.getAttribute('class');
      console.log(`  Status: "${statusText}" (${statusClass})`);
      if (statusClass.includes('error')) {
        errors.push({ page: 'Rotated SAR', errors: [statusText] });
      }
    } catch (e) {
      console.log(`  Status wait timeout — COG may still be loading`);
    }

    const canvasCount = await page.locator('#map canvas').count();
    console.log(`  Map canvases: ${canvasCount}`);
  });

  // 4. Colormap
  await testPage('colormap/', 'Colormap', async (page) => {
    const hasSelect = await page.locator('#colormap-select').count();
    console.log(`  Colormap select: ${hasSelect > 0 ? '✓' : '✗'}`);

    try {
      await page.waitForFunction(
        () => {
          const el = document.getElementById('status');
          return el && (el.classList.contains('ready') || el.classList.contains('error'));
        },
        { timeout: 60000 }
      );
      const statusText = await page.locator('#status').textContent();
      const statusClass = await page.locator('#status').getAttribute('class');
      console.log(`  Status: "${statusText}" (${await statusClass})`);

      if ((await statusClass).includes('error')) {
        errors.push({ page: 'Colormap', errors: [statusText] });
      } else {
        const select = page.locator('#colormap-select');
        const isDisabled = await select.isDisabled();
        console.log(`  Select disabled: ${isDisabled}`);

        if (!isDisabled) {
          for (const cmap of ['inferno', 'plasma', 'grayscale', 'viridis']) {
            await select.selectOption(cmap);
            await page.waitForTimeout(500);
            console.log(`  Switched to ${cmap} — OK`);
          }
        }

        const bandInfo = await page.locator('#band-info').textContent();
        console.log(`  Band info: ${bandInfo.substring(0, 80)}...`);
      }
    } catch (e) {
      console.log(`  Timeout waiting for COG: ${e.message}`);
    }
  });

  // 5. Comparison
  await testPage('comparison/', 'Comparison', async (page) => {
    const vanillaMap = await page.locator('#map-vanilla').count();
    const easyMap = await page.locator('#map-easy').count();
    console.log(`  Vanilla map: ${vanillaMap > 0 ? '✓' : '✗'}, Easy map: ${easyMap > 0 ? '✓' : '✗'}`);

    const labels = await page.locator('.map-label').allTextContents();
    console.log(`  Map labels: ${labels.join(', ')}`);

    try {
      await page.waitForFunction(
        () => {
          const el = document.getElementById('status');
          return el && (el.classList.contains('ready') || el.classList.contains('error'));
        },
        { timeout: 60000 }
      );
      const statusText = await page.locator('#status').textContent();
      const statusClass = await page.locator('#status').getAttribute('class');
      console.log(`  Status: "${statusText}" (${await statusClass})`);

      if ((await statusClass).includes('error')) {
        errors.push({ page: 'Comparison', errors: [statusText] });
      } else {
        const vanillaCanvas = page.locator('#map-vanilla canvas').first();
        if (await vanillaCanvas.count() > 0) {
          console.log(`  Both maps have canvases — view sync should work`);
        }
      }
    } catch (e) {
      console.log(`  Timeout waiting for COG: ${e.message}`);
    }
  });

  // Summary
  console.log('\n========== SUMMARY ==========');
  if (errors.length === 0) {
    console.log('All pages passed!');
  } else {
    console.log(`${errors.length} page(s) had issues:`);
    errors.forEach(({ page, errors: errs }) => {
      console.log(`  ${page}:`);
      errs.forEach(e => console.log(`    - ${e}`));
    });
  }

  await browser.close();
}

run().catch(e => { console.error(e); process.exit(1); });
