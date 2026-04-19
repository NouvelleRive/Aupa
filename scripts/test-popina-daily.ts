// Test : scrape 1 seul jour Popina pour valider le format
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
]);

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function main() {
  const day = '2026-04-15';

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
  console.log('Connecté');

  const url = `${BASE}/statistics?from=${day}&to=${day}`;
  console.log(`\nNavigation: ${url}`);
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  const statsPath = path.join(OUT, `test-${day}.xlsx`);
  try {
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      page.click('#export_statistics_button'),
    ]);
    await dl.saveAs(statsPath);
    console.log(`Fichier: ${statsPath} (${fs.statSync(statsPath).size} bytes)`);
  } catch (e: any) {
    console.error('Erreur téléchargement:', e.message);
    await browser.close();
    return;
  }

  // Parser
  const wb = XLSX.readFile(statsPath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { raw: true }) as any[];
  console.log(`\n${rows.length} lignes brutes`);

  let articles = 0;
  for (const row of rows) {
    const nom = row['name'];
    const quantity = row['quantity'];
    const ttc = row['TTC'];
    if (!nom || !quantity || quantity <= 0 || !ttc || ttc <= 0) continue;
    if (CATEGORIES_POPINA.has(normalize(nom))) continue;
    console.log(`  ${nom} | qté=${quantity} | TTC=${ttc}`);
    articles++;
  }
  console.log(`\n${articles} articles valides pour ${day}`);

  await browser.close();
}

main().catch(console.error);
