// Debug : scrape UN jour via export statistiques et affiche toutes les lignes brutes
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

function toPopinaDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

async function main() {
  const day = process.argv[2] || '2025-10-04'; // samedi, bon CA
  console.log(`Debug export statistiques pour ${day}\n`);

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
  console.log('Connecté\n');

  await page.goto(`${BASE}/statistics`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);

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

  // Screenshot pour vérifier visuellement
  await page.screenshot({ path: path.join(OUT, `debug-${day}.png`), fullPage: true });

  // Lire le total affiché sur la page
  const pageTotal = await page.evaluate(() => {
    const el = document.querySelector('.statistics-products .total') ||
               document.querySelector('[class*="total"]');
    return el ? el.textContent : 'non trouvé';
  });
  console.log('Total affiché sur la page:', pageTotal);

  const filePath = path.join(OUT, `debug-${day}.xlsx`);
  try {
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      page.click('#export_statistics_button'),
    ]);
    await dl.saveAs(filePath);
  } catch (e: any) {
    console.error('Erreur téléchargement:', e.message);
    await browser.close();
    return;
  }

  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { raw: true }) as any[];
  console.log(`\n${rows.length} lignes dans l'export\n`);

  // Afficher toutes les valeurs uniques de 'parent'
  const parents = new Set<string>();
  for (const r of rows) parents.add(r['parent'] || '');
  console.log('=== Parents (catégories) dans l\'export ===');
  for (const p of parents) console.log(`  "${p}"`);

  // Chercher les lignes delivery
  console.log('\n=== Lignes avec parent delivery ===');
  let deliveryTTC = 0;
  for (const r of rows) {
    const parent = (r['parent'] || '').toLowerCase();
    if (parent.includes('deliveroo') || parent.includes('eat') || parent.includes('delivery') || parent.includes('uber')) {
      console.log(`  ${r['parent']} | ${r['name']} | qty=${r['quantity']} | TTC=${r['TTC']}`);
      deliveryTTC += r['TTC'] || 0;
    }
  }
  console.log(`Total delivery TTC: ${deliveryTTC.toFixed(2)}`);

  // Total brut
  let totalTTC = 0;
  for (const r of rows) totalTTC += r['TTC'] || 0;
  console.log(`\nTotal TTC brut (toutes lignes): ${totalTTC.toFixed(2)}`);

  await browser.close();
}

main().catch(console.error);
