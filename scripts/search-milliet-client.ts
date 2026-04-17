import { chromium } from 'playwright';
import * as path from 'path';

const SEARCHES = ['armagnac', 'creme cassis', 'tequila', 'cranberry', 'goyave', 'jus pomme', 'jus tomate', 'sirop citrouille', 'vin rouge BIB'];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  console.log('Connexion client.milliet.fr...');
  await page.goto('https://client.milliet.fr/Login.aspx');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await page.fill('#TextBoxUser', '30013');
  await page.fill('#TextBoxPassword', 'TNE9431');
  await page.click('#ButtonLogin');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  console.log('Connecté !\n');

  for (const search of SEARCHES) {
    console.log(`\n=== ${search} ===`);
    await page.goto(`https://client.milliet.fr/ProduitRecherche.aspx?Google=${encodeURIComponent(search)}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const text = await page.evaluate(() => (document.body as HTMLElement).innerText);
    const lines: string[] = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);

    // Afficher les lignes pertinentes (avec prix, noms de produits)
    for (const line of lines) {
      if (line.includes('€') || line.match(/\d+[.,]\d+/) || line.match(/^\d{4,}/) || line.includes('HT')) {
        console.log(line);
      }
    }

    // Si rien trouvé, afficher le contenu
    if (!lines.some((l: string) => l.includes('€') || l.match(/\d+[.,]\d+/))) {
      for (const line of lines.slice(0, 30)) {
        console.log(line);
      }
    }
  }

  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });
