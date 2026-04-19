// Test : exporter un mois ENTIER en un seul export statistiques
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

async function main() {
  const month = process.argv[2] || '2025-10';
  const [y, m] = month.split('-');
  const lastDay = new Date(+y, +m, 0).getDate();
  const from = `01.${m}.${y}`;
  const to = `${lastDay}.${m}.${y}`;

  console.log(`Export mois complet: ${from} → ${to}\n`);

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

  // Set dates pour le mois entier
  await page.evaluate(({ from, to }: { from: string; to: string }) => {
    const start = document.getElementById('date_start') as HTMLInputElement;
    const end = document.getElementById('date_end') as HTMLInputElement;
    if (start && end) {
      start.value = from;
      end.value = to;
      start.dispatchEvent(new Event('input', { bubbles: true }));
      start.dispatchEvent(new Event('change', { bubbles: true }));
      end.dispatchEvent(new Event('input', { bubbles: true }));
      end.dispatchEvent(new Event('change', { bubbles: true }));
      const form = start.closest('form');
      if (form) form.submit();
    }
  }, { from, to });

  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(5000);

  // Forcer toutes les checkboxes
  const cbCount = await page.evaluate(() => {
    let count = 0;
    document.querySelectorAll<HTMLInputElement>('input[name="macro_names[]"]').forEach(cb => {
      if (!cb.checked) {
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
        cb.click();
        count++;
      }
    });
    return count;
  });
  if (cbCount > 0) {
    console.log(`${cbCount} checkboxes forcées à cochées`);
    await page.waitForTimeout(2000);
  }

  // Screenshot
  await page.screenshot({ path: path.join(OUT, `month-${month}.png`), fullPage: true });

  // Télécharger export statistiques
  const filePath = path.join(OUT, `month-${month}.xlsx`);
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.click('#export_statistics_button'),
  ]);
  await dl.saveAs(filePath);
  console.log(`Export: ${fs.statSync(filePath).size} bytes\n`);

  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { raw: true }) as any[];
  console.log(`${rows.length} lignes dans l'export\n`);

  // Parents uniques
  const parents = new Map<string, number>();
  for (const r of rows) {
    const p = r['parent'] || '(vide)';
    parents.set(p, (parents.get(p) || 0) + (r['TTC'] || 0));
  }
  console.log('=== TTC par parent (catégorie) ===');
  for (const [p, ttc] of [...parents].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${p.padEnd(50)} ${ttc.toFixed(2)} €`);
  }

  // Total brut (avant filtre)
  let totalBrut = 0;
  for (const r of rows) totalBrut += r['TTC'] || 0;
  console.log(`\nTotal TTC brut: ${totalBrut.toFixed(2)} €`);

  // Total filtré (après CATEGORIES_POPINA)
  let totalFiltre = 0;
  let filtered = 0;
  for (const r of rows) {
    const nom = r['name'];
    const ttc = r['TTC'];
    if (!nom || !ttc) continue;
    if (CATEGORIES_POPINA.has(normalize(nom))) { filtered++; continue; }
    totalFiltre += ttc;
  }
  console.log(`Total TTC filtré: ${totalFiltre.toFixed(2)} € (${filtered} lignes filtrées)`);
  console.log(`\nPopina affiche: 78 571,31 € pour oct 2025`);

  await browser.close();
}

main().catch(console.error);
