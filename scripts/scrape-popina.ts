// Télécharge les exports Popina mois par mois (headless)
import { chromium } from 'playwright';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';

config({ path: '.env.local' });
const EMAIL = process.env.POPINA_EMAIL!;
const PASSWORD = process.env.POPINA_PASSWORD!;
if (!EMAIL || !PASSWORD) { console.error('POPINA_EMAIL et POPINA_PASSWORD requis'); process.exit(1); }

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);
const OUT = path.join(__dirname, '../tmp-popina');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const ESTAB = '26798';
const BASE = `https://backoffice.popina.com/fr/dashboard/establishment/${ESTAB}`;

// Générer les mois depuis une date de départ jusqu'à aujourd'hui
function generateMonths(startYear: number, startMonth: number): { from: string; to: string; label: string }[] {
  const months: { from: string; to: string; label: string }[] = [];
  const now = new Date();
  let y = startYear, m = startMonth;
  while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
    const lastDay = new Date(y, m, 0).getDate();
    const from = `${y}-${String(m).padStart(2, '0')}-01`;
    const to = `${y}-${String(m).padStart(2, '0')}-${lastDay}`;
    months.push({ from, to, label: `${y}-${String(m).padStart(2, '0')}` });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

async function main() {
  console.log('Lancement Popina (headless)...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  // Login
  await page.goto('https://backoffice.popina.com/fr/session/index');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('#button_arrow');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);

  if (!page.url().includes('dashboard')) {
    console.error('Login échoué:', page.url());
    await browser.close();
    return;
  }
  console.log('Connecté');

  // Générer les mois — depuis juillet 2023 (date la plus ancienne Foodflow)
  const months = generateMonths(2023, 7);
  console.log(`${months.length} mois à traiter (${months[0].label} → ${months[months.length - 1].label})`);

  let totalFiles = 0;

  for (const { from, to, label } of months) {
    // Aller sur la page statistiques avec les dates
    const url = `${BASE}/statistics?from=${from}&to=${to}`;
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Vérifier qu'on est bien sur la bonne page
    const bodyText = await page.textContent('body') || '';
    if (bodyText.includes("n'existe pas")) {
      console.log(`  ${label}: 404`);
      continue;
    }

    // Télécharger l'export comptable (rapports de caisse)
    try {
      const [dlAccounting] = await Promise.all([
        page.waitForEvent('download', { timeout: 30000 }),
        page.click('#export_accounting_button'),
      ]);
      const accPath = path.join(OUT, `comptable-${label}.xlsx`);
      await dlAccounting.saveAs(accPath);
      console.log(`  ${label} comptable: ok (${fs.statSync(accPath).size} bytes)`);
      totalFiles++;
    } catch (e: any) {
      console.log(`  ${label} comptable: ${e.message.slice(0, 50)}`);
    }

    // Télécharger l'export statistiques (ventes par produit)
    try {
      const [dlStats] = await Promise.all([
        page.waitForEvent('download', { timeout: 30000 }),
        page.click('#export_statistics_button'),
      ]);
      const statsPath = path.join(OUT, `stats-${label}.xlsx`);
      await dlStats.saveAs(statsPath);
      console.log(`  ${label} stats: ok (${fs.statSync(statsPath).size} bytes)`);
      totalFiles++;
    } catch (e: any) {
      console.log(`  ${label} stats: ${e.message.slice(0, 50)}`);
    }

    await page.waitForTimeout(500);
  }

  await browser.close();
  console.log(`\n========================================`);
  console.log(`Fichiers téléchargés: ${totalFiles}`);
  console.log(`Sauvés dans: ${OUT}`);
  console.log('\nÉtape suivante: parser les exports et importer dans Firestore');
}

main().catch(console.error);
