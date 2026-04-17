import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';

config({ path: '.env.local' });

const EMAIL = process.env.POPINA_EMAIL!;
const PASSWORD = process.env.POPINA_PASSWORD!;

const OUT = path.join(__dirname, '../tmp-popina');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Essayer la page d'accueil du backoffice — elle redirigera vers le login
  console.log('Navigation vers Popina backoffice...');
  await page.goto('https://backoffice.popina.com');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);

  console.log('URL:', page.url());
  await page.screenshot({ path: path.join(OUT, '1-home.png'), fullPage: true });

  // Lister les inputs
  const inputs = await page.$$eval('input', (els: any[]) =>
    els.map((el: any) => ({ type: el.type, name: el.name, id: el.id, placeholder: el.placeholder }))
  );
  console.log('Inputs:', JSON.stringify(inputs, null, 2));

  // Lister les liens
  const links = await page.$$eval('a', (els: any[]) =>
    els.map((a: any) => ({ href: a.href, text: (a.textContent || '').trim().slice(0, 50) }))
  );
  console.log('Liens:', JSON.stringify(links.slice(0, 15), null, 2));

  // Essayer aussi l'URL directe du dashboard — elle va sûrement forcer un login
  await page.goto('https://backoffice.popina.com/fr/dashboard/establishment/26798/settings');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);

  console.log('\nURL après redirect:', page.url());
  await page.screenshot({ path: path.join(OUT, '2-redirect.png'), fullPage: true });

  const inputs2 = await page.$$eval('input', (els: any[]) =>
    els.map((el: any) => ({ type: el.type, name: el.name, id: el.id, placeholder: el.placeholder }))
  );
  console.log('Inputs:', JSON.stringify(inputs2, null, 2));

  // Essayer aussi d'autres URLs possibles
  for (const url of [
    'https://backoffice.popina.com/login',
    'https://backoffice.popina.com/fr/auth/login',
    'https://backoffice.popina.com/auth/login',
    'https://backoffice.popina.com/fr/sign-in',
  ]) {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    const hasInputs = await page.$$eval('input', (els: any[]) => els.length);
    console.log(`${url} → ${page.url()} (${hasInputs} inputs)`);
  }

  await browser.close();
  console.log('\nDone');
}

main().catch(console.error);
