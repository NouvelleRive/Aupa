// Explore LBA : login, historique, clic sur une facture pour voir le détail
import { chromium } from 'playwright';
import { config } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

config({ path: '.env.local' });
const EMAIL = process.env.LBA_EMAIL!;
const PASSWORD = process.env.LBA_PASSWORD!;

const OUT = path.join(__dirname, '../tmp-lba-pdfs');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  // 1. Login
  console.log('1. Login...');
  await page.goto('https://www.lba-boissons.fr/');
  await page.waitForLoadState('networkidle');
  await page.click('text=Connexion');
  await page.waitForTimeout(2000);
  await page.fill('input[name="email"][type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  const submitBtn = await page.$('button:has-text("Se connecter")');
  if (submitBtn) await submitBtn.click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  console.log('  Connecté');

  // 2. Historique
  console.log('2. Historique...');
  await page.goto('https://www.lba-boissons.fr/profil/mes-commandes');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  // 3. Cliquer sur la première facture (pas "En attente")
  console.log('3. Clic sur première facture...');
  // Essayer de cliquer sur la ligne "Facture n° 26002195"
  const factureRow = await page.$('tr:has-text("Facture n°")');
  if (factureRow) {
    await factureRow.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT, 'facture-detail.png'), fullPage: true });
    console.log('  URL:', page.url());
    console.log('  Screenshot: tmp-lba-pdfs/facture-detail.png');

    // Extraire le contenu du tableau de détail
    const detailTable = await page.$$eval('table tr', (rows) => {
      return rows.map(row => {
        const cells = Array.from(row.querySelectorAll('td, th'));
        return cells.map(cell => (cell.textContent || '').trim().slice(0, 60));
      });
    });
    console.log('\n  Tableau détail (20 premières lignes):');
    for (const row of detailTable.slice(0, 20)) {
      console.log('  ', row.join(' | '));
    }

    // Extraire le HTML brut de la zone principale
    const mainContent = await page.$eval('main, .main-content, .content, #content, body', (el) =>
      el.innerHTML.slice(0, 3000)
    );
    console.log('\n  HTML principal (extrait):', mainContent.slice(0, 2000));
  } else {
    console.log('  Aucune facture trouvée');
  }

  await browser.close();
  console.log('\nDone.');
}

main().catch(console.error);
