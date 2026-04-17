import { chromium } from 'playwright';
import { config } from 'dotenv';
import * as path from 'path';

config({ path: '.env.local' });
const EMAIL = process.env.FOODFLOW_EMAIL!;
const PASSWORD = process.env.FOODFLOW_PASSWORD!;

const SEARCHES = ['epinard', 'potimarron', 'parmesan'];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Login
  console.log('Connexion Foodflow...');
  await page.goto('https://foodflow.com/shop/mon-compte');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  const connectBtn = page.locator('button', { hasText: 'Se connecter' });
  if (await connectBtn.isVisible()) await connectBtn.click();
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  console.log('Connecté !\n');

  for (const search of SEARCHES) {
    console.log(`\n=== Recherche: ${search} ===`);
    await page.goto(`https://foodflow.com/shop/recherche?q=${encodeURIComponent(search)}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    await page.screenshot({ path: path.join(__dirname, `../tmp-foodflow-${search}.png`), fullPage: false });

    const text = await page.evaluate(() => {
      const main = document.querySelector('main') || document.body;
      return main.innerText;
    });

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    for (const line of lines) {
      console.log(line);
    }
  }

  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });
