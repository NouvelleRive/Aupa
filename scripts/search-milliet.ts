import { chromium } from 'playwright';
import * as path from 'path';

const SEARCHES = ['armagnac', 'creme de cassis', 'tequila', 'jus cranberry', 'jus goyave', 'jus pomme', 'jus tomate', 'sirop citrouille', 'vin rouge cubi'];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Login via ACCÈS CLIENT
  console.log('Connexion catalogue.milliet.fr...');
  await page.goto('https://catalogue.milliet.fr/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Cliquer sur "ACCÈS CLIENT" pour ouvrir le formulaire
  const accesBtn = page.locator('a, button', { hasText: /ACC[ÈE]S CLIENT/i }).first();
  console.log('Bouton ACCÈS CLIENT visible:', await accesBtn.isVisible());
  if (await accesBtn.isVisible()) {
    await accesBtn.click();
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: path.join(__dirname, '../tmp-milliet-after-click.png'), fullPage: false });

  // Lister tous les inputs visibles maintenant
  const visibleInputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).filter(i => {
      const rect = i.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }).map(i => ({ name: i.name, type: i.type, id: i.id, placeholder: i.placeholder }));
  });
  console.log('Inputs visibles:', JSON.stringify(visibleInputs, null, 2));

  // Essayer de remplir si visible
  const usernameInput = page.locator('#form-login-username');
  if (await usernameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await usernameInput.fill('30013');
    await page.fill('#form-login-password', 'TNE9431');
    await page.keyboard.press('Enter');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
  } else {
    console.log('Login form pas visible, on continue sans login');
  }

  const currentUrl = page.url();
  console.log('URL:', currentUrl);
  await page.screenshot({ path: path.join(__dirname, '../tmp-milliet-loggedin.png'), fullPage: false });

  for (const search of SEARCHES) {
    console.log(`\n=== ${search} ===`);
    // Magento search URL pattern
    await page.goto(`https://catalogue.milliet.fr/catalogsearch/result/?q=${encodeURIComponent(search)}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const text = await page.evaluate(() => {
      const main = document.querySelector('main, .main, #maincontent, .columns') as HTMLElement | null;
      return (main || document.body).innerText;
    });

    const lines: string[] = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
    for (const line of lines) {
      if (line.includes('€') || line.match(/\d+[.,]\d+\s*€/)) {
        console.log(line);
      }
    }

    // Si pas de résultats avec €, afficher tout
    if (!lines.some((l: string) => l.includes('€'))) {
      for (const line of lines.slice(0, 20)) {
        console.log(line);
      }
    }
  }

  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });
