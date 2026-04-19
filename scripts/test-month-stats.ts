// Test : scrape un mois entier via export statistiques, affiche le total TTC sans écrire en base
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import XLSX from 'xlsx';

config({ path: '.env.local' });

const ESTAB = '26798';
const BASE = `https://backoffice.popina.com/fr/dashboard/establishment/${ESTAB}`;
const OUT = path.join(__dirname, '../tmp-popina-daily');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const CATEGORIES_POPINA = new Set([
  'plats', 'bol', 'croger', 'salade', 'boissons froides', 'aperitifs digestifs',
  'biere', 'cocktail', 'maison iced', 'soft eau', 'vin', 'entrees',
  'sides et tapas', 'grignotte', 'side', 'desserts', 'tous', 'boissons chaudes',
  'classic hot drinks', 'crazy hot drinks', 'none', 'supplements', 'au restau',
  'parent category menu png', 'dont menus', 'brunch',
  'aupa croissant burger eat', 'formule midi', 'gouter',
  'total', 'merch',
]);

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function toPopinaDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function generateDaysForMonth(yearMonth: string): string[] {
  const [y, m] = yearMonth.split('-').map(Number);
  const days: string[] = [];
  const d = new Date(y, m - 1, 1, 12); // midi pour éviter le décalage UTC
  while (d.getMonth() === m - 1) {
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    days.push(`${yy}-${mm}-${dd}`);
    d.setDate(d.getDate() + 1);
  }
  return days;
}

async function main() {
  const month = process.argv[2] || '2025-10';
  const days = generateDaysForMonth(month);
  console.log(`Test export statistiques pour ${month} (${days.length} jours)\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  console.log('Login...');
  await page.goto('https://backoffice.popina.com/fr/session/index');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  await page.fill('#email', process.env.POPINA_EMAIL!);
  await page.fill('#password', process.env.POPINA_PASSWORD!);
  await page.click('#button_arrow');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);

  if (!page.url().includes('dashboard')) {
    console.error('Login échoué:', page.url());
    await browser.close();
    return;
  }
  console.log('Connecté\n');

  await page.goto(`${BASE}/statistics`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);

  let grandTotalTTC = 0;
  let grandTotalArticles = 0;
  let joursAvecDonnees = 0;

  for (const day of days) {
    const popDate = toPopinaDate(day);
    await page.evaluate((d: string) => {
      const start = document.getElementById('date_start') as HTMLInputElement;
      const end = document.getElementById('date_end') as HTMLInputElement;
      if (start && end) {
        start.value = d;
        end.value = d;
        start.dispatchEvent(new Event('input', { bubbles: true }));
        start.dispatchEvent(new Event('change', { bubbles: true }));
        end.dispatchEvent(new Event('input', { bubbles: true }));
        end.dispatchEvent(new Event('change', { bubbles: true }));
        const form = start.closest('form');
        if (form) form.submit();
      }
    }, popDate);

    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(3000);

    // Forcer toutes les checkboxes catégories à cochées
    await page.evaluate(() => {
      document.querySelectorAll<HTMLInputElement>('input[name="macro_names[]"]').forEach(cb => {
        if (!cb.checked) {
          cb.checked = true;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
          cb.click();
        }
      });
    });
    await page.waitForTimeout(1000);

    const filePath = path.join(OUT, `test-month-${day}.xlsx`);
    try {
      const [dl] = await Promise.all([
        page.waitForEvent('download', { timeout: 15000 }),
        page.click('#export_statistics_button'),
      ]);
      await dl.saveAs(filePath);
    } catch {
      console.log(`  ${day}: pas de données`);
      continue;
    }

    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { raw: true }) as any[];

    let dayTTC = 0;
    let dayArticles = 0;
    for (const row of rows) {
      const nom = row['name'];
      const quantity = row['quantity'];
      const ttc = row['TTC'];
      if (!nom || !quantity || quantity <= 0 || !ttc || ttc <= 0) continue;
      if (CATEGORIES_POPINA.has(normalize(nom))) continue;
      dayTTC += ttc;
      dayArticles += quantity;
    }

    grandTotalTTC += dayTTC;
    grandTotalArticles += dayArticles;
    joursAvecDonnees++;
    console.log(`  ${day}: ${dayArticles} articles, ${dayTTC.toFixed(2)} € TTC`);

    fs.unlinkSync(filePath);
    await page.waitForTimeout(500);
  }

  await browser.close();
  console.log(`\n========================================`);
  console.log(`${month} — ${joursAvecDonnees} jours avec données`);
  console.log(`Total articles: ${grandTotalArticles}`);
  console.log(`Total TTC: ${grandTotalTTC.toFixed(2)} €`);
  console.log(`========================================`);
}

main().catch(console.error);
